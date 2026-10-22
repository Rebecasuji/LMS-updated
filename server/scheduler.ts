import { generateDailyAttendanceReport, getTodayDateIST } from './attendanceReport';

let schedulerInterval: NodeJS.Timeout | null = null;
let isJobRunning = false;
let lastExecutedDate = '';

/**
 * Checks the current time in Asia/Kolkata and triggers the daily report when the scheduled time matches.
 */
async function checkAndRunScheduledReport() {
  if (isJobRunning) {
    console.log('[SCHEDULER] Job already in progress, skipping check.');
    return;
  }

  try {
    const now = new Date();
    // Get current time in Asia/Kolkata in HH:mm format
    const timeParts = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);

    const hour = timeParts.find((p) => p.type === 'hour')?.value || '00';
    const minute = timeParts.find((p) => p.type === 'minute')?.value || '00';
    const currentTimeStr = `${hour}:${minute}`;

    // Target scheduled time, e.g. "19:00" (7:00 PM IST)
    const targetReportTime = process.env.DAILY_REPORT_TIME || '19:00';
    const todayDate = getTodayDateIST();

    if (currentTimeStr === targetReportTime && lastExecutedDate !== todayDate) {
      console.log(`[SCHEDULER] Triggering daily attendance report for ${todayDate} at ${currentTimeStr} IST`);
      isJobRunning = true;
      lastExecutedDate = todayDate;

      const result = await generateDailyAttendanceReport(todayDate);
      console.log(`[SCHEDULER] Daily report result:`, result.message);
    }
  } catch (err) {
    console.error('[SCHEDULER] Error in scheduler execution:', err);
  } finally {
    isJobRunning = false;
  }
}

export function startScheduler() {
  if (schedulerInterval) {
    console.log('[SCHEDULER] Scheduler is already running.');
    return;
  }

  const configuredTime = process.env.DAILY_REPORT_TIME || '19:00';
  console.log(`[SCHEDULER] Daily attendance report scheduler started. Scheduled for ${configuredTime} (Asia/Kolkata).`);

  // Check every 30 seconds
  schedulerInterval = setInterval(checkAndRunScheduledReport, 30 * 1000);
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[SCHEDULER] Scheduler stopped.');
  }
}
