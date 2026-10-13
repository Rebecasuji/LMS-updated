import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useAuth } from '@/context/AuthContext';
import { getStoredPermissions, PermissionRequest } from '@/lib/storage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Filter, RotateCcw, Search } from 'lucide-react';

type PermissionFilters = {
  type: string;
  status: string;
  dateFrom: string;
  dateTo: string;
};

const emptyFilters: PermissionFilters = {
  type: '',
  status: '',
  dateFrom: '',
  dateTo: '',
};

const dateKey = (value?: string) => value?.slice(0, 10) || '';

export default function PermissionHistory() {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<PermissionFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<PermissionFilters>(emptyFilters);

  useEffect(() => {
    let mounted = true;
    const loadPermissions = async () => {
      if (!user) return;
      const allPermissions = await getStoredPermissions();
      if (!mounted) return;
      const ownPermissions = allPermissions
        .filter((permission) => (
          permission.employeeCode === user.code ||
          permission.employeeId === user.id ||
          permission.employeeCode === user.id ||
          permission.employeeId === user.code
        ))
        .sort((a, b) => dateKey(b.appliedDate).localeCompare(dateKey(a.appliedDate)));
      setPermissions(ownPermissions);
    };
    loadPermissions();
    return () => { mounted = false; };
  }, [user]);

  const permissionTypes: PermissionRequest['type'][] = [
    'Late Entry Permission',
    'Early Exit Permission',
    'Personal Work Permission',
    'Emergency Permission',
  ];
  const statuses: PermissionRequest['status'][] = ['Pending', 'Approved', 'Rejected'];
  const activeFilterCount = Object.values(appliedFilters).filter(Boolean).length;

  const filteredPermissions = permissions.filter((permission) => {
    const query = searchTerm.trim().toLowerCase();
    const matchesSearch = !query || [
      permission.type,
      permission.status,
      permission.reason,
      permission.additionalInfo,
      permission.actionBy,
      permission.reasonForAction,
    ].some((value) => String(value || '').toLowerCase().includes(query));
    const permissionDate = dateKey(permission.date);

    return (
      matchesSearch &&
      (!appliedFilters.type || permission.type === appliedFilters.type) &&
      (!appliedFilters.status || permission.status === appliedFilters.status) &&
      (!appliedFilters.dateFrom || (permissionDate && permissionDate >= appliedFilters.dateFrom)) &&
      (!appliedFilters.dateTo || (permissionDate && permissionDate <= appliedFilters.dateTo))
    );
  });

  const updateFilter = (key: keyof PermissionFilters, value: string) => {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  };

  const resetFilters = () => {
    setDraftFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
  };

  const statusColor = (status: PermissionRequest['status']) => {
    switch (status) {
      case 'Approved': return 'bg-green-500/10 text-green-600 border-green-500/20';
      case 'Rejected': return 'bg-red-500/10 text-red-600 border-red-500/20';
      default: return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="mb-6">
        <h2 className="mb-2 text-3xl font-display font-bold text-slate-900">Permission History</h2>
        <p className="text-slate-600">Track your submitted permission requests and their status</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            aria-label="Search permission history"
            placeholder="Search permission history..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="h-9 border-slate-200 bg-white pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <Button type="button" variant="ghost" onClick={resetFilters} className="text-slate-600 hover:text-slate-900">
              <RotateCcw className="h-4 w-4" />
              Clear filters
            </Button>
          )}
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" className="border-slate-200 bg-white text-slate-700">
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
                  Filter permission history
                </SheetTitle>
                <SheetDescription>Narrow your permission requests by type, status, or date.</SheetDescription>
              </SheetHeader>
              <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
                <div className="space-y-2">
                  <Label htmlFor="permission-history-type">Permission type</Label>
                  <select
                    id="permission-history-type"
                    value={draftFilters.type}
                    onChange={(event) => updateFilter('type', event.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">All permission types</option>
                    {permissionTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="permission-history-status">Status</Label>
                  <select
                    id="permission-history-status"
                    value={draftFilters.status}
                    onChange={(event) => updateFilter('status', event.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">All statuses</option>
                    {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium leading-none text-slate-900">Permission date</legend>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="permission-history-from" className="text-xs text-slate-600">From</Label>
                      <Input
                        id="permission-history-from"
                        type="date"
                        value={draftFilters.dateFrom}
                        max={draftFilters.dateTo || undefined}
                        onChange={(event) => updateFilter('dateFrom', event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="permission-history-to" className="text-xs text-slate-600">To</Label>
                      <Input
                        id="permission-history-to"
                        type="date"
                        value={draftFilters.dateTo}
                        min={draftFilters.dateFrom || undefined}
                        onChange={(event) => updateFilter('dateTo', event.target.value)}
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
                <Button type="button" onClick={() => {
                  setAppliedFilters(draftFilters);
                  setFiltersOpen(false);
                }}>
                  Apply filters
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-bold text-slate-600">Type</TableHead>
                <TableHead className="font-bold text-slate-600">Date</TableHead>
                <TableHead className="font-bold text-slate-600">Timing</TableHead>
                <TableHead className="font-bold text-slate-600">Reason</TableHead>
                <TableHead className="font-bold text-slate-600">Applied On</TableHead>
                <TableHead className="font-bold text-slate-600">Status</TableHead>
                <TableHead className="font-bold text-slate-600">Action By</TableHead>
                <TableHead className="font-bold text-slate-600">Comments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPermissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center italic text-slate-500">
                    No permission records found
                  </TableCell>
                </TableRow>
              ) : filteredPermissions.map((permission) => (
                <TableRow key={permission.id} className="border-slate-100 transition-colors hover:bg-slate-50">
                  <TableCell className="font-semibold text-slate-900">{permission.type}</TableCell>
                  <TableCell className="text-slate-600">
                    {permission.date ? format(new Date(permission.date), 'MMM dd, yyyy') : '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-slate-600">
                    {permission.startTime || '-'} - {permission.endTime || '-'}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-slate-600" title={permission.reason}>
                    {permission.reason || '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-slate-600">
                    {permission.appliedDate ? format(new Date(permission.appliedDate), 'MMM dd, yyyy') : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColor(permission.status)}>{permission.status}</Badge>
                  </TableCell>
                  <TableCell className="text-slate-600">{permission.actionBy || '-'}</TableCell>
                  <TableCell className="max-w-[220px] truncate italic text-slate-600" title={permission.reasonForAction || ''}>
                    {permission.reasonForAction || '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
