import { Pool } from 'pg';
import { sendEmailNotification } from './email';
import { parseTimeToMinutes } from './attendanceReport';
import { getEmailSendingSettings, getHolidaySettings, getShiftSettings } from './settingsManager';
import { supabaseServer } from './supabaseServerClient';

const TIME_ZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';
const LOG_TABLE = 'lms_missing_punch_out_email_log';
const PUNCH_TIME_UTC_SQL = `CASE
  WHEN pg_typeof(a.punch_time) = 'timestamp with time zone'::regtype THEN a.punch_time
  ELSE a.punch_time AT TIME ZONE $4
END`;

interface PunchRecord {
  employeeCode: string;
  payrollName: string;
  payrollEmail: string;
  punchTime: Date;
  punchState: string;
}

interface EmployeeContact {
  code: string;
  name: string;
  email: string;
}

let payrollPool: Pool | null = null;
let reminderInterval: NodeJS.Timeout | null = null;
let isReminderRunning = false;
let lastSuccessfulRunDate: string | null = null;
let lastAttemptAt = 0;

function getPayrollPool(): Pool {
  const connectionString = process.env.PAYROLL_DATABASE_URL;
  if (!connectionString) {
    throw new Error('PAYROLL_DATABASE_URL is not configured');
  }
  if (!payrollPool) {
    payrollPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30000,
    });
  }
  return payrollPool;
}

function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function shiftDate(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function getLocalMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0');
  return hour * 60 + minute;
}

function getLocalDateTime(date: Date, timeZone: string): { date: string; minutes: number } {
  return { date: dateInTimeZone(date, timeZone), minutes: getLocalMinutes(date, timeZone) };
}

function getPunchDate(punchTime: Date): string {
  return dateInTimeZone(punchTime, TIME_ZONE);
}

function classifyPunchState(state: string): 'in' | 'out' | 'unknown' {
  const normalized = state.trim().toUpperCase().replace(/[_-]+/g, ' ');
  if (['IN', 'PUNCH IN', 'CHECK IN', 'CHECKIN'].includes(normalized)) return 'in';
  if (['OUT', 'PUNCH OUT', 'CHECK OUT', 'CHECKOUT'].includes(normalized)) return 'out';
  return 'unknown';
}

function findUnmatchedPunchIn(punches: PunchRecord[], attendanceDate: string): PunchRecord | null {
  const seenPunches = new Set<string>();
  const uniquePunches = punches.filter((punch) => {
    const state = punch.punchState.trim().toUpperCase();
    const timestamp = ['IN', 'OUT'].includes(state)
      ? punch.punchTime.getTime()
      : Math.floor(punch.punchTime.getTime() / 60000);
    const key = `${timestamp}|${state}`;
    if (seenPunches.has(key)) return false;
    seenPunches.add(key);
    return true;
  });
  const datePunches = uniquePunches.filter((punch) => getPunchDate(punch.punchTime) === attendanceDate);
  if (datePunches.length === 0) return null;

  const recognizedStates = uniquePunches.map((punch) => classifyPunchState(punch.punchState));
  if (recognizedStates.every((state) => state !== 'unknown')) {
    let openPunch: PunchRecord | null = null;
    for (let index = 0; index < uniquePunches.length; index += 1) {
      const punch = uniquePunches[index];
      const state = recognizedStates[index];
      if (state === 'in' && !openPunch) openPunch = punch;
      else if (state === 'out' && openPunch) openPunch = null;
    }
    return openPunch && getPunchDate(openPunch.punchTime) === attendanceDate ? openPunch : null;
  }

  // Payroll's numeric punch_state values are direction-device specific. Match
  // the existing attendance report's first/last punch pairing instead.
  const followingDate = shiftDate(attendanceDate, 1);
  const hasOvernightPunchOut = uniquePunches.some((punch) => getPunchDate(punch.punchTime) === followingDate);
  return datePunches.length === 1 && !hasOvernightPunchOut ? datePunches[0] : null;
}

function formatAttendanceDate(date: string): string {
  const parsedDate = new Date(`${date}T12:00:00.000Z`);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(parsedDate);
}

function formatPunchTime(punchTime: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(punchTime);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}

