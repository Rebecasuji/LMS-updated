export interface LeaveTypeRule {
  enabled: boolean;
  minNoticeDays: number;         // e.g. PL=5, CL=1, SL=0
  allowPastDates: boolean;       // e.g. SL=true, PL=false
  maxPastDays: number;          // e.g. SL allows 2 days in past
  maxFutureDays: number;        // e.g. 90 days
  allowEmergencyOverride?: boolean; // e.g. PL allows emergency checkbox
  description?: string;
}

export interface LeaveSettings {
  privilege: LeaveTypeRule;
  casual: LeaveTypeRule;
  sick: LeaveTypeRule;
}

export interface ShiftDefinition {
  id: string;
  name: string;
  startTime: string;   // e.g. "09:30 AM", "10:00 AM", "11:00 AM"
  endTime: string;     // e.g. "06:30 PM", "07:00 PM", "08:00 PM"
  graceMinutes: number; // e.g. 15
}

export interface ShiftSettings {
  defaultShiftId: string;
  shifts: ShiftDefinition[];
  employeeShifts: Record<string, string>; // employee_code -> shiftId
}

export const DEFAULT_LEAVE_SETTINGS: LeaveSettings = {
  privilege: {
    enabled: true,
    minNoticeDays: 5,
    allowPastDates: false,
    maxPastDays: 0,
    maxFutureDays: 90,
    allowEmergencyOverride: true,
    description: 'Privilege Leave requires at least 5 days advance notice. Short-notice allowed only with an emergency reason.',
  },
  casual: {
    enabled: true,
    minNoticeDays: 1,
    allowPastDates: false,
    maxPastDays: 0,
    maxFutureDays: 60,
    allowEmergencyOverride: false,
    description: 'Casual Leave must be applied at least 1 day in advance. Past dates are not allowed.',
  },
  sick: {
    enabled: true,
    minNoticeDays: 0,
    allowPastDates: true,
    maxPastDays: 2,
    maxFutureDays: 5,
    allowEmergencyOverride: false,
    description: 'Sick Leave can be applied on the same day or retrospectively up to 2 days in the past.',
  },
};

export const DEFAULT_SHIFT_SETTINGS: ShiftSettings = {
  defaultShiftId: 'shift_1000',
  shifts: [
    {
      id: 'shift_0930',
      name: 'Early Shift (9:30 AM - 6:30 PM)',
      startTime: '09:30 AM',
      endTime: '06:30 PM',
      graceMinutes: 15,
    },
    {
      id: 'shift_1000',
      name: 'General Shift (10:00 AM - 7:00 PM)',
      startTime: '10:00 AM',
      endTime: '07:00 PM',
      graceMinutes: 15,
    },
    {
      id: 'shift_1100',
      name: 'Late Shift (11:00 AM - 8:00 PM)',
      startTime: '11:00 AM',
      endTime: '08:00 PM',
      graceMinutes: 15,
    },
  ],
  employeeShifts: {},
};

// Holiday Settings Types
export interface HolidayEntry {
  date: string;   // ISO string e.g. "2025-01-26"
  name: string;   // e.g. "Republic Day"
}

export interface HolidaySettings {
  holidays: HolidayEntry[];
}

export interface PermissionSettings {
  dailyLimitMinutes: number;
}

export const DEFAULT_PERMISSION_SETTINGS: PermissionSettings = {
  dailyLimitMinutes: 120,
};

