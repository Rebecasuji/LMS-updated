import { useEffect, useMemo, useState } from 'react';
import {
    addDays,
    addMonths,
    differenceInCalendarDays,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameMonth,
    isToday,
    startOfMonth,
    startOfWeek,
    subMonths,
} from 'date-fns';
import {
    CalendarDays,
    Briefcase,
    ChevronLeft,
    ChevronRight,
    Clock,
    PartyPopper,
    Timer,
    type LucideIcon,
} from 'lucide-react';
import { LeaveRequest } from '@/lib/data';
import type { PermissionRequest } from '@/lib/storage';
import { fetchHolidaySettings } from '@/lib/settings';
import { cn } from '@/lib/utils';

type Cat = 'leave' | 'od' | 'ot' | 'permission';

interface Entry {
    id: string;
    cat: Cat;
    name: string;
    code: string;
    label: string;   // e.g. "Casual Leave", "On Duty", "Late Entry"
    detail: string;  // e.g. "Full Day", "Half Day", "10:00–11:00"
    pending: boolean;
    date: string;    // yyyy-MM-dd
}

const CAT_ORDER: Cat[] = ['leave', 'od', 'ot', 'permission'];

const CAT: Record<Cat, { title: string; icon: LucideIcon; chip: string; pendingChip: string; dot: string; avatar: string; pill: string }> = {
    leave: {
        title: 'On Leave',
        icon: CalendarDays,
        chip: 'bg-rose-50 text-rose-700 border-l-2 border-rose-500 dark:bg-rose-500/15 dark:text-rose-200',
        pendingChip: 'bg-white text-rose-700 border border-dashed border-rose-300 dark:bg-transparent dark:text-rose-200',
        dot: 'bg-rose-500',
        avatar: 'bg-rose-100 text-rose-700',
        pill: 'bg-rose-50 text-rose-700 border-rose-200',
    },
    od: {
        title: 'On Duty (OD)',
        icon: Briefcase,
        chip: 'bg-indigo-50 text-indigo-700 border-l-2 border-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-200',
        pendingChip: 'bg-white text-indigo-700 border border-dashed border-indigo-300 dark:bg-transparent dark:text-indigo-200',
        dot: 'bg-indigo-500',
        avatar: 'bg-indigo-100 text-indigo-700',
        pill: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    },
    ot: {
        title: 'Overtime (OT)',
        icon: Timer,
        chip: 'bg-teal-50 text-teal-700 border-l-2 border-teal-500 dark:bg-teal-500/15 dark:text-teal-200',
        pendingChip: 'bg-white text-teal-700 border border-dashed border-teal-300 dark:bg-transparent dark:text-teal-200',
        dot: 'bg-teal-500',
        avatar: 'bg-teal-100 text-teal-700',
        pill: 'bg-teal-50 text-teal-700 border-teal-200',
    },
    permission: {
        title: 'Permission',
        icon: Clock,
        chip: 'bg-amber-50 text-amber-800 border-l-2 border-amber-500 dark:bg-amber-500/15 dark:text-amber-200',
        pendingChip: 'bg-white text-amber-800 border border-dashed border-amber-300 dark:bg-transparent dark:text-amber-200',
        dot: 'bg-amber-500',
        avatar: 'bg-amber-100 text-amber-800',
        pill: 'bg-amber-50 text-amber-800 border-amber-200',
    },
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toKey = (d: Date) => format(d, 'yyyy-MM-dd');
const parseKey = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
};
const initials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// "14 Oct", "14–16 Oct", "30 Oct – 2 Nov"
function formatRange(a: Date, b: Date) {
    if (differenceInCalendarDays(b, a) === 0) return format(a, 'd MMM');
    if (isSameMonth(a, b)) return `${format(a, 'd')}–${format(b, 'd MMM')}`;
    return `${format(a, 'd MMM')} – ${format(b, 'd MMM')}`;
}
function compressDates(keys: string[]): string[] {
    const days = Array.from(new Set(keys)).sort().map(parseKey);
    const out: string[] = [];
    let start: Date | null = null;
    let prev: Date | null = null;
    days.forEach((d) => {
        if (start && prev && differenceInCalendarDays(d, prev) === 1) {
            prev = d;
        } else {
            if (start && prev) out.push(formatRange(start, prev));
            start = d;
            prev = d;
        }
    });
    if (start && prev) out.push(formatRange(start, prev));
    return out;
}

