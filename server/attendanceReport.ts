import { supabaseServer } from './supabaseServerClient';
import { cliqService } from './cliq';
import { Pool } from 'pg';
import { getEmployeeCutoffMinutes, getShiftSettings } from './settingsManager';

const SHORT_HOURS_GRACE_MINUTES = 4;

export interface AttendanceReportSummary {
  date: string;
  isEndOfDay: boolean;
  leavesToday: Array<{
    name: string;
    code?: string;
    leaveType: string;
    status: string;
    duration?: string;
    reason?: string;
  }>;
  onDutyToday: Array<{
    name: string;
    code?: string;
    status: string;
    duration: string;
    reason?: string;
  }>;
  permissionsToday: Array<{
    name: string;
    code?: string;
    type: string;
    timeRange: string;
    status: string;
    reason?: string;
  }>;
  latecomers: Array<{
    name: string;
    code: string;
    firstPunch: string;
    delayMinutes: number;
    delayFormatted: string;
    status?: string;
  }>;
  attendanceToday?: Array<{
    name: string;
    code: string;
    punchIn: string;
    status: string;
    lateByMinutes: number;
  }>;
  notPunchedIn?: Array<{ name: string; code: string }>;
  shortHours: Array<{
    name: string;
    code: string;
    punchIn?: string;
    punchOut?: string;
    totalHours: string;
    shortfall?: string;
  }>;
  incompletePunches: Array<{
    name: string;
    code: string;
    punchCount: number;
    lastPunch: string;
    punchIn?: string;
  }>;
  totalPresent: number;
  yesterday?: {
    date: string;
    shortHours: Array<{
      name: string;
      code: string;
      punchIn?: string;
      punchOut?: string;
      totalHours: string;
      shortfall?: string;
    }>;
    incompletePunches: Array<{
      name: string;
      code: string;
      punchCount: number;
      lastPunch: string;
      punchIn?: string;
    }>;
  };
}

// In-memory deduplication tracking for daily reports
const sentDailyReports = new Set<string>();

// Payroll Database connection pool
let payrollPool: Pool | null = null;
function getPayrollPool(): Pool | null {
  const connectionString = process.env.PAYROLL_DATABASE_URL;
  if (!connectionString) {
    console.warn('[ATTENDANCE-REPORT] PAYROLL_DATABASE_URL not configured.');
    return null;
  }
  if (!payrollPool) {
    payrollPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
    });
  }
  return payrollPool;
}

/**
 * Parses time string like "09:30" or "09:30 AM" or "10:15 AM" into minutes from midnight
 */
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const cleaned = timeStr.trim().toUpperCase();
  const isPM = cleaned.includes('PM');
  const isAM = cleaned.includes('AM');
  const match = cleaned.replace(/[^0-9:]/g, '').split(':');
  let hours = parseInt(match[0] || '0', 10);
  const minutes = parseInt(match[1] || '0', 10);

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

/**
 * Formats 24h or arbitrary time string to 12h format "HH:MM AM/PM"
 */
export function formatTimeTo12Hour(timeStr?: string): string {
  if (!timeStr) return '';
  const cleaned = timeStr.trim().toUpperCase();
  if (cleaned.includes('AM') || cleaned.includes('PM')) {
    return cleaned;
  }
  const parts = cleaned.split(':');
  if (parts.length >= 2) {
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1].padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  }
  return timeStr;
}

/**
 * Formats late delay duration (e.g. "Late by 12 mins" or "Late by 1 hr 7 mins")
 */
export function formatLateDelay(minutes: number): string {
  if (minutes <= 0) return 'On time';
  if (minutes < 60) {
    return `Late by ${minutes} mins`;
  }
  const hrs = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (remainingMins === 0) {
    return `Late by ${hrs} hr${hrs > 1 ? 's' : ''}`;
  }
  return `Late by ${hrs} hr${hrs > 1 ? 's' : ''} ${remainingMins} mins`;
}

/**
 * Checks whether report generation is for the End-of-Day summary.
 * If targetDate is a past date, or if current IST time is >= 18:30 (6:30 PM), returns true.
 * In the morning/daytime, returns false so incomplete punches are suppressed.
 */