export const DEFAULT_HOLIDAY_SETTINGS: HolidaySettings = {
  holidays: [
    { date: '2025-01-26', name: 'Republic Day' },
    { date: '2025-03-08', name: 'Maha Shivaratri' },
    { date: '2025-03-29', name: 'Holi' },
    { date: '2025-04-14', name: 'Ambedkar Jayanti' },
    { date: '2025-04-18', name: 'Good Friday' },
    { date: '2025-05-23', name: 'Buddha Purnima' },
    { date: '2025-08-15', name: 'Independence Day' },
    { date: '2025-08-27', name: 'Janmashtami' },
    { date: '2025-09-16', name: 'Milad un-Nabi' },
    { date: '2025-10-02', name: 'Gandhi Jayanti' },
    { date: '2025-10-20', name: 'Dussehra' },
    { date: '2025-10-30', name: 'Diwali' },
    { date: '2025-11-01', name: 'Diwali (Day 2)' },
    { date: '2025-11-15', name: 'Guru Nanak Jayanti' },
    { date: '2025-12-25', name: 'Christmas' },
    { date: '2026-01-01', name: 'New Year' },
    { date: '2026-01-15', name: 'Pongal' },
    { date: '2026-01-16', name: 'Thiruvalluvar Day' },
    { date: '2026-01-26', name: 'Republic Day' },
    { date: '2026-05-01', name: 'May Day' },
    { date: '2026-08-15', name: 'Independence Day' },
    { date: '2026-09-14', name: 'Ganesh Chaturthi' },
    { date: '2026-10-02', name: 'Gandhi Jayanti' },
    { date: '2026-10-19', name: 'Ayudha Pooja' },
    { date: '2026-11-08', name: 'Diwali' },
    { date: '2026-12-25', name: 'Christmas' },
  ],
};

const LEAVE_SETTINGS_LOCAL_KEY = 'knockturn_leave_settings';
const SHIFT_SETTINGS_LOCAL_KEY = 'knockturn_shift_settings';
const HOLIDAY_SETTINGS_LOCAL_KEY = 'knockturn_holiday_settings';
const PERMISSION_SETTINGS_LOCAL_KEY = 'knockturn_permission_settings';

// ============================================================================
// API & CACHING HELPERS
// ============================================================================

export async function fetchLeaveSettings(): Promise<LeaveSettings> {
  // 1. Try local cache first for instant rendering
  let cached: LeaveSettings = DEFAULT_LEAVE_SETTINGS;
  try {
    const raw = localStorage.getItem(LEAVE_SETTINGS_LOCAL_KEY);
    if (raw) {
      cached = { ...DEFAULT_LEAVE_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {}

  // 2. Fetch fresh from server
  try {
    const res = await fetch('/api/settings/leave');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.settings) {
        const merged = { ...DEFAULT_LEAVE_SETTINGS, ...data.settings };
        localStorage.setItem(LEAVE_SETTINGS_LOCAL_KEY, JSON.stringify(merged));
        return merged;
      }
    }
  } catch (err) {
    console.warn('[SETTINGS] Error fetching leave settings from API, using cached:', err);
  }

  return cached;
}

export async function saveLeaveSettings(settings: LeaveSettings): Promise<boolean> {
  // Save locally
  localStorage.setItem(LEAVE_SETTINGS_LOCAL_KEY, JSON.stringify(settings));

  // Save to server
  try {
    const res = await fetch('/api/settings/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      const data = await res.json();
      return !!data.success;
    }
  } catch (err) {
    console.error('[SETTINGS] Error saving leave settings to API:', err);
  }
  return false;
}

export async function fetchShiftSettings(): Promise<ShiftSettings> {
  let cached: ShiftSettings = DEFAULT_SHIFT_SETTINGS;
  try {
    const raw = localStorage.getItem(SHIFT_SETTINGS_LOCAL_KEY);
    if (raw) {
      cached = { ...DEFAULT_SHIFT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {}

  try {
    const res = await fetch('/api/settings/shifts');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.settings) {
        const merged = { ...DEFAULT_SHIFT_SETTINGS, ...data.settings };
        localStorage.setItem(SHIFT_SETTINGS_LOCAL_KEY, JSON.stringify(merged));
        return merged;
      }
    }
  } catch (err) {
    console.warn('[SETTINGS] Error fetching shift settings from API, using cached:', err);
  }

  return cached;
}

export async function saveShiftSettings(settings: ShiftSettings): Promise<boolean> {
  localStorage.setItem(SHIFT_SETTINGS_LOCAL_KEY, JSON.stringify(settings));

  try {
    const res = await fetch('/api/settings/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      const data = await res.json();
      return !!data.success;
    }
  } catch (err) {
    console.error('[SETTINGS] Error saving shift settings to API:', err);
  }
  return false;
}

// Holiday Settings
export async function fetchHolidaySettings(): Promise<HolidaySettings> {
  let cached: HolidaySettings = DEFAULT_HOLIDAY_SETTINGS;
  try {
    const raw = localStorage.getItem(HOLIDAY_SETTINGS_LOCAL_KEY);
    if (raw) {
      cached = { holidays: JSON.parse(raw).holidays || DEFAULT_HOLIDAY_SETTINGS.holidays };
    }
  } catch (e) {}

  try {
    const res = await fetch('/api/settings/holidays');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.settings) {
        const merged: HolidaySettings = { holidays: data.settings.holidays || DEFAULT_HOLIDAY_SETTINGS.holidays };
        localStorage.setItem(HOLIDAY_SETTINGS_LOCAL_KEY, JSON.stringify(merged));
        return merged;
      }
    }
  } catch (err) {
    console.warn('[SETTINGS] Error fetching holiday settings from API, using cached:', err);
  }

  return cached;
}

