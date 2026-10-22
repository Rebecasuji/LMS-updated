import { supabaseServer } from './supabaseServerClient';
import { cliqService } from './cliq';
import { Pool } from 'pg';
import { getEmployeeCutoffMinutes } from './settingsManager';

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
  }>;
  shortHours: Array<{
    name: string;
    code: string;
    totalHours: string;
  }>;
  incompletePunches: Array<{
    name: string;
    code: string;
    punchCount: number;
    lastPunch: string;
  }>;
  totalPresent: number;
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

export async function generateDailyAttendanceReport(targetDate?: string, force = false): Promise<{
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

  const db = supabaseServer;
  if (!db) {
    return { success: false, message: 'Supabase server client not available' };
  }

  try {
    // 1. Fetch user & employee names from LMS Supabase
    const userMap: Record<string, string> = {};

    try {
      const { data: employeesData } = await db.from('employees').select('employee_code, name');
      (employeesData || []).forEach((e: any) => {
        const code = (e.employee_code || '').trim().toUpperCase();
        if (code && e.name) {
          userMap[code] = e.name.trim();
        }
      });
    } catch (e) {
      console.warn('Could not query LMS employees table:', e);
    }

    try {
      const { data: usersData } = await db.from('users').select('user_id, username, email, name');
      (usersData || []).forEach((u: any) => {
        const uid = (u.user_id || '').trim().toUpperCase();
        const uname = (u.username || '').trim().toUpperCase();
        const realName = (u.name || '').trim();
        if (realName) {
          if (uid && !userMap[uid]) userMap[uid] = realName;
          if (uname && !userMap[uname]) userMap[uname] = realName;
        }
      });
    } catch (e) {}

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
    const allOdEmployeeCodes = new Set<string>();
    const approvedOdEmployeeCodes = new Set<string>();

    (leavesData || []).forEach((l: any) => {
      const code = (l.user_id || l.username || '').trim().toUpperCase();
      const resolvedName = l.employee_name || userMap[code] || l.username || code;
      const leaveTypeStr = (l.leave_type || '').trim();
      const upperType = leaveTypeStr.toUpperCase();
      const isApproved = (l.status || '').toLowerCase() === 'approved';

      const isOD = upperType === 'OD' || upperType.includes('ON DUTY') || upperType.includes('ONDUTY');
      const isOT = upperType === 'OT' || upperType.includes('OVERTIME') || upperType.includes('OVER TIME');

      if (isOD) {
        // OD is On Duty -> Marked as Present, NOT on leave
        allOdEmployeeCodes.add(code);
        if (isApproved) {
          approvedOdEmployeeCodes.add(code);
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
          status: isApproved ? 'Approved' : 'Pending',
          duration: durationText,
          reason: l.reason || undefined,
        });
      } else if (!isOT) {
        // Genuine Leaves only (Casual, Sick, LWP, Earned, Privilege, Comp Off, etc.)
        if (isApproved && code) {
          approvedLeaveEmployeeCodes.add(code);
        }

        leavesToday.push({
          name: resolvedName,
          code,
          leaveType: leaveTypeStr || 'Leave',
          status: isApproved ? 'Approved' : 'Pending',
          duration: l.leave_duration_type || 'Full Day',
          reason: l.reason || undefined,
        });
      }
    });

    // 3. Fetch Permissions for today from LMS Supabase
    const { data: permissionsData, error: permissionsErr } = await (db.from('permissions') as any)
      .select('id, user_id, username, employee_name, name, employee_code, permission_type, permission_date, from_time, to_time, reason, status, created_at');

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
      const pDate = p.permission_date || (p.created_at ? p.created_at.split('T')[0] : '');
      if (pDate !== dateStr) return;

      const rawCode = (p.employee_code || p.username || p.user_id || '').trim().toUpperCase();
      const code = /^E\d+/i.test(rawCode) ? rawCode : (userMap[rawCode] ? rawCode : rawCode);
      const name = p.employee_name || p.name || userMap[code] || p.username || code;
      const isApproved = (p.status || '').toLowerCase() === 'approved';

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
        status: isApproved ? 'Approved' : 'Pending',
        reason: p.reason || undefined,
      });
    });

    // 4. Query punch records from Payroll Database (attendance_logs + employees)
    let punchRows: Array<{
      emp_code: string;
      name: string;
      punch_time: Date;
    }> = [];

    const pool = getPayrollPool();
    if (pool) {
      try {
        const queryText = `
          SELECT 
            a.emp_code,
            COALESCE(e.name, a.emp_code) as name,
            a.punch_time
          FROM attendance_logs a
          LEFT JOIN employees e ON UPPER(e.employee_code) = UPPER(a.emp_code)
          WHERE a.punch_time >= ($1::date - INTERVAL '5 hours 30 minutes')
            AND a.punch_time < ($1::date + INTERVAL '1 day' - INTERVAL '5 hours 30 minutes')
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
          };
        });
        console.log(`[ATTENDANCE-REPORT] Fetched ${punchRows.length} punch records from Payroll DB for ${dateStr}.`);
      } catch (dbErr) {
        console.error('[ATTENDANCE-REPORT] Failed to query Payroll DB attendance_logs:', dbErr);
      }
    }

    // Process Punches
    const latecomers: AttendanceReportSummary['latecomers'] = [];
    const shortHours: AttendanceReportSummary['shortHours'] = [];
    const incompletePunches: AttendanceReportSummary['incompletePunches'] = [];

    // Group punches by employee
    const punchesByEmp: Record<string, typeof punchRows> = {};
    for (const p of punchRows) {
      if (!p.emp_code) continue;
      if (!punchesByEmp[p.emp_code]) punchesByEmp[p.emp_code] = [];
      punchesByEmp[p.emp_code].push(p);
    }

    for (const [empCode, empPunches] of Object.entries(punchesByEmp)) {
      // Exclude employees on approved leave today
      if (approvedLeaveEmployeeCodes.has(empCode)) {
        continue;
      }

      const empName = userMap[empCode] || empPunches[0]?.name || empCode;

      // Sort punches chronologically
      empPunches.sort((a, b) => a.punch_time.getTime() - b.punch_time.getTime());

      const firstPunch = empPunches[0];
      const { formatted: firstPunchFormatted, minutesFromMidnight: firstPunchMinutes } = formatISTTime(firstPunch.punch_time);

      // Check if employee has On-Duty (OD) or Approved Late Entry Permission
      const isOnDuty = allOdEmployeeCodes.has(empCode) || approvedOdEmployeeCodes.has(empCode);
      const hasLateEntryPerm = approvedLateEntryCodes.has(empCode);

      // Latecomers check: Evaluate based on employee's configured shift cutoff
      // Exclude employees on OD (they are on duty) and employees with approved late entry permission
      const { cutoffMinutes: empCutoffMinutes } = await getEmployeeCutoffMinutes(empCode);
      const effectiveCutoff = empCutoffMinutes || officeStartMinutes;

      if (firstPunchMinutes > effectiveCutoff && !isOnDuty && !hasLateEntryPerm) {
        const delay = firstPunchMinutes - effectiveCutoff;
        latecomers.push({
          name: empName,
          code: empCode,
          firstPunch: firstPunchFormatted,
          delayMinutes: delay,
          delayFormatted: formatLateDelay(delay),
        });
      }

      // Check Working Duration (< 9 hours = 540 minutes) & Incomplete punches
      if (empPunches.length < 2) {
        incompletePunches.push({
          name: empName,
          code: empCode,
          punchCount: empPunches.length,
          lastPunch: firstPunchFormatted,
        });
      } else {
        const lastPunch = empPunches[empPunches.length - 1];
        const durationMinutes = (lastPunch.punch_time.getTime() - firstPunch.punch_time.getTime()) / (1000 * 60);

        if (durationMinutes < 540) {
          const hours = Math.floor(durationMinutes / 60);
          const mins = Math.floor(durationMinutes % 60);
          shortHours.push({
            name: empName,
            code: empCode,
            totalHours: `${hours}h ${mins}m`,
          });
        }
      }
    }

    const totalPresent = Object.keys(punchesByEmp).length;

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
    };

    // Construct formatted Zoho Cliq Message
    const messageLines: string[] = [
      `🤖 **[LMS Automated Notification]**`,
      `📊 **DAILY ATTENDANCE & LEAVE REPORT**`,
      `📅 **Date:** ${dateStr}  |  ⏰ **Office Cutoff:** ${officeStartTimeStr}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ];

    // Section 1: Employees on Leave
    messageLines.push(`🌴 **1. EMPLOYEES ON LEAVE TODAY (${leavesToday.length})**`);
    if (leavesToday.length === 0) {
      messageLines.push(`_No employees on leave today._`);
    } else {
      leavesToday.forEach((l, idx) => {
        const statusBadge = l.status === 'Approved' ? '✅ Approved' : '🟡 Pending Approval';
        const reasonText = l.reason ? ` — _${l.reason}_` : '';
        messageLines.push(`${idx + 1}. ${formatEmp(l.name, l.code || '')} — ${l.leaveType} (${l.duration || 'Full Day'}) [${statusBadge}]${reasonText}`);
      });
    }

    messageLines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Section 2: Employees On Duty (OD) - Marked as Present
    messageLines.push(`💼 **2. EMPLOYEES ON DUTY (OD) TODAY (${onDutyToday.length})**`);
    messageLines.push(`_📌 On-Duty (OD) indicates employee is Present/On Duty, not on leave._`);
    if (onDutyToday.length === 0) {
      messageLines.push(`_No employees on duty (OD) today._`);
    } else {
      onDutyToday.forEach((od, idx) => {
        const statusBadge = od.status === 'Approved' ? '✅ Approved' : '🟡 Pending Approval';
        const reasonText = od.reason ? ` — _${od.reason}_` : '';
        messageLines.push(`${idx + 1}. ${formatEmp(od.name, od.code || '')} — On Duty (${od.duration}) [${statusBadge}]${reasonText}`);
      });
    }

    messageLines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Section 3: Permissions Applied Today
    messageLines.push(`📋 **3. PERMISSIONS TODAY (${permissionsToday.length})**`);
    if (permissionsToday.length === 0) {
      messageLines.push(`_No permissions applied for today._`);
    } else {
      permissionsToday.forEach((p, idx) => {
        const statusBadge = p.status === 'Approved' ? '✅ Approved' : '🟡 Pending Approval';
        const reasonText = p.reason ? ` — _${p.reason}_` : '';
        messageLines.push(`${idx + 1}. ${formatEmp(p.name, p.code || '')} — ${p.type} (${p.timeRange}) [${statusBadge}]${reasonText}`);
      });
    }

    messageLines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Section 4: Today's Late Arrivals (After Cutoff)
    messageLines.push(`⏰ **4. TODAY'S LATE ARRIVALS (${latecomers.length})**`);
    messageLines.push(`_Arrived after ${officeStartTimeStr} cutoff_`);
    if (latecomers.length === 0) {
      messageLines.push(punchRows.length === 0 ? `_No punch records found for ${dateStr}._` : `_No late arrivals today! Everyone on time._`);
    } else {
      latecomers.forEach((lc, idx) => {
        messageLines.push(`${idx + 1}. ${formatEmp(lc.name, lc.code)} — In: ${lc.firstPunch} (${lc.delayFormatted})`);
      });
    }

    // Sections 5 & 6 are ONLY displayed in End-of-Day summary (>= 18:30 IST / past dates).
    // In the morning / daytime, employees are still working, so awaiting punch out is hidden!
    if (isEndOfDay) {
      messageLines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      messageLines.push(`⏱️ **5. EMPLOYEES WORKING LESS THAN 9 HOURS (${shortHours.length})**`);
      if (shortHours.length === 0) {
        messageLines.push(punchRows.length === 0 ? `_No punch records found for ${dateStr}._` : `_All clocked-out employees completed 9+ hours!_`);
      } else {
        shortHours.forEach((sh, idx) => {
          messageLines.push(`${idx + 1}. ${formatEmp(sh.name, sh.code)} — Net Duration: ${sh.totalHours}`);
        });
      }

      if (incompletePunches.length > 0) {
        messageLines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        messageLines.push(`⚠️ **6. INCOMPLETE ATTENDANCE / NO EXIT PUNCH (${incompletePunches.length})**`);
        incompletePunches.forEach((ip, idx) => {
          messageLines.push(`${idx + 1}. ${formatEmp(ip.name, ip.code)} — First Punch: ${ip.lastPunch} (Awaiting out-punch)`);
        });
      }
    }

    // Summary Footer
    messageLines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    messageLines.push(`📊 **ATTENDANCE SUMMARY**`);
    messageLines.push(`• **Present (Punched In):** ${totalPresent}`);
    messageLines.push(`• **On Duty (OD):** ${onDutyToday.length} (Present)`);
    messageLines.push(`• **On Leave:** ${leavesToday.length}`);
    messageLines.push(`• **Permissions:** ${permissionsToday.length}`);
    messageLines.push(`• **Late Arrivals:** ${latecomers.length}`);

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