function generateReminderEmail(employee: EmployeeContact, date: string, punchIn: string): string {
  const name = escapeHtml(employee.name);
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #334155; line-height: 1.6;">
      <p>Dear ${name},</p>
      <p>Our attendance records indicate that your Punch-In was recorded, but your Punch-Out entry is missing for the following date.</p>
      <p><strong>Attendance Details:</strong></p>
      <ul>
        <li><strong>Employee Name:</strong> ${name}</li>
        <li><strong>Employee ID:</strong> ${escapeHtml(employee.code)}</li>
        <li><strong>Attendance Date:</strong> ${escapeHtml(formatAttendanceDate(date))}</li>
        <li><strong>Punch-In Time:</strong> ${escapeHtml(punchIn)}</li>
        <li><strong>Punch-Out Time:</strong> Not Recorded</li>
      </ul>
      <p>Please verify your attendance record and contact HR if you have missed recording your Punch-Out.</p>
      <p>Kindly ensure that your daily Punch-In and Punch-Out records are completed correctly.</p>
      <p>Regards,<br>Software Team</p>
    </div>
  `;
}

async function ensureLogTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${LOG_TABLE} (
      attendance_date DATE NOT NULL,
      employee_code TEXT NOT NULL,
      employee_email TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      punch_in_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('processing', 'sent')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ,
      PRIMARY KEY (attendance_date, employee_code)
    )
  `);
}

async function getEmployeeContacts(): Promise<Map<string, EmployeeContact>> {
  if (!supabaseServer) {
    throw new Error('Supabase server client is not available');
  }

  const { data, error } = await supabaseServer
    .from('users')
    .select('user_id, username, email, role, is_active');
  if (error) {
    throw new Error(`Could not load employee email addresses: ${error.message}`);
  }

  const { data: employees, error: employeesError } = await supabaseServer
    .from('employees')
    .select('*');

  const namesByCode = new Map<string, string>();
  const contacts = new Map<string, EmployeeContact>();
  if (employeesError) {
    console.warn(`[MISSING-PUNCH-OUT] Could not load employee names; using username fallback: ${employeesError.message}`);
  } else {
    (employees || []).forEach((employee: any) => {
      const code = (employee.employee_code || '').trim().toUpperCase();
      const name = (employee.name || '').trim();
      if (code && name) namesByCode.set(code, name);
      if (!code || employee.is_active === false) return;
      const email = [
        employee.email,
        employee.email_address,
        employee.official_email,
        employee.work_email,
        employee.company_email,
      ].find((value) => typeof value === 'string' && value.trim());
      if (email) {
        contacts.set(code, { code, name: name || code, email: email.trim() });
      }
    });
  }

  (data || []).forEach((user: any) => {
    if ((user.role || '').trim().toLowerCase() !== 'employee') return;
    const userId = (user.user_id || '').trim().toUpperCase();
    const username = (user.username || '').trim().toUpperCase();
    const code = userId || username;
    if (!code) return;
    if (user.is_active === false) {
      contacts.delete(userId);
      contacts.delete(username);
      return;
    }

    const existing = contacts.get(userId) || contacts.get(username);
    const email = (user.email || '').trim() || existing?.email || '';
    if (!email) return;

    const contact: EmployeeContact = {
      code,
      name: namesByCode.get(userId) || namesByCode.get(username) ||
        existing?.name || (user.username || code).trim(),
      email,
    };
    contacts.set(code, contact);
    if (userId) contacts.set(userId, contact);
    if (username) contacts.set(username, contact);
  });
  return contacts;
}

function shouldDeferForOvernightShift(
  employeeCode: string,
  attendanceDate: string,
  now: Date,
  shifts: Awaited<ReturnType<typeof getShiftSettings>>,
): boolean {
  const shiftId = shifts.employeeShifts[employeeCode] || shifts.defaultShiftId;
  const shift = shifts.shifts.find((item) => item.id === shiftId);
  if (!shift) return false;

  const start = parseTimeToMinutes(shift.startTime);
  const end = parseTimeToMinutes(shift.endTime);
  if (start <= end) return false;

  const endOnNextDate = shiftDate(attendanceDate, 1);
  const current = getLocalDateTime(now, TIME_ZONE);
  if (current.date < endOnNextDate) return true;
  if (current.date > endOnNextDate) return false;
  return current.minutes < end + (shift.graceMinutes || 0);
}

function getPunchesForAttendanceDate(
  punches: PunchRecord[],
  employeeCode: string,
  attendanceDate: string,
  now: Date,
  shifts: Awaited<ReturnType<typeof getShiftSettings>>,
): PunchRecord[] {
  const shiftId = shifts.employeeShifts[employeeCode] || shifts.defaultShiftId;
  const shift = shifts.shifts.find((item) => item.id === shiftId);
  if (!shift) {
    return punches.filter((punch) => getPunchDate(punch.punchTime) === attendanceDate);
  }

  const start = parseTimeToMinutes(shift.startTime);
  const end = parseTimeToMinutes(shift.endTime);
  const overnight = start > end;
  const followingDate = shiftDate(attendanceDate, 1);
  const latestOvernightPunch = end + (shift.graceMinutes || 0);

  return punches.filter((punch) => {
    const punchDateTime = getLocalDateTime(punch.punchTime, TIME_ZONE);
    if (punchDateTime.date === attendanceDate) return true;
    if (!overnight || punchDateTime.date !== followingDate) return false;
    return punchDateTime.minutes <= latestOvernightPunch && punch.punchTime <= now;
  });
}

