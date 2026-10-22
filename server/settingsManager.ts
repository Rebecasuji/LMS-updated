import fs from 'fs';
import path from 'path';
import pg from 'pg';

export interface LeaveTypeRule {
  enabled: boolean;
  minNoticeDays: number;         // Days in advance required (e.g. PL=5, CL=1, SL=0)
  allowPastDates: boolean;       // Can employee pick past dates (e.g. SL=true)
  maxPastDays: number;          // If allowPastDates is true, how many days back (e.g. 2 days)
  maxFutureDays: number;        // Max booking horizon into future (e.g. 90 days)
  allowEmergencyOverride?: boolean; // Emergency bypass flag (e.g. for PL short-notice)
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
    description: 'Requires 5 days advance booking. Short-notice allowed only with an emergency reason.',
  },
  casual: {
    enabled: true,
    minNoticeDays: 1,
    allowPastDates: false,
    maxPastDays: 0,
    maxFutureDays: 60,
    allowEmergencyOverride: false,
    description: 'Must be applied at least 1 day in advance. Past dates are not allowed.',
  },
  sick: {
    enabled: true,
    minNoticeDays: 0,
    allowPastDates: true,
    maxPastDays: 2,
    maxFutureDays: 5,
    allowEmergencyOverride: false,
    description: 'Can be applied on the same day or retrospectively up to 2 days in the past.',
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

// Ensure data folder exists
const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.error('[SETTINGS] Failed to create data dir:', e);
  }
}

const LEAVE_SETTINGS_FILE = path.join(DATA_DIR, 'leave_settings.json');
const SHIFT_SETTINGS_FILE = path.join(DATA_DIR, 'shift_settings.json');

let pool: pg.Pool | null = null;
function getPool(): pg.Pool | null {
  if (!pool && process.env.PAYROLL_DATABASE_URL) {
    try {
      pool = new pg.Pool({
        connectionString: process.env.PAYROLL_DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 3,
      });
    } catch (err) {
      console.error('[SETTINGS] Failed to create DB pool:', err);
      pool = null;
    }
  }
  return pool;
}

// In-memory cache
let cachedLeaveSettings: LeaveSettings | null = null;
let cachedShiftSettings: ShiftSettings | null = null;

// ============================================================================
// LEAVE SETTINGS
// ============================================================================

