import { useAuth } from '@/context/AuthContext';
import { getStoredLeaves } from '@/lib/storage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Filter, RotateCcw, Search, CalendarDays } from 'lucide-react';

type LeaveFilters = {
  type: string;
  status: string;
  duration: string;
  leaveDateFrom: string;
  leaveDateTo: string;
  appliedDateFrom: string;
  appliedDateTo: string;
};

const emptyFilters: LeaveFilters = {
  type: '',
  status: '',
  duration: '',
  leaveDateFrom: '',
  leaveDateTo: '',
  appliedDateFrom: '',
  appliedDateTo: '',
};

const dateKey = (value?: string) => value?.slice(0, 10) || '';

export default function LeaveHistory() {
  const { user } = useAuth();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<LeaveFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<LeaveFilters>(emptyFilters);
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!user) return;
      const all = await getStoredLeaves();
      if (!mounted) return;
      // Match by employeeCode (username) OR employeeId (user_id) to handle different DB states
      const matched = all.filter((l: any) => (
        l.employeeCode === user.code ||
        l.employeeId === user.id ||
        l.employeeCode === user.id ||
        l.employeeId === user.code
      ));
      // sort newest first
      matched.sort((a: any, b: any) => new Date(b.appliedDate).getTime() - new Date(a.appliedDate).getTime());
      setLeaves(matched);
    };
    load();
    return () => { mounted = false; };
  }, [user]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'Rejected': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    }
  };

  const activeFilterCount = Object.values(appliedFilters).filter(Boolean).length;
  const leaveTypes = Array.from(new Set(leaves.map((leave) => leave.type).filter(Boolean))).sort();
  const statuses = ['Pending', 'Approved', 'Rejected', 'Cancelled'];
  const durations = Array.from(new Set(leaves.map((leave) => leave.duration).filter(Boolean))).sort();

  // Build year options: always include current year and previous 3 years, plus any years found in data
  const currentYearNum = new Date().getFullYear();
  const baseYears = [
    String(currentYearNum),
    String(currentYearNum - 1),
    String(currentYearNum - 2),
    String(currentYearNum - 3),
  ];
  const allYearsSet = new Set<string>(baseYears);
  leaves.forEach((l) => {
    const y1 = (l.startDate || '').slice(0, 4);
    const y2 = (l.appliedDate || '').slice(0, 4);
    if (y1 && /^\d{4}$/.test(y1)) allYearsSet.add(y1);
    if (y2 && /^\d{4}$/.test(y2)) allYearsSet.add(y2);
  });
  const leaveYears = Array.from(allYearsSet).sort().reverse();

  // Filter by year first
  const yearFilteredLeaves = selectedYear === 'all'
    ? leaves
    : leaves.filter((leave) => {
        const startYear = (leave.startDate || '').slice(0, 4);
        const appliedYear = (leave.appliedDate || '').slice(0, 4);
        return startYear === selectedYear || appliedYear === selectedYear;
      });

  const filteredLeaves = yearFilteredLeaves.filter((leave) => {
    const leaveStart = dateKey(leave.startDate);
    const leaveEnd = dateKey(leave.endDate);
    const appliedDate = dateKey(leave.appliedDate);
    const query = searchTerm.trim().toLowerCase();
    const matchesSearch = !query || [
      leave.type,
      leave.status,
      leave.duration,
      leave.description,
      leave.actionBy,
      leave.reasonForAction,
    ].some((value) => String(value || '').toLowerCase().includes(query));

    return (
      matchesSearch &&
      (!appliedFilters.type || leave.type === appliedFilters.type) &&
      (!appliedFilters.status || leave.status === appliedFilters.status) &&
      (!appliedFilters.duration || leave.duration === appliedFilters.duration) &&
      (!appliedFilters.leaveDateFrom || (leaveEnd && leaveEnd >= appliedFilters.leaveDateFrom)) &&
      (!appliedFilters.leaveDateTo || (leaveStart && leaveStart <= appliedFilters.leaveDateTo)) &&
      (!appliedFilters.appliedDateFrom || appliedDate >= appliedFilters.appliedDateFrom) &&
      (!appliedFilters.appliedDateTo || appliedDate <= appliedFilters.appliedDateTo)
    );
  });

  const resetFilters = () => {
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
  };

  const updateFilter = (key: keyof LeaveFilters, value: string) => {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="mb-6">
        <h2 className="text-3xl font-display font-bold text-slate-900 mb-2">Leave History</h2>
        <p className="text-slate-600">Track all your past and current leave applications</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              aria-label="Search leave history"
              placeholder="Search leave history..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="h-9 border-slate-200 bg-white pl-9"
            />
          </div>
          {/* Year Selection Dropdown */}
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-slate-500" />
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="h-9 text-xs bg-white border-slate-200 w-32 font-semibold">
                <SelectValue placeholder="Select Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Years</SelectItem>
                {leaveYears.map((y) => (
                  <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              onClick={resetFilters}
              className="text-slate-600 hover:text-slate-900"
            >
              <RotateCcw className="h-4 w-4" />
              Clear filters
            </Button>
          )}
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="border-slate-200 bg-white text-slate-700">
                <Filter className="h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center rounded-full px-1.5">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
          <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
            <SheetHeader className="border-b border-slate-200 px-6 py-5 text-left">
              <SheetTitle className="flex items-center gap-2 text-slate-900">
                <Filter className="h-5 w-5 text-primary" />
                Filter leave history
              </SheetTitle>
              <SheetDescription>Choose one or more options to narrow your leave records.</SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
              <div className="space-y-2">
                <Label htmlFor="history-type">Leave type</Label>
                <select
                  id="history-type"
                  value={draftFilters.type}
                  onChange={(event) => updateFilter('type', event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">All leave types</option>
                  {leaveTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="history-status">Status</Label>
                <select
                  id="history-status"
                  value={draftFilters.status}
                  onChange={(event) => updateFilter('status', event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">All statuses</option>
                  {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="history-duration">Duration</Label>
                <select
                  id="history-duration"
                  value={draftFilters.duration}
                  onChange={(event) => updateFilter('duration', event.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">All durations</option>
                  {durations.map((duration) => <option key={duration} value={duration}>{duration}</option>)}
                </select>
              </div>

              <fieldset className="space-y-3">
                <legend className="text-sm font-medium leading-none text-slate-900">Leave dates</legend>
                <p className="text-xs text-slate-500">Include leaves that overlap this date range.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="history-leave-from" className="text-xs text-slate-600">From</Label>
                    <Input
                      id="history-leave-from"
                      type="date"
                      value={draftFilters.leaveDateFrom}
                      max={draftFilters.leaveDateTo || undefined}
                      onChange={(event) => updateFilter('leaveDateFrom', event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="history-leave-to" className="text-xs text-slate-600">To</Label>
                    <Input
                      id="history-leave-to"
                      type="date"
                      value={draftFilters.leaveDateTo}
                      min={draftFilters.leaveDateFrom || undefined}
                      onChange={(event) => updateFilter('leaveDateTo', event.target.value)}
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-sm font-medium leading-none text-slate-900">Applied date</legend>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="history-applied-from" className="text-xs text-slate-600">From</Label>
                    <Input
                      id="history-applied-from"
                      type="date"
                      value={draftFilters.appliedDateFrom}
                      max={draftFilters.appliedDateTo || undefined}
                      onChange={(event) => updateFilter('appliedDateFrom', event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="history-applied-to" className="text-xs text-slate-600">To</Label>
                    <Input
                      id="history-applied-to"
                      type="date"
                      value={draftFilters.appliedDateTo}
                      min={draftFilters.appliedDateFrom || undefined}
                      onChange={(event) => updateFilter('appliedDateTo', event.target.value)}
                    />
                  </div>
                </div>
              </fieldset>
            </div>

            <SheetFooter className="border-t border-slate-200 px-6 py-4 sm:flex-row sm:justify-between sm:space-x-0">
              <Button type="button" variant="ghost" onClick={resetFilters} className="text-slate-600">
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setAppliedFilters(draftFilters);
                  setFiltersOpen(false);
                }}
              >
                Apply filters
              </Button>
            </SheetFooter>
          </SheetContent>
          </Sheet>
        </div>
      </div>

      <Card className="bg-white border-slate-200 shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow className="hover:bg-transparent border-slate-100">
                <TableHead className="text-slate-600 font-bold">Type</TableHead>
                <TableHead className="text-slate-600 font-bold">Dates</TableHead>
                <TableHead className="text-slate-600 font-bold">Duration</TableHead>
                <TableHead className="text-slate-600 font-bold">Reason</TableHead>
                <TableHead className="text-slate-600 font-bold">Applied On</TableHead>
                <TableHead className="text-slate-600 font-bold">Attachment</TableHead>
                <TableHead className="text-slate-600 font-bold">Status</TableHead>
                <TableHead className="text-slate-600 font-bold">Action By</TableHead>
                <TableHead className="text-slate-600 font-bold">Comments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeaves.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <CalendarDays className="w-10 h-10 text-slate-300 stroke-[1.5]" />
                      <p className="font-semibold text-slate-700 text-sm">
                        {selectedYear !== 'all' ? `No leaves found for ${selectedYear}` : 'No leave records found'}
                      </p>
                      <p className="text-xs text-slate-400 max-w-sm">
                        {selectedYear !== 'all'
                          ? `No leave records have been saved or seeded for the year ${selectedYear}.`
                          : 'Try adjusting your search criteria or filters.'}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredLeaves.map((leave) => (
                  <TableRow key={leave.id} className="hover:bg-slate-50 border-slate-100 transition-colors">
                    <TableCell className="font-semibold text-slate-900">{leave.type}</TableCell>
                    <TableCell className="text-slate-600 font-medium">
                      {format(new Date(leave.startDate), 'MMM dd')} - {format(new Date(leave.endDate), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell className="text-slate-600 font-medium">
                      {leave.duration}
                      {leave.duration === 'Hourly' && leave.type === 'OD' && (
                        <div className="text-xs text-slate-500 font-normal">{leave.odFromTime} - {leave.odToTime}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-600 max-w-[200px] truncate" title={leave.description}>
                      {leave.description}
                    </TableCell>
                    <TableCell className="text-slate-600 font-medium">{format(new Date(leave.appliedDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell className="text-slate-600">
                      {leave.attachment ? (
                        <a href={leave.attachment} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          View
                        </a>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusColor(leave.status)}>
                        {leave.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 font-medium">
                      {leave.actionBy ? (
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-700">{leave.actionBy}</span>
                          <span className="text-[10px]">{leave.actionDate ? format(new Date(leave.actionDate), 'MMM dd, yyyy') : ''}</span>
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600 max-w-[220px] truncate italic" title={leave.reasonForAction || ''}>
                      {leave.reasonForAction || '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
