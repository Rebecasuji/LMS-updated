import { useState, useEffect } from 'react';
import { getStoredLeaves, getStoredPermissions, PermissionRequest } from '@/lib/storage';
import { LeaveRequest } from '@/lib/data';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Search, Download, Calendar, CalendarDays, ArrowLeft, XCircle, FileText, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLocation } from 'wouter';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';

export default function RejectedLeaves() {
  const [, setLocation] = useLocation();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [allLeaves, allPermissions] = await Promise.all([
          getStoredLeaves(),
          getStoredPermissions()
        ]);
        setLeaves(allLeaves.filter(l => l.status === 'Rejected'));
        setPermissions(allPermissions.filter(p => p.status === 'Rejected'));
      } catch (err) {
        console.error('Failed to load rejected records:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Filter leaves
  const filteredLeaves = leaves.filter(l => {
    const matchesSearch = !searchTerm ||
      (l.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.employeeCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.type || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDate = !selectedDate || (l.startDate <= selectedDate && l.endDate >= selectedDate);
    const matchesYear = selectedYear === 'all' || 
      (l.startDate || '').startsWith(selectedYear) || 
      (l.appliedDate || '').startsWith(selectedYear);

    return matchesSearch && matchesDate && matchesYear;
  });

  // Filter permissions
  const filteredPermissions = permissions.filter(p => {
    const matchesSearch = !searchTerm ||
      (p.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.employeeCode || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.type || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesDate = !selectedDate || p.date === selectedDate;
    const matchesYear = selectedYear === 'all' || 
      (p.date || '').startsWith(selectedYear) || 
      (p.appliedDate || '').startsWith(selectedYear);

    return matchesSearch && matchesDate && matchesYear;
  });

  const exportLeavesToExcel = () => {
    try {
      const data = filteredLeaves.map(l => ({
        'Employee Name': l.employeeName,
        'Employee Code': l.employeeCode,
        'Leave Type': l.type,
        'Duration': l.duration,
        'Start Date': l.startDate,
        'End Date': l.endDate,
        'Applied Date': l.appliedDate,
        'Applied Reason': l.description,
        'Rejected By': l.actionBy || '-',
        'Rejection Reason': l.reasonForAction || '-',
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Rejected Leaves');
      XLSX.writeFile(wb, `Rejected-Leaves-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast({ title: 'Success', description: 'Exported rejected leaves to Excel.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to export.', variant: 'destructive' });
    }
  };

  const exportPermissionsToExcel = () => {
    try {
      const data = filteredPermissions.map(p => ({
        'Employee Name': p.employeeName,
        'Employee Code': p.employeeCode,
        'Permission Type': p.type,
        'Date': p.date,
        'Time Slot': `${p.startTime || ''} - ${p.endTime || ''}`,
        'Applied Date': p.appliedDate,
        'Applied Reason': p.reason,
        'Rejected By': p.actionBy || '-',
        'Rejection Reason': (p as any).reasonForAction || (p as any).rejectionReason || '-',
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Rejected Permissions');
      XLSX.writeFile(wb, `Rejected-Permissions-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast({ title: 'Success', description: 'Exported rejected permissions to Excel.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to export.', variant: 'destructive' });
    }
  };

  const currentYear = new Date().getFullYear();
  const yearOptions = [String(currentYear), String(currentYear - 1), String(currentYear - 2)];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setLocation('/admin/dashboard')}
            aria-label="Back to dashboard"
            className="text-slate-600 hover:text-slate-900 border-slate-200"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-3xl font-display font-bold text-slate-900 mb-1 flex items-center gap-2">
              <XCircle className="w-8 h-8 text-red-500" />
              Rejected Requests
            </h2>
            <p className="text-slate-600">History of all rejected leave and short-permission requests</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="leaves" className="w-full space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <TabsList className="bg-slate-100 p-1 rounded-xl border border-slate-200 inline-flex">
            <TabsTrigger value="leaves" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-5 py-2.5 font-bold text-sm flex items-center gap-2">
              <FileText className="w-4 h-4 text-red-500" />
              Rejected Leaves
              <Badge className="bg-red-500 text-white ml-1 text-xs">{leaves.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="permissions" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-5 py-2.5 font-bold text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              Rejected Permissions
              <Badge className="bg-orange-500 text-white ml-1 text-xs">{permissions.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by name, code, type..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-white border-slate-200"
              />
            </div>
            <div className="relative w-40 hidden sm:block">
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-white border-slate-200"
              />
            </div>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-28 bg-white border-slate-200 text-xs font-semibold">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {yearOptions.map(y => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* TAB 1: REJECTED LEAVES */}
        <TabsContent value="leaves" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={exportLeavesToExcel}
              variant="outline"
              className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <Download className="w-4 h-4 mr-2" /> Export Leaves
            </Button>
          </div>

          <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow>
                      <TableHead className="text-slate-600 font-bold">Employee</TableHead>
                      <TableHead className="text-slate-600 font-bold">Leave Type</TableHead>
                      <TableHead className="text-slate-600 font-bold">Duration</TableHead>
                      <TableHead className="text-slate-600 font-bold">Leave Dates</TableHead>
                      <TableHead className="text-slate-600 font-bold">Applied On</TableHead>
                      <TableHead className="text-slate-600 font-bold">Applied Reason</TableHead>
                      <TableHead className="text-slate-600 font-bold">Rejected By</TableHead>
                      <TableHead className="text-slate-600 font-bold">Rejection Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeaves.map((leave) => (
                      <TableRow key={leave.id} className="hover:bg-slate-50/60">
                        <TableCell>
                          <div className="font-semibold text-slate-900">{leave.employeeName}</div>
                          <div className="text-xs text-slate-500 font-mono">{leave.employeeCode}</div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                            {leave.type}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-700 font-medium">{leave.duration}</TableCell>
                        <TableCell>
                          <div className="text-slate-900 font-medium">{leave.startDate}</div>
                          {leave.endDate && leave.endDate !== leave.startDate && (
                            <div className="text-xs text-slate-500">to {leave.endDate}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-500 text-xs">{leave.appliedDate}</TableCell>
                        <TableCell className="text-slate-600 max-w-xs truncate" title={leave.description}>
                          {leave.description || '-'}
                        </TableCell>
                        <TableCell className="text-slate-700 font-medium">
                          {leave.actionBy || '-'}
                        </TableCell>
                        <TableCell className="text-red-600 max-w-xs truncate font-medium" title={leave.reasonForAction}>
                          {leave.reasonForAction || 'No remarks provided'}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!loading && filteredLeaves.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12 text-slate-500 italic">
                          No rejected leave requests found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: REJECTED PERMISSIONS */}
        <TabsContent value="permissions" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={exportPermissionsToExcel}
              variant="outline"
              className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <Download className="w-4 h-4 mr-2" /> Export Permissions
            </Button>
          </div>

          <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow>
                      <TableHead className="text-slate-600 font-bold">Employee</TableHead>
                      <TableHead className="text-slate-600 font-bold">Permission Type</TableHead>
                      <TableHead className="text-slate-600 font-bold">Date</TableHead>
                      <TableHead className="text-slate-600 font-bold">Time Slot</TableHead>
                      <TableHead className="text-slate-600 font-bold">Applied On</TableHead>
                      <TableHead className="text-slate-600 font-bold">Applied Reason</TableHead>
                      <TableHead className="text-slate-600 font-bold">Rejected By</TableHead>
                      <TableHead className="text-slate-600 font-bold">Rejection Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPermissions.map((perm) => (
                      <TableRow key={perm.id} className="hover:bg-slate-50/60">
                        <TableCell>
                          <div className="font-semibold text-slate-900">{perm.employeeName}</div>
                          <div className="text-xs text-slate-500 font-mono">{perm.employeeCode}</div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200">
                            {perm.type}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-900 font-medium">{perm.date}</TableCell>
                        <TableCell className="text-slate-600 font-medium">
                          {perm.startTime && perm.endTime ? `${perm.startTime} - ${perm.endTime}` : '-'}
                        </TableCell>
                        <TableCell className="text-slate-500 text-xs">{perm.appliedDate}</TableCell>
                        <TableCell className="text-slate-600 max-w-xs truncate" title={perm.reason}>
                          {perm.reason || '-'}
                        </TableCell>
                        <TableCell className="text-slate-700 font-medium">
                          {perm.actionBy || '-'}
                        </TableCell>
                        <TableCell className="text-red-600 max-w-xs truncate font-medium" title={(perm as any).reasonForAction || (perm as any).rejectionReason}>
                          {(perm as any).reasonForAction || (perm as any).rejectionReason || 'No remarks provided'}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!loading && filteredPermissions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12 text-slate-500 italic">
                          No rejected permission requests found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