export async function getLeaveSettings(): Promise<LeaveSettings> {
  if (cachedLeaveSettings) {
    return cachedLeaveSettings;
  }

  // 1. Try DB
  const dbPool = getPool();
  if (dbPool) {
    try {
      const res = await dbPool.query("SELECT value FROM settings WHERE key = 'lms_leave_settings' LIMIT 1");
      if (res.rows.length > 0 && res.rows[0].value) {
        const parsed = JSON.parse(res.rows[0].value);
        const resolved: LeaveSettings = { ...DEFAULT_LEAVE_SETTINGS, ...parsed };
        cachedLeaveSettings = resolved;
        return resolved;
      }
    } catch (err: any) {
      console.warn('[SETTINGS] DB query for leave settings failed, falling back:', err.message);
    }
  }

  // 2. Try Local File
  try {
    if (fs.existsSync(LEAVE_SETTINGS_FILE)) {
      const content = fs.readFileSync(LEAVE_SETTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      const resolved: LeaveSettings = { ...DEFAULT_LEAVE_SETTINGS, ...parsed };
      cachedLeaveSettings = resolved;
      return resolved;
    }
  } catch (err: any) {
    console.warn('[SETTINGS] File read for leave settings failed:', err.message);
  }

  // 3. Fallback to default
  const fallback: LeaveSettings = { ...DEFAULT_LEAVE_SETTINGS };
  cachedLeaveSettings = fallback;
  return fallback;
}

export async function saveLeaveSettings(settings: LeaveSettings): Promise<boolean> {
  cachedLeaveSettings = { ...DEFAULT_LEAVE_SETTINGS, ...settings };

  // 1. Save to File
  try {
    fs.writeFileSync(LEAVE_SETTINGS_FILE, JSON.stringify(cachedLeaveSettings, null, 2), 'utf-8');
  } catch (err) {
    console.error('[SETTINGS] Failed to write leave settings to file:', err);
  }

  // 2. Save to DB
  const dbPool = getPool();
  if (dbPool) {
    try {
      const jsonStr = JSON.stringify(cachedLeaveSettings);
      const existing = await dbPool.query("SELECT id FROM settings WHERE key = 'lms_leave_settings' LIMIT 1");
      if (existing.rows.length > 0) {
        await dbPool.query("UPDATE settings SET value = $1, updated_at = NOW() WHERE key = 'lms_leave_settings'", [jsonStr]);
      } else {
        await dbPool.query(
          "INSERT INTO settings (id, key, value, created_at, updated_at) VALUES (gen_random_uuid(), 'lms_leave_settings', $1, NOW(), NOW())",
          [jsonStr]
        );
      }
      return true;
    } catch (err: any) {
      console.error('[SETTINGS] DB save for leave settings failed:', err.message);
    }
  }

  return true;
}

// ============================================================================
// SHIFT SETTINGS
// ============================================================================

export async function getShiftSettings(): Promise<ShiftSettings> {
  if (cachedShiftSettings) {
    return cachedShiftSettings;
  }

  // 1. Try DB
  const dbPool = getPool();
  if (dbPool) {
    try {
      const res = await dbPool.query("SELECT value FROM settings WHERE key = 'lms_shift_settings' LIMIT 1");
      if (res.rows.length > 0 && res.rows[0].value) {
        const parsed = JSON.parse(res.rows[0].value);
        const resolved: ShiftSettings = { ...DEFAULT_SHIFT_SETTINGS, ...parsed };
        cachedShiftSettings = resolved;
        return resolved;
      }
    } catch (err: any) {
      console.warn('[SETTINGS] DB query for shift settings failed, falling back:', err.message);
    }
  }

  // 2. Try Local File
  try {
    if (fs.existsSync(SHIFT_SETTINGS_FILE)) {
      const content = fs.readFileSync(SHIFT_SETTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      const resolved: ShiftSettings = { ...DEFAULT_SHIFT_SETTINGS, ...parsed };
      cachedShiftSettings = resolved;
      return resolved;
    }
  } catch (err: any) {
    console.warn('[SETTINGS] File read for shift settings failed:', err.message);
  }

  // 3. Fallback to default
  const fallback: ShiftSettings = { ...DEFAULT_SHIFT_SETTINGS };
  cachedShiftSettings = fallback;
  return fallback;
}

export async function saveShiftSettings(settings: ShiftSettings): Promise<boolean> {
  cachedShiftSettings = { ...DEFAULT_SHIFT_SETTINGS, ...settings };

  // 1. Save to File
  try {
    fs.writeFileSync(SHIFT_SETTINGS_FILE, JSON.stringify(cachedShiftSettings, null, 2), 'utf-8');
  } catch (err) {
    console.error('[SETTINGS] Failed to write shift settings to file:', err);
  }

  // 2. Save to DB
  const dbPool = getPool();
  if (dbPool) {
    try {
      const jsonStr = JSON.stringify(cachedShiftSettings);
      const existing = await dbPool.query("SELECT id FROM settings WHERE key = 'lms_shift_settings' LIMIT 1");
      if (existing.rows.length > 0) {
        await dbPool.query("UPDATE settings SET value = $1, updated_at = NOW() WHERE key = 'lms_shift_settings'", [jsonStr]);
      } else {
        await dbPool.query(
          "INSERT INTO settings (id, key, value, created_at, updated_at) VALUES (gen_random_uuid(), 'lms_shift_settings', $1, NOW(), NOW())",
          [jsonStr]
        );
      }
      return true;
    } catch (err: any) {
      console.error('[SETTINGS] DB save for shift settings failed:', err.message);
    }
  }

  return true;
}

// ============================================================================
// HOLIDAY SETTINGS
// ============================================================================

export interface HolidayEntry {
  date: string;   // ISO string e.g. "2025-01-26"
  name: string;   // e.g. "Republic Day"
}

export interface HolidaySettings {
  holidays: HolidayEntry[];
}

const HOLIDAY_SETTINGS_FILE = path.join(DATA_DIR, 'holiday_settings.json');

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

let cachedHolidaySettings: HolidaySettings | null = null;

export async function getHolidaySettings(): Promise<HolidaySettings> {
  if (cachedHolidaySettings) {
    return cachedHolidaySettings;
  }

  // 1. Try DB
  const dbPool = getPool();
  if (dbPool) {
    try {
      const res = await dbPool.query("SELECT value FROM settings WHERE key = 'lms_holiday_settings' LIMIT 1");
      if (res.rows.length > 0 && res.rows[0].value) {
        const parsed = JSON.parse(res.rows[0].value);
        const resolved: HolidaySettings = { holidays: parsed.holidays || DEFAULT_HOLIDAY_SETTINGS.holidays };
        cachedHolidaySettings = resolved;
        return resolved;
      }
    } catch (err: any) {
      console.warn('[SETTINGS] DB query for holiday settings failed, falling back:', err.message);
    }
  }

  // 2. Try Local File
  try {
    if (fs.existsSync(HOLIDAY_SETTINGS_FILE)) {
      const content = fs.readFileSync(HOLIDAY_SETTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      const resolved: HolidaySettings = { holidays: parsed.holidays || DEFAULT_HOLIDAY_SETTINGS.holidays };
      cachedHolidaySettings = resolved;
      return resolved;
    }
  } catch (err: any) {
    console.warn('[SETTINGS] File read for holiday settings failed:', err.message);
  }

  // 3. Fallback to default
  const fallback: HolidaySettings = { ...DEFAULT_HOLIDAY_SETTINGS };
  cachedHolidaySettings = fallback;
  return fallback;
}

export async function saveHolidaySettings(settings: HolidaySettings): Promise<boolean> {
  cachedHolidaySettings = { holidays: settings.holidays || [] };

  // 1. Save to File
  try {
    fs.writeFileSync(HOLIDAY_SETTINGS_FILE, JSON.stringify(cachedHolidaySettings, null, 2), 'utf-8');
  } catch (err) {
    console.error('[SETTINGS] Failed to write holiday settings to file:', err);
  }

  // 2. Save to DB
  const dbPool = getPool();
  if (dbPool) {
    try {
      const jsonStr = JSON.stringify(cachedHolidaySettings);
      const existing = await dbPool.query("SELECT id FROM settings WHERE key = 'lms_holiday_settings' LIMIT 1");
      if (existing.rows.length > 0) {
        await dbPool.query("UPDATE settings SET value = $1, updated_at = NOW() WHERE key = 'lms_holiday_settings'", [jsonStr]);
      } else {
        await dbPool.query(
          "INSERT INTO settings (id, key, value, created_at, updated_at) VALUES (gen_random_uuid(), 'lms_holiday_settings', $1, NOW(), NOW())",
          [jsonStr]
        );
      }
      return true;
    } catch (err: any) {
      console.error('[SETTINGS] DB save for holiday settings failed:', err.message);
    }
  }

  return true;
}

/**
 * Returns the effective cutoff minutes from midnight for a given employee code.
 * E.g. If assigned 09:30 AM shift with 15 mins grace -> returns 9*60 + 30 + 15 = 585 (9:45 AM).
 */
export async function getEmployeeCutoffMinutes(empCode?: string): Promise<{ cutoffMinutes: number; shiftName: string; shiftStartTime: string; graceMinutes: number }> {
  const settings = await getShiftSettings();
  const normalizedCode = (empCode || '').trim().toUpperCase();

  const shiftId = settings.employeeShifts[normalizedCode] || settings.defaultShiftId;
  const shift = settings.shifts.find(s => s.id === shiftId) || settings.shifts[0] || DEFAULT_SHIFT_SETTINGS.shifts[1];

  // Parse shift start time (e.g. "09:30 AM" or "10:00 AM")
  const parts = shift.startTime.trim().split(/[:\s]+/);
  let hours = parseInt(parts[0], 10) || 10;
  const minutes = parseInt(parts[1], 10) || 0;
  const ampm = (parts[2] || 'AM').toUpperCase();
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  const startMinutes = hours * 60 + minutes;
  const cutoffMinutes = startMinutes + (shift.graceMinutes || 15);

  return {
    cutoffMinutes,
    shiftName: shift.name,
    shiftStartTime: shift.startTime,
    graceMinutes: shift.graceMinutes || 15,
  };
}