async function sendReminder(
  pool: Pool,
  employee: EmployeeContact,
  attendanceDate: string,
  punchIn: PunchRecord,
): Promise<'sent' | 'duplicate' | 'failed'> {
  const claim = await pool.query(
    `INSERT INTO ${LOG_TABLE}
      (attendance_date, employee_code, employee_email, employee_name, punch_in_at, status)
     VALUES ($1, $2, $3, $4, $5, 'processing')
     ON CONFLICT (attendance_date, employee_code) DO NOTHING
     RETURNING employee_code`,
    [attendanceDate, employee.code, employee.email, employee.name, punchIn.punchTime],
  );
  if (claim.rowCount !== 1) return 'duplicate';

  const formattedDate = formatAttendanceDate(attendanceDate);
  let acceptedByProvider = false;
  try {
    const sent = await sendEmailNotification({
      to: [employee.email],
      subject: `Reminder – Missing Punch-Out Record for ${formattedDate}`,
      html: generateReminderEmail(employee, attendanceDate, formatPunchTime(punchIn.punchTime)),
      type: 'missing_punch_out',
    });

    if (!sent) {
      await pool.query(
        `DELETE FROM ${LOG_TABLE} WHERE attendance_date = $1 AND employee_code = $2 AND status = 'processing'`,
        [attendanceDate, employee.code],
      );
      return 'failed';
    }

    acceptedByProvider = true;
    await pool.query(
      `UPDATE ${LOG_TABLE} SET status = 'sent', sent_at = NOW()
       WHERE attendance_date = $1 AND employee_code = $2 AND status = 'processing'`,
      [attendanceDate, employee.code],
    );
    return 'sent';
  } catch (error) {
    if (!acceptedByProvider) {
      await pool.query(
        `DELETE FROM ${LOG_TABLE} WHERE attendance_date = $1 AND employee_code = $2 AND status = 'processing'`,
        [attendanceDate, employee.code],
      );
    }
    throw error;
  }
}