export async function saveHolidaySettings(settings: HolidaySettings): Promise<boolean> {
  localStorage.setItem(HOLIDAY_SETTINGS_LOCAL_KEY, JSON.stringify(settings));

  try {
    const res = await fetch('/api/settings/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      const data = await res.json();
      return !!data.success;
    }
  } catch (err) {
    console.error('[SETTINGS] Error saving holiday settings to API:', err);
  }
  return false;
}

export async function fetchPermissionSettings(): Promise<PermissionSettings> {
  let cached = DEFAULT_PERMISSION_SETTINGS;
  try {
    const raw = localStorage.getItem(PERMISSION_SETTINGS_LOCAL_KEY);
    if (raw) cached = { ...DEFAULT_PERMISSION_SETTINGS, ...JSON.parse(raw) };
  } catch (err) {
    console.warn('[SETTINGS] Failed to read cached permission settings:', err);
  }

  try {
    const res = await fetch('/api/settings/permissions');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.settings) {
        const settings = { ...DEFAULT_PERMISSION_SETTINGS, ...data.settings };
        localStorage.setItem(PERMISSION_SETTINGS_LOCAL_KEY, JSON.stringify(settings));
        return settings;
      }
    }
  } catch (err) {
    console.warn('[SETTINGS] Error fetching permission settings, using cached:', err);
  }

  return cached;
}

export async function savePermissionSettings(settings: PermissionSettings): Promise<boolean> {
  localStorage.setItem(PERMISSION_SETTINGS_LOCAL_KEY, JSON.stringify(settings));
  try {
    const res = await fetch('/api/settings/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      const data = await res.json();
      return !!data.success;
    }
  } catch (err) {
    console.error('[SETTINGS] Error saving permission settings to API:', err);
  }
  return false;
}

// ============================================================================
// DATE RESTRICTION HELPERS FOR APPLY LEAVE
// ============================================================================

