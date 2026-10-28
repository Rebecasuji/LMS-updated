import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { generateDailyAttendanceReport, getTodayDateIST } from './attendanceReport';

interface DailyReportState {
  lastSentDate?: string;
  retryDate?: string;
  retryCount?: number;
  lastAttemptAt?: number;
}

let schedulerInterval: NodeJS.Timeout | null = null;
let isJobRunning = false;
const stateFilePath = path.resolve(process.cwd(), '.cliq-report-state.json');
let reportState: DailyReportState = readReportState();

function readReportState(): DailyReportState {
  if (!existsSync(stateFilePath)) return {};

  try {
    const parsed = JSON.parse(readFileSync(stateFilePath, 'utf8')) as DailyReportState;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid report state format');
    }
    return parsed;
  } catch (error) {
    console.error('[SCHEDULER] Could not read daily report state:', error);
    return {};
  }
}

function writeReportState() {
  try {
    writeFileSync(stateFilePath, JSON.stringify(reportState, null, 2), 'utf8');
  } catch (error) {
    console.error('[SCHEDULER] Could not write daily report state:', error);
  }
}

function parseTime(value: string, settingName: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    throw new Error(`${settingName} must be in HH:mm format`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function markDailyReportSent() {
  reportState = { lastSentDate: getTodayDateIST() };
  writeReportState();
}

export async function checkAndRunScheduledReport(): Promise<{ ran: boolean; message: string }> {
  if (isJobRunning) {
    return { ran: false, message: 'Report job already in progress' };
  }

  try {
    const now = new Date();
    const timeParts = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);

    const hour = Number(timeParts.find((part) => part.type === 'hour')?.value || '0') % 24;
    const minute = Number(timeParts.find((part) => part.type === 'minute')?.value || '0');
    const nowMinutes = hour * 60 + minute;
    const targetTime = process.env.DAILY_REPORT_TIME || '11:30';
    const catchupUntil = process.env.DAILY_REPORT_CATCHUP_UNTIL || '18:00';
    const targetMinutes = parseTime(targetTime, 'DAILY_REPORT_TIME');
    const catchupUntilMinutes = parseTime(catchupUntil, 'DAILY_REPORT_CATCHUP_UNTIL');
    const todayDate = getTodayDateIST();

    if (nowMinutes < targetMinutes) {
      return { ran: false, message: 'Not yet time' };
    }
    if (nowMinutes > catchupUntilMinutes) {
      return { ran: false, message: 'Past catch-up window' };
    }
    if (reportState.lastSentDate === todayDate) {
      return { ran: false, message: `Report for ${todayDate} already sent` };
    }

    const retryCount = reportState.retryDate === todayDate ? reportState.retryCount || 0 : 0;
    if (retryCount >= 6) {
      return { ran: false, message: `Maximum retry attempts reached for ${todayDate}` };
    }
    const lastAttemptAt = reportState.retryDate === todayDate ? reportState.lastAttemptAt || 0 : 0;
    if (lastAttemptAt && Date.now() - lastAttemptAt < 5 * 60 * 1000) {
      return { ran: false, message: 'Waiting before retrying the daily report' };
    }

    isJobRunning = true;
    reportState = {
      ...reportState,
      retryDate: todayDate,
      retryCount: retryCount + 1,
      lastAttemptAt: Date.now(),
    };
    writeReportState();

    console.log(`[SCHEDULER] Sending daily attendance report for ${todayDate}. Attempt ${retryCount + 1} of 6.`);
    const result = await generateDailyAttendanceReport(todayDate);
    if (result.success) {
      reportState = { lastSentDate: todayDate };
      writeReportState();
    }
    console.log(`[SCHEDULER] Daily report result: ${result.message}`);
    return { ran: true, message: result.message };
  } catch (error) {
    console.error('[SCHEDULER] Error in scheduler execution:', error);
    return {
      ran: false,
      message: error instanceof Error ? error.message : 'Error in scheduler execution',
    };
  } finally {
    isJobRunning = false;
  }
}

export function startScheduler() {
  if (schedulerInterval) {
    console.log('[SCHEDULER] Scheduler is already running.');
    return;
  }

  const configuredTime = process.env.DAILY_REPORT_TIME || '11:30';
  console.log(`[SCHEDULER] Daily attendance report scheduler started. Scheduled for ${configuredTime} (Asia/Kolkata).`);

  void checkAndRunScheduledReport();
  schedulerInterval = setInterval(() => {
    void checkAndRunScheduledReport();
  }, 30 * 1000);
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[SCHEDULER] Scheduler stopped.');
  }
}
