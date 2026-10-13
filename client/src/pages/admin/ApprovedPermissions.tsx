import { useState, useEffect } from 'react';
import { getStoredPermissions, PermissionRequest } from '@/lib/storage';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Search, Download, Calendar, Clock, Filter, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';

type ApprovedPermissionFilters = {
    type: string;
    dateFrom: string;
    dateTo: string;
};

const emptyFilters: ApprovedPermissionFilters = {
    type: '',
    dateFrom: '',
    dateTo: '',
};

const dateKey = (value?: string) => value?.slice(0, 10) || '';

export default function ApprovedPermissions() {
    const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedDate, setSelectedDate] = useState('');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [draftFilters, setDraftFilters] = useState<ApprovedPermissionFilters>(emptyFilters);
    const [appliedFilters, setAppliedFilters] = useState<ApprovedPermissionFilters>(emptyFilters);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        const loadPermissions = async () => {
            const allPermissions = await getStoredPermissions();
            const approved = allPermissions.filter(p => p.status === 'Approved');
            setPermissions(approved);
            setLoading(false);
        };
        loadPermissions();
    }, []);

    const exportToExcel = () => {
        try {
            const exportData = filteredPermissions.map(p => ({
                'Employee Name': p.employeeName,
                'Employee Code': p.employeeCode,
                'Permission Type': p.type,
                'Date': p.date,
                'Start Time': p.startTime,
                'End Time': p.endTime,
                'Approved By': p.actionBy || '-',
                'Reason': p.reason
            }));

            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Approved Permissions');
            XLSX.writeFile(wb, `Approved-Permissions-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

            toast({
                title: "Success",
                description: "Export completed successfully!",
            });
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to export data",
                variant: "destructive"
            });
        }
    };

    const filteredPermissions = permissions.filter(p => {
        const matchesSearch = searchTerm === '' ||
            String(p.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(p.employeeCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(p.type || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesDate = !selectedDate || p.date === selectedDate;
        const permissionDate = dateKey(p.date);
        return matchesSearch &&
            matchesDate &&
            (!appliedFilters.type || p.type === appliedFilters.type) &&
            (!appliedFilters.dateFrom || (permissionDate && permissionDate >= appliedFilters.dateFrom)) &&
            (!appliedFilters.dateTo || (permissionDate && permissionDate <= appliedFilters.dateTo));
    });

    const activeFilterCount = Object.values(appliedFilters).filter(Boolean).length;
    const permissionTypes = Array.from(new Set(permissions.map((permission) => permission.type).filter(Boolean))).sort();
    const resetFilters = () => {
        setDraftFilters(emptyFilters);
        setAppliedFilters(emptyFilters);
    };
    const updateFilter = (key: keyof ApprovedPermissionFilters, value: string) => {
        setDraftFilters((current) => ({ ...current, [key]: value }));
    };

    const getPermissionTypeColor = (type: string) => {
        switch (type) {
            case 'Late Entry Permission': return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
            case 'Early Exit Permission': return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
            case 'Personal Work Permission': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
            case 'Emergency Permission': return 'bg-red-500/10 text-red-600 border-red-500/20';
            default: return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-display font-bold text-slate-900 mb-2">Approved Permissions</h2>
                    <p className="text-slate-600">History of all finalized short-leave permissions</p>
                </div>
                <Button
                    onClick={exportToExcel}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg"
                >
                    <Download className="w-4 h-4 mr-2" /> Export Excel
                </Button>
            </div>

            <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                        placeholder="Search by Employee, Code, or Type..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 bg-white border-slate-200"
                    />
                </div>
                <div className="relative w-full md:w-64">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="pl-10 bg-white border-slate-200"
                    />
                </div>
                <div className="flex items-center justify-end gap-2">
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
                                    Filter approved permissions
                                </SheetTitle>
                                <SheetDescription>Narrow approved permissions by type or permission date.</SheetDescription>
                            </SheetHeader>
                            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
                                <div className="space-y-2">
                                    <Label>Permission type</Label>
                                    <Select
                                        value={draftFilters.type || 'all'}
                                        onValueChange={(value) => updateFilter('type', value === 'all' ? '' : value)}
                                    >
                                        <SelectTrigger id="approved-permission-type" className="bg-white">
                                            <SelectValue placeholder="All permission types" />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-64 overflow-y-auto">
                                            <SelectItem value="all">All permission types</SelectItem>
                                            {permissionTypes.map((type) => (
                                                <SelectItem key={type} value={type}>{type}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <fieldset className="space-y-3">
                                    <legend className="text-sm font-medium leading-none text-slate-900">Permission date</legend>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                            <Label htmlFor="approved-permission-from" className="text-xs text-slate-600">From</Label>
                                            <Input
                                                id="approved-permission-from"
                                                type="date"
                                                value={draftFilters.dateFrom}
                                                max={draftFilters.dateTo || undefined}
                                                onChange={(event) => updateFilter('dateFrom', event.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="approved-permission-to" className="text-xs text-slate-600">To</Label>
                                            <Input
                                                id="approved-permission-to"
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

            <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead className="font-bold">Employee</TableHead>
                                    <TableHead className="font-bold">Type</TableHead>
                                    <TableHead className="font-bold">Timing</TableHead>
                                    <TableHead className="font-bold">Date</TableHead>
                                    <TableHead className="font-bold">Reason</TableHead>
                                    <TableHead className="font-bold">Approved By</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-slate-500 italic">
                                            Loading permissions...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredPermissions.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-slate-500 italic">
                                            No approved permissions found matching your filters.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredPermissions.map((item) => (
                                        <TableRow key={item.id} className="hover:bg-slate-50 border-slate-100">
                                            <TableCell>
                                                <div className="font-medium text-slate-900">{item.employeeName}</div>
                                                <div className="text-xs text-primary font-mono font-bold">{item.employeeCode}</div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={getPermissionTypeColor(item.type)}>
                                                    {item.type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1 text-slate-600 text-sm font-medium">
                                                    <Clock className="w-3 h-3" />
                                                    {item.startTime} - {item.endTime}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-slate-600 text-sm font-medium">
                                                {item.date}
                                            </TableCell>
                                            <TableCell className="text-slate-600 max-w-[200px] truncate" title={item.reason}>
                                                {item.reason}
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-xs font-medium text-slate-700">{item.actionBy || '-'}</div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