function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getPermittedDateRange(
  leaveType: string,
  settings: LeaveSettings,
  isEmergencyPrivilege = false
): {
  minDate?: string;
  maxDate?: string;
  helperText?: string;
  isPastAllowed: boolean;
  minNoticeDays: number;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (leaveType === 'Privilege') {
    const rule = settings.privilege;
    if (isEmergencyPrivilege && rule.allowEmergencyOverride) {
      // Emergency: allow starting from today up to maxFutureDays
      const maxD = new Date(today);
      maxD.setDate(maxD.getDate() + (rule.maxFutureDays || 90));
      return {
        minDate: toDateString(today),
        maxDate: toDateString(maxD),
        helperText: '⚡ Emergency Privilege Leave allows short-notice application starting from today.',
        isPastAllowed: false,
        minNoticeDays: 0,
      };
    }

    const minD = new Date(today);
    minD.setDate(minD.getDate() + (rule.minNoticeDays || 5));
    const maxD = new Date(today);
    maxD.setDate(maxD.getDate() + (rule.maxFutureDays || 90));

    return {
      minDate: toDateString(minD),
      maxDate: toDateString(maxD),
      helperText: `Privilege Leave requires at least ${rule.minNoticeDays} days advance booking (Earliest selectable date: ${toDateString(minD)}).`,
      isPastAllowed: false,
      minNoticeDays: rule.minNoticeDays,
    };
  }

  if (leaveType === 'Casual') {
    const rule = settings.casual;
    const minD = new Date(today);
    if (!rule.allowPastDates) {
      minD.setDate(minD.getDate() + (rule.minNoticeDays || 0));
    } else {
      minD.setDate(minD.getDate() - (rule.maxPastDays || 0));
    }

    const maxD = new Date(today);
    maxD.setDate(maxD.getDate() + (rule.maxFutureDays || 60));

    const noticeDesc = rule.minNoticeDays > 0
      ? `requires ${rule.minNoticeDays} day(s) advance notice`
      : 'can be applied starting today';

    return {
      minDate: toDateString(minD),
      maxDate: toDateString(maxD),
      helperText: `Casual Leave ${noticeDesc} (Earliest selectable date: ${toDateString(minD)}).`,
      isPastAllowed: rule.allowPastDates,
      minNoticeDays: rule.minNoticeDays,
    };
  }

  if (leaveType === 'Sick') {
    const rule = settings.sick;
    const minD = new Date(today);
    if (rule.allowPastDates && rule.maxPastDays > 0) {
      minD.setDate(minD.getDate() - rule.maxPastDays);
    }

    const maxD = new Date(today);
    maxD.setDate(maxD.getDate() + (rule.maxFutureDays || 5));

    const pastDesc = rule.allowPastDates && rule.maxPastDays > 0
      ? `Can be applied for today or up to ${rule.maxPastDays} day(s) backdated.`
      : 'Can be applied starting from today.';

    return {
      minDate: toDateString(minD),
      maxDate: toDateString(maxD),
      helperText: `Sick Leave: ${pastDesc}`,
      isPastAllowed: rule.allowPastDates,
      minNoticeDays: 0,
    };
  }

  // OD, Comp Off, OT, LWP: Default today onward
  return {
    minDate: undefined,
    maxDate: undefined,
    isPastAllowed: true,
    minNoticeDays: 0,
  };
}

export function validateLeaveDates(
  leaveType: string,
  startDateStr: string,
  endDateStr: string,
  settings: LeaveSettings,
  isEmergencyPrivilege = false
): { valid: boolean; error?: string } {
  if (!startDateStr || !endDateStr) {
    return { valid: false, error: 'Start date and end date are required.' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const startD = new Date(startDateStr);
  startD.setHours(0, 0, 0, 0);

  const endD = new Date(endDateStr);
  endD.setHours(0, 0, 0, 0);

  if (endD < startD) {
    return { valid: false, error: 'End date cannot be earlier than start date.' };
  }

  const range = getPermittedDateRange(leaveType, settings, isEmergencyPrivilege);

  if (range.minDate) {
    const minD = new Date(range.minDate);
    minD.setHours(0, 0, 0, 0);
    if (startD < minD) {
      if (leaveType === 'Privilege' && !isEmergencyPrivilege) {
        return {
          valid: false,
          error: `Privilege Leave must be applied at least ${range.minNoticeDays} days in advance. Earliest date allowed is ${range.minDate}. Use the Emergency Request option for short notice.`,
        };
      }
      if (leaveType === 'Casual') {
        return {
          valid: false,
          error: `Casual Leave must be applied at least ${range.minNoticeDays} day(s) in advance. Earliest date allowed is ${range.minDate}.`,
        };
      }
      if (leaveType === 'Sick') {
        return {
          valid: false,
          error: `Sick Leave can only be backdated up to ${settings.sick.maxPastDays} day(s). Earliest date allowed is ${range.minDate}.`,
        };
      }
      return { valid: false, error: `Selected start date is before the allowed date (${range.minDate}).` };
    }
  }

  if (range.maxDate) {
    const maxD = new Date(range.maxDate);
    maxD.setHours(0, 0, 0, 0);
    if (endD > maxD) {
      return { valid: false, error: `Selected dates exceed the maximum booking limit (${range.maxDate}).` };
    }
  }

  return { valid: true };
}
