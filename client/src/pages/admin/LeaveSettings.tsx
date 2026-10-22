import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  CalendarDays,
  Clock,
  Save,
  Search,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  UserCheck,
  RefreshCw,
  Sparkles,
  Trash2,
  Plus,
  Pencil,
  PartyPopper,
} from 'lucide-react';
import {
  LeaveSettings,
  ShiftSettings,
  HolidaySettings,
  HolidayEntry,
  DEFAULT_LEAVE_SETTINGS,
  DEFAULT_SHIFT_SETTINGS,
  DEFAULT_HOLIDAY_SETTINGS,
  fetchLeaveSettings,
  saveLeaveSettings,
  fetchShiftSettings,
  saveShiftSettings,
  fetchHolidaySettings,
  saveHolidaySettings as saveHolidaySettingsApi,
} from '@/lib/settings';
import { getAllUsersAsync } from '@/lib/storage';
import { User } from '@/lib/data';

export default function LeaveSettingsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'leave' | 'shifts' | 'holidays'>('leave');

  // Leave Settings State
  const [leaveSettings, setLeaveSettings] = useState<LeaveSettings>(DEFAULT_LEAVE_SETTINGS);
  const [savingLeave, setSavingLeave] = useState(false);

  // Shift Settings State
  const [shiftSettings, setShiftSettings] = useState<ShiftSettings>(DEFAULT_SHIFT_SETTINGS);
  const [employees, setEmployees] = useState<User[]>([]);
  const [savingShifts, setSavingShifts] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Holiday Settings State
  const [holidaySettings, setHolidaySettings] = useState<HolidaySettings>(DEFAULT_HOLIDAY_SETTINGS);
  const [savingHolidays, setSavingHolidays] = useState(false);
  const [holidayYearFilter, setHolidayYearFilter] = useState<string>(String(new Date().getFullYear()));
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [editingHolidayIdx, setEditingHolidayIdx] = useState<number | null>(null);
  const [editHolidayDate, setEditHolidayDate] = useState('');
  const [editHolidayName, setEditHolidayName] = useState('');

  // Load all data on mount
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [ls, ss, hs, emps] = await Promise.all([
          fetchLeaveSettings(),
          fetchShiftSettings(),
          fetchHolidaySettings(),
          getAllUsersAsync(),
        ]);
        setLeaveSettings(ls);
        setShiftSettings(ss);
        setHolidaySettings(hs);
        setEmployees(emps);
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Save Leave Settings
  const handleSaveLeaveSettings = async () => {
    setSavingLeave(true);
    try {
      const ok = await saveLeaveSettings(leaveSettings);
      if (ok) {
        toast({
          title: '✅ Leave Rules Saved',
          description: 'Employee leave application rules have been successfully updated and enforced.',
          className: 'bg-emerald-500 text-white border-none',
        });
      } else {
        toast({
          title: 'Notice',
          description: 'Settings saved locally. Server sync may take a moment.',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message || 'Failed to save leave settings.',
        variant: 'destructive',
      });
    } finally {
      setSavingLeave(false);
    }
  };

  // Save Shift Settings
  const handleSaveShiftSettings = async () => {
    setSavingShifts(true);
    try {
      const ok = await saveShiftSettings(shiftSettings);
      if (ok) {
        toast({
          title: '✅ Shift Timings Saved',
          description: 'Employee shift schedules and grace cutoffs updated successfully.',
          className: 'bg-emerald-500 text-white border-none',
        });
      } else {
        toast({
          title: 'Notice',
          description: 'Shift timings saved locally. Server sync may take a moment.',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message || 'Failed to save shift settings.',
        variant: 'destructive',
      });
    } finally {
      setSavingShifts(false);
    }
  };

  // Save Holiday Settings
  const handleSaveHolidaySettings = async () => {
    setSavingHolidays(true);
    try {
      const ok = await saveHolidaySettingsApi(holidaySettings);
      if (ok) {
        toast({
          title: '✅ Holidays Saved',
          description: 'Government holidays have been updated successfully.',
          className: 'bg-emerald-500 text-white border-none',
        });
      } else {
        toast({
          title: 'Notice',
          description: 'Holiday settings saved locally. Server sync may take a moment.',
        });
      }
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message || 'Failed to save holiday settings.',
        variant: 'destructive',
      });
    } finally {
      setSavingHolidays(false);
    }
  };

  // Holiday CRUD helpers
  const handleAddHoliday = () => {
    if (!newHolidayDate || !newHolidayName.trim()) {
      toast({ title: 'Validation', description: 'Please enter both a date and holiday name.', variant: 'destructive' });
      return;
    }
    const exists = holidaySettings.holidays.some(h => h.date === newHolidayDate);
    if (exists) {
      toast({ title: 'Duplicate', description: 'A holiday on this date already exists.', variant: 'destructive' });
      return;
    }
    setHolidaySettings({
      holidays: [...holidaySettings.holidays, { date: newHolidayDate, name: newHolidayName.trim() }]
        .sort((a, b) => a.date.localeCompare(b.date)),
    });
    setNewHolidayDate('');
    setNewHolidayName('');
    toast({ title: 'Holiday Added', description: `"${newHolidayName.trim()}" added. Click Save to persist.` });
  };

  const handleDeleteHoliday = (idx: number) => {
    const updated = [...holidaySettings.holidays];
    const removed = updated.splice(idx, 1);
    setHolidaySettings({ holidays: updated });
    toast({ title: 'Holiday Removed', description: `"${removed[0]?.name}" removed. Click Save to persist.` });
  };

  const handleStartEditHoliday = (idx: number) => {
    const h = holidaySettings.holidays[idx];
    setEditingHolidayIdx(idx);
    setEditHolidayDate(h.date);
    setEditHolidayName(h.name);
  };

  const handleSaveEditHoliday = () => {
    if (editingHolidayIdx === null) return;
    if (!editHolidayDate || !editHolidayName.trim()) {
      toast({ title: 'Validation', description: 'Both date and name are required.', variant: 'destructive' });
      return;
    }
    const updated = [...holidaySettings.holidays];
    updated[editingHolidayIdx] = { date: editHolidayDate, name: editHolidayName.trim() };
    updated.sort((a, b) => a.date.localeCompare(b.date));
    setHolidaySettings({ holidays: updated });
    setEditingHolidayIdx(null);
    setEditHolidayDate('');
    setEditHolidayName('');
  };

  // Get unique years from holidays for filter
  const currentYearStr = String(new Date().getFullYear());
  const holidayYears = Array.from(new Set([
    String(Number(currentYearStr) - 1),
    currentYearStr,
    String(Number(currentYearStr) + 1),
    ...holidaySettings.holidays.map(h => h.date.slice(0, 4))
  ])).filter(Boolean).sort();
  const filteredHolidays = holidayYearFilter === 'all'
    ? holidaySettings.holidays
    : holidaySettings.holidays.filter(h => h.date.startsWith(holidayYearFilter));

  // Bulk assign shift
  const handleBulkAssignShift = (shiftId: string) => {
    const updatedMap = { ...shiftSettings.employeeShifts };
    employees.forEach(emp => {
      const code = (emp.code || '').trim().toUpperCase();
      if (code) {
        updatedMap[code] = shiftId;
      }
    });
    setShiftSettings({
      ...shiftSettings,
      employeeShifts: updatedMap,
    });
    toast({
      title: 'Bulk Assignment Applied',
      description: `All employees assigned to selected shift. Click "Save Shift Timings" to apply.`,
    });
  };

  const getEffectiveShift = (empCode: string) => {
    const code = (empCode || '').trim().toUpperCase();
    const assignedId = shiftSettings.employeeShifts[code] || shiftSettings.defaultShiftId;
    return shiftSettings.shifts.find(s => s.id === assignedId) || shiftSettings.shifts[0];
  };

  const calculateCutoff = (startTime: string, graceMinutes: number) => {
    const parts = startTime.trim().split(/[:\s]+/);
    let hours = parseInt(parts[0], 10) || 10;
    const minutes = parseInt(parts[1], 10) || 0;
    const ampm = (parts[2] || 'AM').toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    let totalMinutes = hours * 60 + minutes + graceMinutes;
    let cutHours = Math.floor(totalMinutes / 60) % 24;
    const cutMins = totalMinutes % 60;
    const cutAmpm = cutHours >= 12 ? 'PM' : 'AM';
    cutHours = cutHours % 12 || 12;
    return `${cutHours}:${String(cutMins).padStart(2, '0')} ${cutAmpm}`;
  };

  const filteredEmployees = employees.filter(e => {
    const term = searchTerm.toLowerCase();
    return (
      (e.name || '').toLowerCase().includes(term) ||
      (e.code || '').toLowerCase().includes(term) ||
      (e.designation || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-in fade-in duration-500">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <span className="p-2.5 bg-blue-600 text-white rounded-xl shadow-md">
              <CalendarDays className="w-6 h-6" />
            </span>
            Leave & Shift Settings
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Configure advance booking rules for <strong>PL, CL, SL</strong>, manage <strong>Shift Timings</strong>, and control <strong>Government Holidays</strong>.
          </p>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-3 bg-slate-100 p-1 rounded-xl">
          <TabsTrigger
            value="leave"
            className="rounded-lg font-semibold data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm flex items-center gap-2 py-2.5"
          >
            <CalendarDays className="w-4 h-4" />
            Leave Rules
          </TabsTrigger>
          <TabsTrigger
            value="shifts"
            className="rounded-lg font-semibold data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm flex items-center gap-2 py-2.5"
          >
            <Clock className="w-4 h-4" />
            Shift Timings
          </TabsTrigger>
          <TabsTrigger
            value="holidays"
            className="rounded-lg font-semibold data-[state=active]:bg-white data-[state=active]:text-purple-700 data-[state=active]:shadow-sm flex items-center gap-2 py-2.5"
          >
            <PartyPopper className="w-4 h-4" />
            Govt. Holidays
          </TabsTrigger>
        </TabsList>

        {/* ==================================================================== */}
        {/* TAB 1: LEAVE BOOKING RULES */}
        {/* ==================================================================== */}
        <TabsContent value="leave" className="space-y-6 pt-4">
          <div className="flex items-center justify-between bg-blue-50/70 border border-blue-200 p-4 rounded-xl text-blue-900 text-sm">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Dynamic Date Enforcement Active</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Rules configured below directly control the date picker on the Employee Leave Application form.
                  Dates outside the allowed period cannot be selected.
                </p>
              </div>
            </div>
            <Button
              onClick={handleSaveLeaveSettings}
              disabled={savingLeave}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2 px-5 py-2 shadow-md shrink-0"
            >
              {savingLeave ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {savingLeave ? 'Saving...' : 'Save All Rules'}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 1. Privilege Leave (PL) Card */}
            <Card className="border-amber-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden bg-gradient-to-b from-amber-50/40 to-white">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-amber-500" />
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-bold px-2.5 py-0.5">
                    PL (Privilege Leave)
                  </Badge>
                  <Sparkles className="w-4 h-4 text-amber-500" />
                </div>
                <CardTitle className="text-xl font-bold text-slate-900 mt-2">Privilege Leave</CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Earned planned leave requiring prior management notice.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 text-sm">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Minimum Advance Notice (Days)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={30}
                      value={leaveSettings.privilege.minNoticeDays}
                      onChange={(e) =>
                        setLeaveSettings({
                          ...leaveSettings,
                          privilege: {
                            ...leaveSettings.privilege,
                            minNoticeDays: Math.max(0, parseInt(e.target.value, 10) || 0),
                          },
                        })
                      }
                      className="bg-white border-slate-300 font-semibold text-slate-900"
                    />
                    <span className="text-xs text-slate-500 shrink-0">days in advance</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    E.g. Setting 5 requires employees to book at least 5 days ahead.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Maximum Future Booking Limit (Days)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={leaveSettings.privilege.maxFutureDays}
                      onChange={(e) =>
                        setLeaveSettings({
                          ...leaveSettings,
                          privilege: {
                            ...leaveSettings.privilege,
                            maxFutureDays: Math.max(1, parseInt(e.target.value, 10) || 90),
                          },
                        })
                      }
                      className="bg-white border-slate-300 font-semibold text-slate-900"
                    />
                    <span className="text-xs text-slate-500 shrink-0">days ahead</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-semibold text-slate-800">Allow Emergency Bypass</Label>
                    <p className="text-[11px] text-slate-500">Allows short-notice if employee supplies emergency reason</p>
                  </div>
                  <Switch
                    checked={leaveSettings.privilege.allowEmergencyOverride ?? true}
                    onCheckedChange={(checked) =>
                      setLeaveSettings({
                        ...leaveSettings,
                        privilege: {
                          ...leaveSettings.privilege,
                          allowEmergencyOverride: checked,
                        },
                      })
                    }
                  />
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between opacity-60">
                  <div>
                    <Label className="text-xs font-semibold text-slate-800">Allow Past Dates</Label>
                    <p className="text-[11px] text-slate-500">Disabled (PL cannot be backdated)</p>
                  </div>
                  <Switch checked={false} disabled />
                </div>
              </CardContent>
            </Card>

            {/* 2. Casual Leave (CL) Card */}
            <Card className="border-blue-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden bg-gradient-to-b from-blue-50/40 to-white">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-blue-500" />
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Badge className="bg-blue-100 text-blue-800 border-blue-300 font-bold px-2.5 py-0.5">
                    CL (Casual Leave)
                  </Badge>
                  <CalendarDays className="w-4 h-4 text-blue-500" />
                </div>
                <CardTitle className="text-xl font-bold text-slate-900 mt-2">Casual Leave</CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Standard unplanned or short-notice personal leave.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 text-sm">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Minimum Advance Notice (Days)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={30}
                      value={leaveSettings.casual.minNoticeDays}
                      onChange={(e) =>
                        setLeaveSettings({
                          ...leaveSettings,
                          casual: {
                            ...leaveSettings.casual,
                            minNoticeDays: Math.max(0, parseInt(e.target.value, 10) || 0),
                          },
                        })
                      }
                      className="bg-white border-slate-300 font-semibold text-slate-900"
                    />
                    <span className="text-xs text-slate-500 shrink-0">days in advance</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Set to 0 for same-day booking, or 1 for 1 day prior notice.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Maximum Future Booking Limit (Days)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={leaveSettings.casual.maxFutureDays}
                      onChange={(e) =>
                        setLeaveSettings({
                          ...leaveSettings,
                          casual: {
                            ...leaveSettings.casual,
                            maxFutureDays: Math.max(1, parseInt(e.target.value, 10) || 60),
                          },
                        })
                      }
                      className="bg-white border-slate-300 font-semibold text-slate-900"
                    />
                    <span className="text-xs text-slate-500 shrink-0">days ahead</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-semibold text-slate-800">Allow Past Dates / Backdating</Label>
                    <p className="text-[11px] text-slate-500">Allow selecting past dates for CL</p>
                  </div>
                  <Switch
                    checked={leaveSettings.casual.allowPastDates}
                    onCheckedChange={(checked) =>
                      setLeaveSettings({
                        ...leaveSettings,
                        casual: {
                          ...leaveSettings.casual,
                          allowPastDates: checked,
                          maxPastDays: checked ? 1 : 0,
                        },
                      })
                    }
                  />
                </div>

                {leaveSettings.casual.allowPastDates && (
                  <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <Label className="text-xs font-bold text-slate-700">Max Past Days Allowed</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={7}
                        value={leaveSettings.casual.maxPastDays}
                        onChange={(e) =>
                          setLeaveSettings({
                            ...leaveSettings,
                            casual: {
                              ...leaveSettings.casual,
                              maxPastDays: Math.max(1, parseInt(e.target.value, 10) || 1),
                            },
                          })
                        }
                        className="bg-white border-slate-300 w-24"
                      />
                      <span className="text-xs text-slate-500">day(s) in past</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 3. Sick Leave (SL) Card */}
            <Card className="border-rose-200 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden bg-gradient-to-b from-rose-50/40 to-white">
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-rose-500" />
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Badge className="bg-rose-100 text-rose-800 border-rose-300 font-bold px-2.5 py-0.5">
                    SL (Sick Leave)
                  </Badge>
                  <AlertCircle className="w-4 h-4 text-rose-500" />
                </div>
                <CardTitle className="text-xl font-bold text-slate-900 mt-2">Sick Leave</CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Medical emergency leave with retrospective application rights.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 text-sm">
                <div className="pt-1 flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-semibold text-slate-800">Allow Retrospective (Past) Dates</Label>
                    <p className="text-[11px] text-slate-500">Essential for employees who fell sick before applying</p>
                  </div>
                  <Switch
                    checked={leaveSettings.sick.allowPastDates}
                    onCheckedChange={(checked) =>
                      setLeaveSettings({
                        ...leaveSettings,
                        sick: {
                          ...leaveSettings.sick,
                          allowPastDates: checked,
                          maxPastDays: checked ? 2 : 0,
                        },
                      })
                    }
                  />
                </div>

                {leaveSettings.sick.allowPastDates && (
                  <div className="space-y-2 p-3 bg-rose-50/60 rounded-lg border border-rose-200">
                    <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Max Backdated Days Allowed
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={14}
                        value={leaveSettings.sick.maxPastDays}
                        onChange={(e) =>
                          setLeaveSettings({
                            ...leaveSettings,
                            sick: {
                              ...leaveSettings.sick,
                              maxPastDays: Math.max(1, parseInt(e.target.value, 10) || 2),
                            },
                          })
                        }
                        className="bg-white border-slate-300 font-semibold text-slate-900 w-28"
                      />
                      <span className="text-xs text-slate-600">day(s) prior to today</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Allows employees to pick dates up to {leaveSettings.sick.maxPastDays} day(s) before today.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Maximum Future Booking Limit (Days)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      value={leaveSettings.sick.maxFutureDays}
                      onChange={(e) =>
                        setLeaveSettings({
                          ...leaveSettings,
                          sick: {
                            ...leaveSettings.sick,
                            maxFutureDays: Math.max(1, parseInt(e.target.value, 10) || 5),
                          },
                        })
                      }
                      className="bg-white border-slate-300 font-semibold text-slate-900"
                    />
                    <span className="text-xs text-slate-500 shrink-0">days in future</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Sick leave is typically immediate (recommend 3 - 7 days).
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end pt-4">
            <Button
              onClick={handleSaveLeaveSettings}
              disabled={savingLeave}
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-2 px-8 shadow-lg"
            >
              {savingLeave ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {savingLeave ? 'Saving Rules...' : 'Save Leave Rules'}
            </Button>
          </div>
        </TabsContent>

        {/* ==================================================================== */}
        {/* TAB 2: EMPLOYEE SHIFT TIMINGS */}
        {/* ==================================================================== */}
        <TabsContent value="shifts" className="space-y-6 pt-4">
          {/* Header Action Bar */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-emerald-50/70 border border-emerald-200 p-4 rounded-xl text-emerald-950 text-sm">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Multiple Shift Management & Grace Time</p>
                <p className="text-xs text-emerald-800 mt-0.5">
                  Configure default office shifts and assign specific shifts (e.g. 9:30 AM, 10:00 AM, 11:00 AM) to individual employees.
                  Late arrivals in attendance reports will automatically calculate using their assigned shift cutoff!
                </p>
              </div>
            </div>
            <Button
              onClick={handleSaveShiftSettings}
              disabled={savingShifts}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-2 px-5 py-2 shadow-md shrink-0"
            >
              {savingShifts ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {savingShifts ? 'Saving...' : 'Save Shift Timings'}
            </Button>
          </div>

          {/* Shift Definitions Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {shiftSettings.shifts.map((s) => {
              const cutoff = calculateCutoff(s.startTime, s.graceMinutes);
              const isDefault = shiftSettings.defaultShiftId === s.id;
              return (
                <Card
                  key={s.id}
                  className={`border shadow-sm transition-all ${
                    isDefault ? 'border-emerald-400 bg-emerald-50/30 ring-2 ring-emerald-500/20' : 'border-slate-200 bg-white'
                  }`}
                >
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <Badge className={isDefault ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-100 text-slate-700'}>
                        {isDefault ? '⭐ Default Shift' : 'Shift'}
                      </Badge>
                      <span className="text-xs font-mono font-bold text-slate-500">{s.id}</span>
                    </div>
                    <CardTitle className="text-base font-bold text-slate-900 mt-1">{s.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-2 space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-slate-500">Working Hours:</span>
                      <span className="font-semibold text-slate-800">{s.startTime} — {s.endTime}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-slate-500">Grace Period:</span>
                      <span className="font-semibold text-amber-600">+{s.graceMinutes} mins</span>
                    </div>
                    <div className="flex justify-between items-center py-1 bg-slate-50 px-2 rounded font-medium">
                      <span className="text-slate-600">Late After Cutoff:</span>
                      <span className="font-bold text-rose-600">{cutoff}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Shift Configuration Controls */}
          <Card className="border-slate-200 shadow-sm bg-white">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <CardTitle className="text-lg font-bold text-slate-900">Employee Shift Assignments</CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Assign a specific shift to each employee. If not explicitly assigned, they inherit the Default Shift.
                  </CardDescription>
                </div>
                {/* Search & Bulk Assign */}
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input
                      placeholder="Search employee..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 h-9 text-xs bg-slate-50 border-slate-200"
                    />
                  </div>
                  <Select onValueChange={(val) => handleBulkAssignShift(val)}>
                    <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200 w-44">
                      <SelectValue placeholder="Bulk Assign All..." />
                    </SelectTrigger>
                    <SelectContent>
                      {shiftSettings.shifts.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          Set All to {s.name.split('(')[0]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
                <Table>
                  <TableHeader className="bg-slate-50/80 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="font-bold text-xs text-slate-600">Employee Code</TableHead>
                      <TableHead className="font-bold text-xs text-slate-600">Employee Name</TableHead>
                      <TableHead className="font-bold text-xs text-slate-600">Designation</TableHead>
                      <TableHead className="font-bold text-xs text-slate-600">Assigned Shift</TableHead>
                      <TableHead className="font-bold text-xs text-slate-600">Late Cutoff Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmployees.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-slate-400 text-sm">
                          {loading ? 'Loading employees...' : 'No employees matching search.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredEmployees.map((emp) => {
                        const code = (emp.code || '').trim().toUpperCase();
                        const currentShift = getEffectiveShift(code);
                        const cutoff = calculateCutoff(currentShift.startTime, currentShift.graceMinutes);
                        const isCustom = !!shiftSettings.employeeShifts[code];

                        return (
                          <TableRow key={emp.id || code} className="hover:bg-slate-50/60 transition-colors">
                            <TableCell className="font-mono font-bold text-blue-600 text-xs">
                              {code}
                            </TableCell>
                            <TableCell className="font-semibold text-slate-800 text-sm">
                              {emp.name}
                            </TableCell>
                            <TableCell className="text-xs text-slate-500">
                              {emp.designation || 'Staff'}
                            </TableCell>
                            <TableCell>
                              <Select
                                value={shiftSettings.employeeShifts[code] || shiftSettings.defaultShiftId}
                                onValueChange={(val) => {
                                  setShiftSettings({
                                    ...shiftSettings,
                                    employeeShifts: {
                                      ...shiftSettings.employeeShifts,
                                      [code]: val,
                                    },
                                  });
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs bg-white border-slate-200 w-64 font-medium">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {shiftSettings.shifts.map((s) => (
                                    <SelectItem key={s.id} value={s.id} className="text-xs">
                                      {s.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`text-[11px] font-semibold ${
                                  isCustom
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-slate-50 text-slate-600 border-slate-200'
                                }`}
                              >
                                Late after {cutoff}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end pt-4">
            <Button
              onClick={handleSaveShiftSettings}
              disabled={savingShifts}
              size="lg"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-2 px-8 shadow-lg"
            >
              {savingShifts ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {savingShifts ? 'Saving Timings...' : 'Save Shift Timings'}
            </Button>
          </div>
        </TabsContent>

        {/* ==================================================================== */}
        {/* TAB 3: GOVERNMENT HOLIDAYS */}
        {/* ==================================================================== */}
        <TabsContent value="holidays" className="space-y-6 pt-4">
          {/* Header Action Bar */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-purple-50/70 border border-purple-200 p-4 rounded-xl text-purple-950 text-sm">
            <div className="flex items-start gap-3">
              <PartyPopper className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Government & Public Holidays Management</p>
                <p className="text-xs text-purple-800 mt-0.5">
                  Add, edit, or remove public holidays. These holidays will appear on Employee Profiles and are used across the system.
                </p>
              </div>
            </div>
            <Button
              onClick={handleSaveHolidaySettings}
              disabled={savingHolidays}
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold flex items-center gap-2 px-5 py-2 shadow-md shrink-0"
            >
              {savingHolidays ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {savingHolidays ? 'Saving...' : 'Save Holidays'}
            </Button>
          </div>

          {/* Add New Holiday */}
          <Card className="border-purple-200 shadow-sm bg-gradient-to-b from-purple-50/30 to-white">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-purple-600" />
                Add New Holiday
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Enter the date and name of the government/public holiday to add.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-end gap-3">
                <div className="w-full sm:w-48 space-y-1">
                  <Label className="text-xs font-bold text-slate-700">Date</Label>
                  <Input
                    type="date"
                    value={newHolidayDate}
                    onChange={(e) => setNewHolidayDate(e.target.value)}
                    className="bg-white border-slate-300"
                  />
                </div>
                <div className="flex-1 w-full space-y-1">
                  <Label className="text-xs font-bold text-slate-700">Holiday Name</Label>
                  <Input
                    placeholder="e.g. Republic Day, Diwali, Christmas"
                    value={newHolidayName}
                    onChange={(e) => setNewHolidayName(e.target.value)}
                    className="bg-white border-slate-300"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddHoliday()}
                  />
                </div>
                <Button
                  onClick={handleAddHoliday}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-semibold flex items-center gap-2 px-5 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  Add Holiday
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Holiday List */}
          <Card className="border-slate-200 shadow-sm bg-white">
            <CardHeader className="pb-3 border-b border-slate-100">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <CardTitle className="text-lg font-bold text-slate-900">Holiday Calendar</CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    {holidaySettings.holidays.length} total holidays configured across all years.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <Select value={holidayYearFilter} onValueChange={setHolidayYearFilter}>
                    <SelectTrigger className="h-9 text-xs bg-slate-50 border-slate-200 w-36">
                      <SelectValue placeholder="Filter by year" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All Years</SelectItem>
                      {holidayYears.map((y) => (
                        <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 font-semibold">
                    {filteredHolidays.length} holiday{filteredHolidays.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader className="bg-slate-50/80 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="font-bold text-xs text-slate-600 w-12">#</TableHead>
                      <TableHead className="font-bold text-xs text-slate-600">Date</TableHead>
                      <TableHead className="font-bold text-xs text-slate-600">Day</TableHead>
                      <TableHead className="font-bold text-xs text-slate-600">Holiday Name</TableHead>
                      <TableHead className="font-bold text-xs text-slate-600">Status</TableHead>
                      <TableHead className="font-bold text-xs text-slate-600 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHolidays.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-slate-400 text-sm">
                          <PartyPopper className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                          No holidays found for {holidayYearFilter === 'all' ? 'any year' : holidayYearFilter}.
                          <br />
                          <span className="text-xs">Add holidays above to get started.</span>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredHolidays.map((holiday, filteredIdx) => {
                        // Find the actual index in the main array for edit/delete
                        const realIdx = holidaySettings.holidays.findIndex(
                          h => h.date === holiday.date && h.name === holiday.name
                        );
                        const isEditing = editingHolidayIdx === realIdx;
                        const holidayDate = new Date(holiday.date + 'T00:00:00');
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const isPast = holidayDate < today;
                        const dayName = holidayDate.toLocaleDateString('en-IN', { weekday: 'long' });
                        const formattedDate = holidayDate.toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        });

                        return (
                          <TableRow
                            key={`${holiday.date}-${holiday.name}`}
                            className={`hover:bg-slate-50/60 transition-colors ${isPast ? 'opacity-60' : ''}`}
                          >
                            <TableCell className="text-xs text-slate-400 font-mono">
                              {filteredIdx + 1}
                            </TableCell>
                            <TableCell className="font-semibold text-slate-800 text-sm">
                              {isEditing ? (
                                <Input
                                  type="date"
                                  value={editHolidayDate}
                                  onChange={(e) => setEditHolidayDate(e.target.value)}
                                  className="bg-white border-purple-300 h-8 text-xs w-40"
                                />
                              ) : (
                                formattedDate
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-slate-500">
                              {dayName}
                            </TableCell>
                            <TableCell className="font-medium text-slate-800 text-sm">
                              {isEditing ? (
                                <Input
                                  value={editHolidayName}
                                  onChange={(e) => setEditHolidayName(e.target.value)}
                                  className="bg-white border-purple-300 h-8 text-xs"
                                  onKeyDown={(e) => e.key === 'Enter' && handleSaveEditHoliday()}
                                />
                              ) : (
                                holiday.name
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`text-[11px] font-semibold ${
                                  isPast
                                    ? 'bg-slate-50 text-slate-500 border-slate-200'
                                    : 'bg-green-50 text-green-700 border-green-200'
                                }`}
                              >
                                {isPast ? 'Past' : 'Upcoming'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="sm"
                                    onClick={handleSaveEditHoliday}
                                    className="h-7 px-3 text-xs bg-purple-600 hover:bg-purple-700 text-white"
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => { setEditingHolidayIdx(null); setEditHolidayDate(''); setEditHolidayName(''); }}
                                    className="h-7 px-2 text-xs text-slate-600"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleStartEditHoliday(realIdx)}
                                    className="h-7 w-7 p-0 text-slate-500 hover:text-blue-600"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDeleteHoliday(realIdx)}
                                    className="h-7 w-7 p-0 text-slate-500 hover:text-rose-600"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end pt-4">
            <Button
              onClick={handleSaveHolidaySettings}
              disabled={savingHolidays}
              size="lg"
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold flex items-center gap-2 px-8 shadow-lg"
            >
              {savingHolidays ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {savingHolidays ? 'Saving Holidays...' : 'Save Holidays'}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