export function isEndOfDaySummaryTime(targetDate?: string): boolean {
  const todayIST = getTodayDateIST();
  if (targetDate && targetDate < todayIST) {
    return true;
  }
  const now = new Date();
  const istDate = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const istMinutes = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();
  // 18:30 IST is 1110 minutes from midnight
  return istMinutes >= 1110;
}

export function getTodayDateIST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatISTTime(utcDate: Date): { formatted: string; minutesFromMidnight: number } {
  // Convert UTC to IST (+5h 30m)
  const istDate = new Date(utcDate.getTime() + 5.5 * 60 * 60 * 1000);
  const hours = istDate.getUTCHours();
  const minutes = istDate.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const formattedMinutes = minutes.toString().padStart(2, '0');

  return {
    formatted: `${displayHours}:${formattedMinutes} ${ampm}`,
    minutesFromMidnight: hours * 60 + minutes,
  };
}

function getISTDate(utcDate: Date): string {
  const istDate = new Date(utcDate.getTime() + 5.5 * 60 * 60 * 1000);
  return `${istDate.getUTCFullYear()}-${String(istDate.getUTCMonth() + 1).padStart(2, '0')}-${String(istDate.getUTCDate()).padStart(2, '0')}`;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.floor(minutes % 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}`;
}

function getRequestStatus(status: string | undefined): string {
  const normalizedStatus = (status || '').trim().toLowerCase();
  if (normalizedStatus === 'approved') return 'Approved';
  if (normalizedStatus === 'rejected') return 'Rejected';
  return 'Pending Approval';
}

interface AttendancePunch {
  name: string;
  punchTime: Date;
  punchState: string | null;
}

function pairAttendancePunches(punches: AttendancePunch[]): {
  pairs: Array<[AttendancePunch, AttendancePunch]>;
  missingExit: AttendancePunch[];
} {
  const seenPunches = new Set<string>();
  const orderedPunches = punches
    .filter((punch) => {
      const state = (punch.punchState || '').trim().toUpperCase();
      const timestamp = ['IN', 'OUT'].includes(state)
        ? punch.punchTime.getTime()
        : Math.floor(punch.punchTime.getTime() / 60000);
      const key = `${timestamp}|${state}`;
      if (seenPunches.has(key)) return false;
      seenPunches.add(key);
      return true;
    })
    .sort((first, second) => first.punchTime.getTime() - second.punchTime.getTime());
  if (orderedPunches.length < 2) {
    return { pairs: [], missingExit: orderedPunches };
  }

  return {
    pairs: [[orderedPunches[0], orderedPunches[orderedPunches.length - 1]]],
    missingExit: [],
  };
}

function getPreviousDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function analyzeDayHours(
  dateStr: string,
  userMap: Record<string, string>,
  db: NonNullable<typeof supabaseServer>,
): Promise<NonNullable<AttendanceReportSummary['yesterday']>> {
  const { data: leavesData, error: leavesError } = await (db.from('leaves') as any)
    .select('user_id, username, leave_type, status, start_date, end_date')
    .lte('start_date', dateStr)
    .gte('end_date', dateStr);

  if (leavesError) {
    console.error(`[ATTENDANCE-REPORT] Error querying leaves for ${dateStr}:`, leavesError);
  }

  const approvedLeaveCodes = new Set<string>();
  (leavesData || []).forEach((leave: any) => {
    const type = (leave.leave_type || '').trim().toUpperCase();
    const isDutyOrOvertime = type === 'OD' || type.includes('ON DUTY') || type.includes('ONDUTY') ||
      type === 'OT' || type.includes('OVERTIME') || type.includes('OVER TIME');
    if ((leave.status || '').trim().toLowerCase() !== 'approved' || isDutyOrOvertime) return;
    const userId = (leave.user_id || '').trim().toUpperCase();
    const username = (leave.username || '').trim().toUpperCase();
    if (userId) approvedLeaveCodes.add(userId);
    if (username) approvedLeaveCodes.add(username);
  });

  const shortHours: NonNullable<AttendanceReportSummary['yesterday']>['shortHours'] = [];
  const incompletePunches: NonNullable<AttendanceReportSummary['yesterday']>['incompletePunches'] = [];
  const pool = getPayrollPool();

  if (pool) {
    try {
      const queryText = `
        SELECT
          a.emp_code,
          COALESCE(e.name, a.emp_code) as name,
          a.punch_time AT TIME ZONE 'Asia/Kolkata' as punch_time,
          a.punch_state
        FROM attendance_logs a
        LEFT JOIN LATERAL (
          SELECT employee.name
          FROM employees employee
          WHERE UPPER(employee.employee_code) = UPPER(a.emp_code)
          ORDER BY employee.created_at DESC NULLS LAST, employee.id
          LIMIT 1
        ) e ON TRUE
        WHERE a.punch_time >= $1::date
          AND a.punch_time < ($1::date + INTERVAL '1 day')
        ORDER BY a.punch_time ASC;
      `;
      const result = await pool.query(queryText, [dateStr]);
      const punchesByEmployee: Record<string, AttendancePunch[]> = {};

      result.rows.forEach((row: any) => {
        const code = (row.emp_code || '').trim().toUpperCase();
        const punchTime = new Date(row.punch_time);
        if (!code || approvedLeaveCodes.has(code) || getISTDate(punchTime) !== dateStr) return;
        const dbName = (row.name || '').trim();
        const name = userMap[code] || (dbName && dbName.toUpperCase() !== code ? dbName : code);
        if (!punchesByEmployee[code]) punchesByEmployee[code] = [];
        punchesByEmployee[code].push({ name, punchTime, punchState: row.punch_state || null });
      });

      Object.entries(punchesByEmployee).forEach(([code, punches]) => {
        const { pairs, missingExit } = pairAttendancePunches(punches);
        if (missingExit.length > 0) {
          incompletePunches.push({
            name: punches[0].name,
            code,
            punchCount: punches.length,
            lastPunch: formatISTTime(missingExit[missingExit.length - 1].punchTime).formatted,
            punchIn: formatISTTime(missingExit[missingExit.length - 1].punchTime).formatted,
          });
        }
        if (missingExit.length > 0 || pairs.length === 0) return;

        let durationMinutes = 0;
        pairs.forEach(([entry, exit]) => {
          durationMinutes += (exit.punchTime.getTime() - entry.punchTime.getTime()) / 60000;
        });
        if (durationMinutes < 540 - SHORT_HOURS_GRACE_MINUTES) {
          shortHours.push({
            name: punches[0].name,
            code,
            punchIn: formatISTTime(pairs[0][0].punchTime).formatted,
            punchOut: formatISTTime(pairs[pairs.length - 1][1].punchTime).formatted,
            totalHours: formatDuration(durationMinutes),
            shortfall: formatDuration(540 - durationMinutes),
          });
        }
      });
    } catch (error) {
      console.error(`[ATTENDANCE-REPORT] Failed to query Payroll DB attendance_logs for ${dateStr}:`, error);
    }
  }

  return { date: dateStr, shortHours, incompletePunches };
}

export async function generateDailyAttendanceReport(
  targetDate?: string,
  force = false,
  includeYesterday = true,
): Promise<{
  success: boolean;
  message: string;
  summary?: AttendanceReportSummary;
}> {
  const dateStr = targetDate || getTodayDateIST();
  const dedupeKey = `daily_attendance_report_${dateStr}`;

  if (sentDailyReports.has(dedupeKey) && !force) {
    console.log(`[ATTENDANCE-REPORT] Report for ${dateStr} has already been sent today. Skipping.`);
    return { success: true, message: `Report for ${dateStr} already sent` };
  }

  const officeStartTimeStr = process.env.OFFICE_START_TIME || '10:15 AM';
  const officeStartMinutes = parseTimeToMinutes(officeStartTimeStr);
  const isEndOfDay = isEndOfDaySummaryTime(targetDate);
  const reportGeneratedAt = new Date();
  const shiftSettings = await getShiftSettings();
  const gracePeriods = Array.from(new Set(shiftSettings.shifts.map((shift) => shift.graceMinutes || 15)));
  const officeCutoffText = gracePeriods.length === 1
    ? `${gracePeriods[0]} minutes`
    : `${gracePeriods.join(', ')} minutes (varies by shift)`;

  const db = supabaseServer;
  if (!db) {
    return { success: false, message: 'Supabase server client not available' };
  }

  try {
    // 1. Fetch user & employee names from LMS Supabase
    const userMap: Record<string, string> = {};
    const employeeDirectory: Record<string, string> = {};
    const inactiveEmployeeCodes = new Set<string>();

    try {
      const { data: employeesData } = await db.from('employees').select('employee_code, name, is_active');
      (employeesData || []).forEach((e: any) => {
        const code = (e.employee_code || '').trim().toUpperCase();
        if (code) {
          const name = (e.name || code).trim();
          userMap[code] = name;
          if (e.is_active === false) {
            inactiveEmployeeCodes.add(code);
          } else {
            employeeDirectory[code] = name;
          }
        }
      });
    } catch (e) {
      console.warn('Could not query LMS employees table:', e);
    }

    try {
      const { data: usersData, error: usersError } = await db
        .from('users')
        .select('user_id, username, role, is_active');
      if (usersError) {
        console.warn('[ATTENDANCE-REPORT] Could not query LMS user activity status:', usersError);
      } else {
        (usersData || []).forEach((user: any) => {
          const userId = (user.user_id || '').trim().toUpperCase();
          const username = (user.username || '').trim();
          const usernameKey = username.toUpperCase();
          if (user.is_active === false) {
            if (userId) inactiveEmployeeCodes.add(userId);
            if (usernameKey) inactiveEmployeeCodes.add(usernameKey);
            return;
          }
          if ((user.role || '').trim().toLowerCase() !== 'employee') return;

          const code = userId || usernameKey;
          if (!code) return;
          const employeeName = userMap[code] || username || code;
          employeeDirectory[code] = employeeName;
          if (userId && !userMap[userId]) userMap[userId] = employeeName;
          if (usernameKey && !userMap[usernameKey]) userMap[usernameKey] = employeeName;
        });
      }
    } catch (error) {
      console.warn('[ATTENDANCE-REPORT] Could not query LMS user activity status:', error);
    }

    const formatEmp = (name: string, code: string) => {
      const cleanName = (name || '').trim();
      const cleanCode = (code || '').trim().toUpperCase();
      if (!cleanName || cleanName.toUpperCase() === cleanCode) {
        return `**${cleanCode}**`;
      }
      return `**${cleanName}** (${cleanCode})`;
    };

    // 2. Fetch leaves, OD and OT for today from LMS Supabase
    const { data: leavesData, error: leavesErr } = await (db.from('leaves') as any)
      .select('id, user_id, username, employee_name, leave_type, start_date, end_date, status, leave_duration_type, reason, from_time, to_time, od_from_time, od_to_time')
      .lte('start_date', dateStr)
      .gte('end_date', dateStr);

    if (leavesErr) {
      console.error('[ATTENDANCE-REPORT] Error querying leaves:', leavesErr);
    }

    const leavesToday: AttendanceReportSummary['leavesToday'] = [];
    const onDutyToday: AttendanceReportSummary['onDutyToday'] = [];
    const approvedLeaveEmployeeCodes = new Set<string>();
    const approvedOdEmployeeCodes = new Set<string>();

    (leavesData || []).forEach((l: any) => {
      const codes = [l.user_id, l.username]
        .filter(Boolean)
        .map((value: string) => value.trim().toUpperCase());
      const code = codes[0] || '';
      const resolvedName = l.employee_name || userMap[code] || l.username || code;
      const leaveTypeStr = (l.leave_type || '').trim();
      const upperType = leaveTypeStr.toUpperCase();
      const status = getRequestStatus(l.status);
      const isApproved = status === 'Approved';

      const isOD = upperType === 'OD' || upperType.includes('ON DUTY') || upperType.includes('ONDUTY');
      const isOT = upperType === 'OT' || upperType.includes('OVERTIME') || upperType.includes('OVER TIME');

      if (isOD) {
        // OD is On Duty -> Marked as Present, NOT on leave
        if (isApproved) {
          codes.forEach((employeeCode) => approvedOdEmployeeCodes.add(employeeCode));
        }

        let durationText = l.leave_duration_type || 'Full Day';
        const fromTime = l.from_time || l.od_from_time;
        const toTime = l.to_time || l.od_to_time;
        if (l.leave_duration_type === 'Hourly' && fromTime && toTime) {
          durationText = `Hourly: ${formatTimeTo12Hour(fromTime)} - ${formatTimeTo12Hour(toTime)}`;
        }

        onDutyToday.push({
          name: resolvedName,
          code,
          status,
          duration: durationText,
          reason: l.reason || undefined,
        });
      } else if (!isOT) {
        // Genuine Leaves only (Casual, Sick, LWP, Earned, Privilege, Comp Off, etc.)
        if (isApproved) {
          codes.forEach((employeeCode) => approvedLeaveEmployeeCodes.add(employeeCode));
        }

        leavesToday.push({
          name: resolvedName,
          code,
          leaveType: leaveTypeStr || 'Leave',
          status,
          duration: l.leave_duration_type || 'Full Day',
          reason: l.reason || undefined,
        });
      }
    });

    // 3. Fetch Permissions for today from LMS Supabase
    const { data: permissionsData, error: permissionsErr } = await (db.from('permissions') as any)
      .select('id, user_id, username, permission_type, permission_date, from_time, to_time, reason, status, created_at');

    if (permissionsErr) {
      console.warn('[ATTENDANCE-REPORT] Error querying permissions:', permissionsErr);
    }

    const PERMISSION_DISPLAY: Record<string, string> = {
      late_entry: 'Late Entry Permission',
      early_exit: 'Early Exit Permission',
      personal_work: 'Personal Work Permission',
      emergency: 'Emergency Permission',
    };

    const permissionsToday: AttendanceReportSummary['permissionsToday'] = [];
    const approvedLateEntryCodes = new Set<string>();

    (permissionsData || []).forEach((p: any) => {
      const permissionDate = p.permission_date ? String(p.permission_date) : '';
      const pDate = permissionDate
        ? (permissionDate.includes('T') ? getISTDate(new Date(permissionDate)) : permissionDate.slice(0, 10))
        : (p.created_at ? getISTDate(new Date(p.created_at)) : '');
      if (pDate !== dateStr) return;

      const rawCode = (p.employee_code || p.username || p.user_id || '').trim().toUpperCase();
      const code = /^E\d+/i.test(rawCode) ? rawCode : (userMap[rawCode] ? rawCode : rawCode);
      const name = p.employee_name || p.name || userMap[code] || p.username || code;
      const status = getRequestStatus(p.status);
      const isApproved = status === 'Approved';

      const permType = PERMISSION_DISPLAY[p.permission_type] || p.permission_type || 'Permission';
      const fromTime = formatTimeTo12Hour(p.from_time);
      const toTime = formatTimeTo12Hour(p.to_time);
      const timeRange = fromTime && toTime ? `${fromTime} - ${toTime}` : (fromTime || 'Official Hours');

      if (isApproved && (p.permission_type === 'late_entry' || permType.toLowerCase().includes('late entry'))) {
        if (code) approvedLateEntryCodes.add(code);
      }

      permissionsToday.push({
        name,
        code,
        type: permType,
        timeRange,
        status,
        reason: p.reason || undefined,
      });
    });

    // 4. Query punch records from Payroll Database (attendance_logs + employees)
    let punchRows: Array<{
      emp_code: string;
      name: string;
      punch_time: Date;
      punch_state: string | null;
    }> = [];

    const pool = getPayrollPool();
    if (pool) {
      try {
        const queryText = `
          SELECT 
            a.emp_code,
            COALESCE(e.name, a.emp_code) as name,
            a.punch_time AT TIME ZONE 'Asia/Kolkata' as punch_time,
            a.punch_state
          FROM attendance_logs a
          LEFT JOIN LATERAL (
            SELECT employee.name
            FROM employees employee
            WHERE UPPER(employee.employee_code) = UPPER(a.emp_code)
            ORDER BY employee.created_at DESC NULLS LAST, employee.id
            LIMIT 1
          ) e ON TRUE
          WHERE a.punch_time >= $1::date
            AND a.punch_time < ($1::date + INTERVAL '1 day')
          ORDER BY a.punch_time ASC;
        `;
        const res = await pool.query(queryText, [dateStr]);
        punchRows = res.rows.map((r: any) => {
          const empCode = (r.emp_code || '').trim().toUpperCase();
          const dbName = (r.name || '').trim();
          const resolvedName = (dbName && dbName.toUpperCase() !== empCode) ? dbName : (userMap[empCode] || empCode);
          return {
            emp_code: empCode,
            name: resolvedName,
            punch_time: new Date(r.punch_time),
            punch_state: r.punch_state || null,
          };
        }).filter((row: (typeof punchRows)[number]) =>
          getISTDate(row.punch_time) === dateStr &&
          (dateStr !== getTodayDateIST() || row.punch_time.getTime() <= reportGeneratedAt.getTime())
        );
        console.log(`[ATTENDANCE-REPORT] Fetched ${punchRows.length} punch records from Payroll DB for ${dateStr}.`);
      } catch (dbErr) {
        console.error('[ATTENDANCE-REPORT] Failed to query Payroll DB attendance_logs:', dbErr);
      }
    }

    // Process Punches
    const latecomers: AttendanceReportSummary['latecomers'] = [];
    const shortHours: AttendanceReportSummary['shortHours'] = [];
    const incompletePunches: AttendanceReportSummary['incompletePunches'] = [];
    const attendanceToday: NonNullable<AttendanceReportSummary['attendanceToday']> = [];

    // Group punches by employee
    const punchesByEmp: Record<string, typeof punchRows> = {};
    for (const p of punchRows) {
      if (!p.emp_code) continue;
      if (!punchesByEmp[p.emp_code]) punchesByEmp[p.emp_code] = [];
      punchesByEmp[p.emp_code].push(p);
    }

    for (const [empCode, empPunches] of Object.entries(punchesByEmp)) {
      const empName = userMap[empCode] || empPunches[0]?.name || empCode;
      const { pairs, missingExit } = pairAttendancePunches(empPunches.map((punch) => ({
        name: punch.name,
        punchTime: punch.punch_time,
        punchState: punch.punch_state,
      })));
      const firstPunch = pairs[0]?.[0] || missingExit[0];
      if (!firstPunch) continue;
      const { formatted: firstPunchFormatted, minutesFromMidnight: firstPunchMinutes } = formatISTTime(firstPunch.punchTime);

      // Check if employee has On-Duty (OD) or Approved Late Entry Permission
      const isOnDuty = approvedOdEmployeeCodes.has(empCode);
      const hasLateEntryPerm = approvedLateEntryCodes.has(empCode);

      // Latecomers check: Evaluate based on employee's configured shift cutoff
      // Exclude employees on OD (they are on duty) and employees with approved late entry permission
      const { cutoffMinutes: empCutoffMinutes } = await getEmployeeCutoffMinutes(empCode, empName);
      const effectiveCutoff = empCutoffMinutes || officeStartMinutes;
      const isOnApprovedLeave = approvedLeaveEmployeeCodes.has(empCode);
      const delay = firstPunchMinutes > effectiveCutoff && !isOnDuty && !hasLateEntryPerm && !isOnApprovedLeave
        ? firstPunchMinutes - effectiveCutoff
        : 0;

      attendanceToday.push({
        name: empName,
        code: empCode,
        punchIn: firstPunchFormatted,
        status: isOnDuty ? 'On Duty' : (isOnApprovedLeave ? 'On Approved Leave' : (hasLateEntryPerm ? 'Permission' : (delay > 0 ? 'Late' : 'On Time'))),
        lateByMinutes: delay,
      });

      if (delay > 0) {
        latecomers.push({
          name: empName,
          code: empCode,
          firstPunch: firstPunchFormatted,
          delayMinutes: delay,
          delayFormatted: formatLateDelay(delay),
          status: 'Late',
        });
      }

      if (missingExit.length > 0) {
        incompletePunches.push({
          name: empName,
          code: empCode,
          punchCount: empPunches.length,
          lastPunch: formatISTTime(missingExit[missingExit.length - 1].punchTime).formatted,
          punchIn: formatISTTime(missingExit[missingExit.length - 1].punchTime).formatted,
        });
      } else if (pairs.length > 0) {
        let durationMinutes = 0;
        pairs.forEach(([entry, exit]) => {
          durationMinutes += (exit.punchTime.getTime() - entry.punchTime.getTime()) / 60000;
        });
        if (durationMinutes < 540 - SHORT_HOURS_GRACE_MINUTES) {
          shortHours.push({
            name: empName,
            code: empCode,
            punchIn: firstPunchFormatted,
            punchOut: formatISTTime(pairs[pairs.length - 1][1].punchTime).formatted,
            totalHours: formatDuration(durationMinutes),
            shortfall: formatDuration(540 - durationMinutes),
          });
        }
      }
    }

    const excusedEmployees = new Set([
      ...Array.from(approvedLeaveEmployeeCodes),
      ...Array.from(approvedOdEmployeeCodes),
      ...Array.from(approvedLateEntryCodes),
    ]);
    if (pool) {
      try {
        const inactiveEmployees = await pool.query(
          "SELECT UPPER(employee_code) AS employee_code, name, status FROM employees WHERE employee_code IS NOT NULL"
        );
        inactiveEmployees.rows.forEach((employee: { employee_code: string; name: string | null; status: string | null }) => {
          const code = employee.employee_code.trim().toUpperCase();
          if ((employee.status || '').trim().toLowerCase() === 'inactive') {
            inactiveEmployeeCodes.add(code);
          } else if (!inactiveEmployeeCodes.has(code)) {
            employeeDirectory[code] = userMap[code] || (employee.name || code).trim();
          }
        });
      } catch (error) {
        console.error('[ATTENDANCE-REPORT] Could not query Payroll employee directory:', error);
      }
    }
    const notPunchedIn = Object.entries(employeeDirectory)
      .filter(([code]) =>
        !punchesByEmp[code] &&
        !excusedEmployees.has(code) &&
        !inactiveEmployeeCodes.has(code)
      )
      .map(([code, name]) => ({ code, name }));
    const totalPresent = attendanceToday.length;

    const yesterdaySummary = includeYesterday
      ? await analyzeDayHours(getPreviousDate(dateStr), userMap, db)
      : undefined;

    const summary: AttendanceReportSummary = {
      date: dateStr,
      isEndOfDay,
      leavesToday,
      onDutyToday,
      permissionsToday,
      latecomers,
      shortHours,
      incompletePunches,
      totalPresent,
      attendanceToday,
      notPunchedIn,
      ...(yesterdaySummary ? { yesterday: yesterdaySummary } : {}),
    };

    // Construct formatted Zoho Cliq Message
    const messageLines: string[] = [
      `# 📊 LMS DAILY ATTENDANCE & LEAVE REPORT`,
      `**Date:** ${dateStr}`,
      `**Office Cutoff:** ${officeCutoffText}`,
      `**Report Generated:** ${formatISTTime(reportGeneratedAt).formatted}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ];

    messageLines.push(`🌴 **1. EMPLOYEES ON LEAVE TODAY (${leavesToday.length})**`);
    if (leavesToday.length === 0) {
      messageLines.push(`_No employees on leave today._`);
    } else {
      leavesToday.forEach((l, idx) => {
        const employee = `**${l.name} (${(l.code || '').toUpperCase()})**`;
        messageLines.push(`${idx + 1}. ${employee}`);
        messageLines.push(`Leave Type: ${l.leaveType} | Duration: ${l.duration || 'Full Day'}`);
        messageLines.push(`Status: ${l.status}`);
        messageLines.push(`Reason: ${l.reason || 'Not provided'}`);
      });
    }

    messageLines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    messageLines.push(`💼 **2. EMPLOYEES ON DUTY (OD) TODAY (${onDutyToday.length})**`);
    if (onDutyToday.length === 0) {
      messageLines.push(`No employees on official duty today.`);
    } else {
      onDutyToday.forEach((od, idx) => {
        messageLines.push(`${idx + 1}. **${od.name} (${(od.code || '').toUpperCase()})**`);
        messageLines.push(`Status: ${od.status} | Duration: ${od.duration}`);
        if (od.reason) messageLines.push(`Reason: ${od.reason}`);
      });
    }

    messageLines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    messageLines.push(`📋 **3. PERMISSIONS TODAY (${permissionsToday.length})**`);
    if (permissionsToday.length === 0) {
      messageLines.push(`No permissions recorded for today.`);
    } else {
      permissionsToday.forEach((p, idx) => {
        messageLines.push(`${idx + 1}. **${p.name} (${(p.code || '').toUpperCase()})**`);
        messageLines.push(`Permission: ${p.type} | Timing: ${p.timeRange}`);
        messageLines.push(`Status: ${p.status}`);
        if (p.reason) messageLines.push(`Reason: ${p.reason}`);
      });
    }

    messageLines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    messageLines.push(`⏰ **4. TODAY'S ATTENDANCE & LATE ARRIVALS**`);
    const lateEmployees = attendanceToday.filter((employee) => employee.lateByMinutes > 0);
    if (lateEmployees.length === 0) {
      messageLines.push(`No employees are late today.`);
    } else {
      lateEmployees.forEach((employee, idx) => {
        messageLines.push(`${idx + 1}. **${employee.name} (${employee.code})** — ${employee.punchIn} — **LATE BY ${employee.lateByMinutes} MINUTES**`);
      });
    }
    messageLines.push(`Employees expected to work today without a punch-in (${notPunchedIn.length}):`);
    if (notPunchedIn.length === 0) {
      messageLines.push(`All expected employees have punched in or have an applicable approved leave, OD, or late-entry permission.`);
    } else {
      notPunchedIn.forEach((employee, idx) => {
        messageLines.push(`${idx + 1}. **${employee.name} (${employee.code})**`);
      });
    }

    if (yesterdaySummary) {
      messageLines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      messageLines.push(`# 🕘 YESTERDAY'S WORKING-HOURS REPORT`);
      messageLines.push(`**Attendance Date:** ${yesterdaySummary.date}`);
      messageLines.push(`**Minimum Required Working Hours:** 9 hours`);
      messageLines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      messageLines.push(`⚠️ **5. EMPLOYEES WHO WORKED LESS THAN 9 HOURS (${yesterdaySummary.shortHours.length})**`);
      if (yesterdaySummary.shortHours.length === 0) {
        messageLines.push(`No employees worked less than 9 hours yesterday.`);
      } else {
        yesterdaySummary.shortHours.forEach((employee, idx) => {
          messageLines.push(`${idx + 1}. **${employee.name} (${employee.code})**`);
          messageLines.push(`Punch In: ${employee.punchIn}`);
          messageLines.push(`Punch Out: ${employee.punchOut}`);
          messageLines.push(`Total Working Hours: ${employee.totalHours}`);
          messageLines.push(`Shortfall: ${employee.shortfall}`);
        });
      }
      messageLines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      messageLines.push(`🚪 **6. EMPLOYEES WITH NO EXIT PUNCH YESTERDAY (${yesterdaySummary.incompletePunches.length})**`);
      if (yesterdaySummary.incompletePunches.length === 0) {
        messageLines.push(`All employees have valid punch-in and punch-out records, or no incomplete records were found.`);
      } else {
        yesterdaySummary.incompletePunches.forEach((employee, idx) => {
          messageLines.push(`${idx + 1}. **${employee.name} (${employee.code})**`);
          messageLines.push(`Punch In: ${employee.punchIn}`);
          messageLines.push(`Exit Punch: Not Recorded`);
          messageLines.push(`Status: Incomplete Attendance`);
        });
      }
    }

    const fullMessage = messageLines.join('\n');

    const card = {
      title: `[LMS] Daily Attendance Summary — ${dateStr}`,
      theme: 'modern-inline',
    };

    const sent = await cliqService.sendMessageToChannel(fullMessage, card);
    if (sent) {
      sentDailyReports.add(dedupeKey);
      return { success: true, message: `Daily report sent successfully for ${dateStr}`, summary };
    } else {
      return { success: false, message: 'Generated report, but Cliq delivery failed (check Cliq tokens/webhook)', summary };
    }
  } catch (err: any) {
    console.error('[ATTENDANCE-REPORT] Error generating report:', err);
    return { success: false, message: err?.message || 'Error generating attendance report' };
  }
}