interface Props {
    leaves: LeaveRequest[];
    permissions: PermissionRequest[];
}

export function LeaveCalendar({ leaves, permissions }: Props) {
    const today = new Date();
    const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(today));
    const [selected, setSelected] = useState<Date>(today);
    const [panel, setPanel] = useState<'day' | 'month'>('day');
    const [activeCats, setActiveCats] = useState<Set<Cat>>(new Set(CAT_ORDER));
    const [showPending, setShowPending] = useState(true);
    const [holidays, setHolidays] = useState<Record<string, string>>({});

    useEffect(() => {
        let mounted = true;
        fetchHolidaySettings()
            .then((s) => {
                if (!mounted) return;
                const map: Record<string, string> = {};
                (s.holidays || []).forEach((h) => {
                    if (h.date) map[h.date.slice(0, 10)] = h.name;
                });
                setHolidays(map);
            })
            .catch(() => { });
        return () => {
            mounted = false;
        };
    }, []);

    // ---- Every leave / OD / OT / permission, expanded to one entry per day ----
    const entriesByDate = useMemo(() => {
        const map = new Map<string, Entry[]>();
        const push = (e: Entry) => {
            const arr = map.get(e.date);
            if (arr) arr.push(e);
            else map.set(e.date, [e]);
        };

        leaves.forEach((l) => {
            if (l.status !== 'Approved' && l.status !== 'Pending') return;
            if (l.status === 'Pending' && !showPending) return;
            const startKey = (l.startDate || '').slice(0, 10);
            if (!startKey) return;
            const endKey = (l.endDate || l.startDate || '').slice(0, 10) || startKey;

            const cat: Cat = l.type === 'OD' ? 'od' : l.type === 'OT' ? 'ot' : 'leave';
            const from = l.odFromTime || l.fromTime;
            const to = l.odToTime || l.toTime;
            const detail = l.duration === 'Hourly' && from && to ? `${from}–${to}` : l.duration || 'Full Day';
            const label = cat === 'od' ? 'On Duty' : cat === 'ot' ? 'Overtime' : l.type === 'LWP' ? 'LWP' : `${l.type} Leave`;

            let cur = parseKey(startKey);
            const end = parseKey(endKey);
            let guard = 0;
            while (cur.getTime() <= end.getTime() && guard++ < 400) {
                push({
                    id: `L-${l.id}-${toKey(cur)}`,
                    cat,
                    name: l.employeeName || l.employeeCode,
                    code: l.employeeCode,
                    label,
                    detail,
                    pending: l.status === 'Pending',
                    date: toKey(cur),
                });
                cur = addDays(cur, 1);
            }
        });

        permissions.forEach((p) => {
            if (p.status !== 'Approved' && p.status !== 'Pending') return;
            if (p.status === 'Pending' && !showPending) return;
            const key = (p.date || '').slice(0, 10);
            if (!key) return;
            push({
                id: `P-${p.id}`,
                cat: 'permission',
                name: p.employeeName || p.employeeCode,
                code: p.employeeCode,
                label: (p.type || 'Permission').replace(' Permission', ''),
                detail: p.startTime && p.endTime ? `${p.startTime}–${p.endTime}` : '',
                pending: p.status === 'Pending',
                date: key,
            });
        });

        map.forEach((arr) =>
            arr.sort((a, b) => CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat) || a.name.localeCompare(b.name))
        );
        return map;
    }, [leaves, permissions, showPending]);

    const entriesFor = (key: string) => (entriesByDate.get(key) || []).filter((e) => activeCats.has(e.cat));

    // ---- Month grid ----
    const gridDays = useMemo(
        () => eachDayOfInterval({ start: startOfWeek(startOfMonth(viewMonth)), end: endOfWeek(endOfMonth(viewMonth)) }),
        [viewMonth]
    );
    const monthDays = useMemo(
        () => eachDayOfInterval({ start: startOfMonth(viewMonth), end: endOfMonth(viewMonth) }),
        [viewMonth]
    );

    // Distinct people per category in this month (for the filter chips)
    const peopleCount = useMemo(() => {
        const sets: Record<Cat, Set<string>> = { leave: new Set(), od: new Set(), ot: new Set(), permission: new Set() };
        monthDays.forEach((d) => (entriesByDate.get(toKey(d)) || []).forEach((e) => sets[e.cat].add(e.code || e.name)));
        return { leave: sets.leave.size, od: sets.od.size, ot: sets.ot.size, permission: sets.permission.size } as Record<Cat, number>;
    }, [monthDays, entriesByDate]);

    // Whole-month roster
    const roster = useMemo(() => {
        const groups = new Map<string, { entry: Entry; dates: string[] }>();
        monthDays.forEach((d) => {
            const key = toKey(d);
            entriesFor(key).forEach((e) => {
                const gk = `${e.code}|${e.cat}|${e.label}|${e.detail}|${e.pending}`;
                const g = groups.get(gk);
                if (g) g.dates.push(key);
                else groups.set(gk, { entry: e, dates: [key] });
            });
        });
        return Array.from(groups.values()).sort(
            (a, b) => CAT_ORDER.indexOf(a.entry.cat) - CAT_ORDER.indexOf(b.entry.cat) || a.entry.name.localeCompare(b.entry.name) || a.dates[0].localeCompare(b.dates[0])
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [monthDays, entriesByDate, activeCats]);

    const goMonth = (m: Date) => {
        setViewMonth(startOfMonth(m));
        setSelected(isSameMonth(m, today) ? today : startOfMonth(m));
    };
    const toggleCat = (c: Cat) =>
        setActiveCats((prev) => {
            const next = new Set(prev);
            if (next.has(c)) next.delete(c);
            else next.add(c);
            return next;
        });

    const selectedKey = toKey(selected);
    const selectedEntries = entriesFor(selectedKey);
    const selectedHoliday = holidays[selectedKey];

    return (
        <div className="relative pt-8">
            {/* Nail + string the calendar hangs from */}
            <svg viewBox="0 0 200 40" className="pointer-events-none absolute left-1/2 top-0 h-10 w-44 -translate-x-1/2 text-slate-400" aria-hidden="true">
                <polyline points="22,38 100,7 178,38" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="100" cy="6" r="4.5" fill="#94a3b8" stroke="#64748b" strokeWidth="1" />
            </svg>

            <div className="relative rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                {/* Binder rings */}
                <div className="pointer-events-none absolute inset-x-0 -top-3 z-10 flex justify-between px-8 sm:px-16" aria-hidden="true">
                    {Array.from({ length: 14 }).map((_, i) => (
                        <span key={i} className="h-6 w-2.5 rounded-full bg-gradient-to-b from-slate-100 via-slate-400 to-slate-500 shadow ring-1 ring-black/10" />
                    ))}
                </div>

                {/* Header band */}
                <div className="rounded-t-2xl bg-gradient-to-r from-[#1A3DB1] to-[#2F5FE3] px-5 pb-4 pt-8 text-white">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Who is away</p>
                            <h3 className="text-2xl font-bold leading-tight sm:text-3xl" data-testid="text-calendar-month">
                                {format(viewMonth, 'MMMM')} <span className="font-medium text-white/70">{format(viewMonth, 'yyyy')}</span>
                            </h3>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => goMonth(new Date())}
                                className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-white/20"
                            >
                                Today
                            </button>
                            <button
                                type="button"
                                onClick={() => goMonth(subMonths(viewMonth, 1))}
                                aria-label="Previous month"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/30 bg-white/10 transition-colors hover:bg-white/20"
                                data-testid="button-calendar-prev"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => goMonth(addMonths(viewMonth, 1))}
                                aria-label="Next month"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/30 bg-white/10 transition-colors hover:bg-white/20"
                                data-testid="button-calendar-next"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        {CAT_ORDER.map((c) => {
                            const on = activeCats.has(c);
                            const Icon = CAT[c].icon;
                            return (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => toggleCat(c)}
                                    aria-pressed={on}
                                    title="Number of different employees this month"
                                    className={cn(
                                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                                        on ? 'border-white bg-white text-slate-900' : 'border-white/30 bg-transparent text-white/70 hover:bg-white/10'
                                    )}
                                    data-testid={`filter-${c}`}
                                >
                                    <span className={cn('h-2 w-2 rounded-full', CAT[c].dot)} />
                                    <Icon className="h-3.5 w-3.5" />
                                    {CAT[c].title}
                                    <span className={cn('rounded-full px-1.5 text-[10px]', on ? 'bg-slate-100 text-slate-700' : 'bg-white/15')}>{peopleCount[c]}</span>
                                </button>
                            );
                        })}
                        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs font-medium text-white/85">
                            <input type="checkbox" checked={showPending} onChange={(e) => setShowPending(e.target.checked)} data-testid="checkbox-show-pending" />
                            Include pending (dashed)
                        </label>
                    </div>
                </div>

                {/* Body */}
                <div className="grid grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
                    {/* Month grid */}
                    <div className="p-3 sm:p-4">
                        <div className="grid grid-cols-7 text-center text-[11px] font-bold uppercase tracking-wide text-slate-400">
                            {WEEKDAYS.map((w, i) => (
                                <div key={w} className={cn('py-2', i === 0 && 'text-rose-400')}>{w}</div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                            {gridDays.map((d, idx) => {
                                const key = toKey(d);
                                const inMonth = isSameMonth(d, viewMonth);
                                const list = entriesFor(key);
                                const holiday = holidays[key];
                                const isSel = key === selectedKey;
                                const isSun = d.getDay() === 0;
                                return (
                                    <button
                                        type="button"
                                        key={key}
                                        onClick={() => {
                                            setSelected(d);
                                            setPanel('day');
                                        }}
                                        aria-label={`${format(d, 'd MMMM')}: ${list.length} ${list.length === 1 ? 'entry' : 'entries'}${holiday ? `, ${holiday}` : ''}`}
                                        className={cn(
                                            'relative flex min-h-[64px] flex-col gap-1 border-slate-100 p-1 text-left transition-colors sm:min-h-[96px] sm:p-1.5 dark:border-slate-800',
                                            idx % 7 !== 6 && 'border-r',
                                            idx < gridDays.length - 7 && 'border-b',
                                            !inMonth && 'bg-slate-50/70 opacity-50 dark:bg-slate-800/40',
                                            inMonth && isSun && 'bg-rose-50/40 dark:bg-rose-500/5',
                                            inMonth && holiday && 'bg-emerald-50/70 dark:bg-emerald-500/10',
                                            isSel && 'z-[1] ring-2 ring-inset ring-blue-600',
                                            'hover:bg-blue-50/60 dark:hover:bg-slate-800'
                                        )}
                                        data-testid={`calendar-day-${key}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span
                                                className={cn(
                                                    'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold',
                                                    isToday(d) ? 'bg-blue-600 text-white' : isSun ? 'text-rose-500' : 'text-slate-700 dark:text-slate-200'
                                                )}
                                            >
                                                {format(d, 'd')}
                                            </span>
                                            {holiday && <PartyPopper className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />}
                                        </div>

                                        {holiday && inMonth && (
                                            <span className="hidden truncate text-[10px] font-medium leading-tight text-emerald-700 sm:block dark:text-emerald-300">{holiday}</span>
                                        )}

                                        {/* Desktop: names */}
                                        <div className="hidden flex-col gap-0.5 sm:flex">
                                            {list.slice(0, 3).map((e) => (
                                                <span
                                                    key={e.id}
                                                    className={cn('truncate rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight', e.pending ? CAT[e.cat].pendingChip : CAT[e.cat].chip)}
                                                    title={`${e.name} — ${e.label}${e.detail ? ` (${e.detail})` : ''}${e.pending ? ' — pending' : ''}`}
                                                >
                                                    {e.name}
                                                </span>
                                            ))}
                                            {list.length > 3 && <span className="px-1 text-[10px] font-semibold text-blue-700 dark:text-blue-300">+{list.length - 3} more</span>}
                                        </div>

                                        {/* Mobile: dots */}
                                        {list.length > 0 && (
                                            <div className="flex flex-wrap items-center gap-0.5 sm:hidden">
                                                {list.slice(0, 4).map((e) => (
                                                    <span key={e.id} className={cn('h-1.5 w-1.5 rounded-full', CAT[e.cat].dot, e.pending && 'opacity-40')} />
                                                ))}
                                                {list.length > 4 && <span className="text-[9px] font-bold text-slate-500">+{list.length - 4}</span>}
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                            {CAT_ORDER.map((c) => (
                                <span key={c} className="inline-flex items-center gap-1.5">
                                    <span className={cn('h-2 w-2 rounded-full', CAT[c].dot)} />
                                    {CAT[c].title}
                                </span>
                            ))}
                            <span className="inline-flex items-center gap-1.5">
                                <PartyPopper className="h-3 w-3 text-emerald-600" /> Holiday
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                                <span className="h-3 w-5 rounded border border-dashed border-slate-400" /> Pending approval
                            </span>
                        </div>
                    </div>

                    {/* Side panel */}
                    <aside className="border-t border-slate-200 bg-slate-50/60 p-4 lg:border-l lg:border-t-0 dark:border-slate-700 dark:bg-slate-800/40">
                        <div className="mb-3 inline-flex rounded-lg bg-slate-200/70 p-0.5 text-xs font-semibold dark:bg-slate-700">
                            {(['day', 'month'] as const).map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setPanel(p)}
                                    className={cn(
                                        'rounded-md px-3 py-1.5 transition-colors',
                                        panel === p ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-300' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                                    )}
                                    data-testid={`panel-${p}`}
                                >
                                    {p === 'day' ? 'Selected day' : 'Whole month'}
                                </button>
                            ))}
                        </div>

                        {panel === 'day' ? (
                            <div className="space-y-4">
                                <div>
                                    <p className="text-base font-bold text-slate-900 dark:text-slate-100">
                                        {format(selected, 'EEEE, d MMMM yyyy')}
                                        {isToday(selected) && <span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 align-middle text-[10px] font-semibold text-white">Today</span>}
                                    </p>
                                    {selectedHoliday && (
                                        <p className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                                            <PartyPopper className="h-3.5 w-3.5" /> {selectedHoliday}
                                        </p>
                                    )}
                                </div>

                                {selectedEntries.length === 0 ? (
                                    <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500 dark:bg-slate-900">
                                        {selectedHoliday ? 'Holiday — no leave, OD or permission entries.' : 'Everyone is available — no leave, OD or permission on this day.'}
                                    </p>
                                ) : (
                                    CAT_ORDER.map((c) => {
                                        const items = selectedEntries.filter((e) => e.cat === c);
                                        if (!items.length) return null;
                                        const Icon = CAT[c].icon;
                                        return (
                                            <div key={c}>
                                                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                                                    <Icon className="h-3.5 w-3.5" /> {CAT[c].title} ({items.length})
                                                </p>
                                                <ul className="space-y-1.5">
                                                    {items.map((e) => (
                                                        <li key={e.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                                                            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', CAT[c].avatar)}>{initials(e.name)}</span>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{e.name}</p>
                                                                <p className="truncate text-xs text-slate-500">
                                                                    {e.label}
                                                                    {e.detail ? ` · ${e.detail}` : ''}
                                                                </p>
                                                            </div>
                                                            {e.pending && <span className="shrink-0 rounded-full border border-dashed border-amber-400 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Pending</span>}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-base font-bold text-slate-900 dark:text-slate-100">{format(viewMonth, 'MMMM yyyy')}</p>
                                {roster.length === 0 ? (
                                    <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500 dark:bg-slate-900">Nothing booked this month.</p>
                                ) : (
                                    <ul className="max-h-[440px] space-y-1.5 overflow-y-auto pr-1">
                                        {roster.map(({ entry: e, dates }) => (
                                            <li key={`${e.code}-${e.cat}-${e.label}-${e.detail}-${e.pending}`} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                                                <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', CAT[e.cat].avatar)}>{initials(e.name)}</span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{e.name}</p>
                                                    <p className="text-xs text-slate-500">
                                                        <span className={cn('mr-1.5 inline-block rounded border px-1.5 py-px text-[10px] font-semibold', CAT[e.cat].pill)}>{e.label}</span>
                                                        {e.detail && e.detail !== 'Full Day' ? `${e.detail} · ` : ''}
                                                        {compressDates(dates).join(', ')}
                                                    </p>
                                                </div>
                                                {e.pending && <span className="shrink-0 rounded-full border border-dashed border-amber-400 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Pending</span>}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </aside>
                </div>
            </div>
        </div>
    );
}