export async function checkAndSendMissingPunchOutReminders(now = new Date()): Promise<{ sent: number; checked: number }> {
  if (isReminderRunning) return { sent: 0, checked: 0 };
  isReminderRunning = true;

  try {
    const today = dateInTimeZone(now, TIME_ZONE);
    const targetDates = [shiftDate(today, -2), shiftDate(today, -1)];
    const pool = getPayrollPool();
    await ensureLogTable(pool);

    const holidays = await getHolidaySettings();
    const holidayDates = new Set(holidays.holidays.map((holiday) => holiday.date));
    const shifts = await getShiftSettings();
    const contacts = await getEmployeeContacts();

    const punchResult = await pool.query(
      `SELECT
         UPPER(a.emp_code) AS employee_code,
         COALESCE(e.name, a.emp_code) AS payroll_name,
           COALESCE(e.email, '') AS payroll_email,
         ${PUNCH_TIME_UTC_SQL} AS punch_time,
         COALESCE(a.punch_state::text, '') AS punch_state
       FROM attendance_logs a
       LEFT JOIN LATERAL (
         SELECT
           employee.name,
           COALESCE(
             to_jsonb(employee)->>'email',
             to_jsonb(employee)->>'email_address',
             to_jsonb(employee)->>'official_email',
             to_jsonb(employee)->>'work_email',
             to_jsonb(employee)->>'company_email'
           ) AS email
         FROM employees employee
         WHERE UPPER(employee.employee_code) = UPPER(a.emp_code)
         ORDER BY employee.created_at DESC NULLS LAST, employee.id
         LIMIT 1
       ) e ON TRUE
       WHERE ${PUNCH_TIME_UTC_SQL} >= ($1::date::timestamp AT TIME ZONE $4)
         AND ${PUNCH_TIME_UTC_SQL} < (($2::date + INTERVAL '1 day')::timestamp AT TIME ZONE $4)
         AND ${PUNCH_TIME_UTC_SQL} <= $3
       ORDER BY a.punch_time ASC`,
      [targetDates[0], today, now, TIME_ZONE],
    );

    const punchesByEmployee = new Map<string, PunchRecord[]>();
    punchResult.rows.forEach((row: any) => {
      const code = (row.employee_code || '').trim().toUpperCase();
      if (!code) return;
      const punch: PunchRecord = {
        employeeCode: code,
        payrollName: (row.payroll_name || code).trim(),
        payrollEmail: (row.payroll_email || '').trim(),
        punchTime: new Date(row.punch_time),
        punchState: row.punch_state || '',
      };
      const punches = punchesByEmployee.get(code) || [];
      punches.push(punch);
      punchesByEmployee.set(code, punches);
    });

    let sent = 0;
    let checked = 0;
    const employeePunchEntries = Array.from(punchesByEmployee.entries());
    for (let entryIndex = 0; entryIndex < employeePunchEntries.length; entryIndex += 1) {
      const [employeeCode, punches] = employeePunchEntries[entryIndex];

      for (const attendanceDate of targetDates) {
        const weekday = new Date(`${attendanceDate}T00:00:00.000Z`).getUTCDay();
        if (weekday === 0 || holidayDates.has(attendanceDate)) continue;
        if (shouldDeferForOvernightShift(employeeCode, attendanceDate, now, shifts)) continue;

        const relevantPunches = getPunchesForAttendanceDate(
          punches,
          employeeCode,
          attendanceDate,
          now,
          shifts,
        );
        const missingPunchIn = findUnmatchedPunchIn(relevantPunches, attendanceDate);
        if (!missingPunchIn) continue;

        checked += 1;
        const matchedContact = contacts.get(employeeCode);
        const email = matchedContact?.email || punches.find((punch) => punch.payrollEmail)?.payrollEmail || '';
        if (!email) {
          console.warn(`[MISSING-PUNCH-OUT] Missing Punch-Out found for ${employeeCode} on ${attendanceDate}, but no active LMS employee email was found; skipping email.`);
          continue;
        }

        const payrollName = punches.find((punch) => punch.payrollName && punch.payrollName !== employeeCode)?.payrollName;
        const employee: EmployeeContact = {
          code: employeeCode,
          name: matchedContact?.name || payrollName || employeeCode,
          email,
        };
        const normalizedName = employee.name.toUpperCase();
        const resolvedEmployee = normalizedName === employee.code || normalizedName === employeeCode
          ? { ...employee, name: payrollName || employee.name }
          : employee;
        const result = await sendReminder(pool, resolvedEmployee, attendanceDate, missingPunchIn);
        if (result === 'failed') {
          throw new Error(`Email provider did not accept the reminder for ${employeeCode} on ${attendanceDate}`);
        }
        if (result === 'sent') sent += 1;
      }
    }

    console.log(`[MISSING-PUNCH-OUT] Evaluated ${punchesByEmployee.size} employee(s) with Payroll punches; found ${checked} incomplete attendance record(s) and sent ${sent} reminder(s).`);
    return { sent, checked };
  } finally {
    isReminderRunning = false;
  }
}

async function checkAndRunReminderScheduler(): Promise<void> {
  const now = new Date();
  const currentDate = dateInTimeZone(now, TIME_ZONE);
  const currentMinutes = getLocalMinutes(now, TIME_ZONE);
  if (currentMinutes < 11 * 60 || lastSuccessfulRunDate === currentDate) return;
  if (Date.now() - lastAttemptAt < 5 * 60 * 1000) return;

  lastAttemptAt = Date.now();
  try {
    const emailSettings = await getEmailSendingSettings();
    if (!emailSettings.enabled) {
      lastSuccessfulRunDate = currentDate;
      console.info('[MISSING-PUNCH-OUT] Reminder skipped because email sending is paused; it will not be retried today.');
      return;
    }

    await checkAndSendMissingPunchOutReminders(now);
    lastSuccessfulRunDate = currentDate;
  } catch (error) {
    try {
      const emailSettings = await getEmailSendingSettings();
      if (!emailSettings.enabled) {
        lastSuccessfulRunDate = currentDate;
        console.info('[MISSING-PUNCH-OUT] Reminder skipped because email sending is paused; it will not be retried today.');
        return;
      }
    } catch (statusError) {
      console.error('[MISSING-PUNCH-OUT] Failed to confirm email sending status after reminder failure:', statusError);
    }
    console.error('[MISSING-PUNCH-OUT] Daily reminder run failed:', error);
  }
}

export function startMissingPunchOutReminderScheduler(): void {
  if (reminderInterval) return;
  console.log(`[MISSING-PUNCH-OUT] Daily reminder scheduler started for 11:00 (${TIME_ZONE}).`);
  void checkAndRunReminderScheduler();
  reminderInterval = setInterval(() => {
    void checkAndRunReminderScheduler();
  }, 30 * 1000);
}

export function stopMissingPunchOutReminderScheduler(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}
