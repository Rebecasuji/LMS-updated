import { useState, useEffect } from 'react';
import { getStoredLeaves, getAllUsersAsync } from '@/lib/storage';
import { User } from '@/lib/data';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Search, Download, Calendar, Clock, FileText, User as UserIcon, Eye, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';

function calculateOtHours(fromTime?: string, toTime?: string): number {
  if (!fromTime || !toTime) return 0;
  try {
    const [h1, m1] = fromTime.split(':').map(Number);
    const [h2, m2] = toTime.split(':').map(Number);
    const startMins = h1 * 60 + (m1 || 0);
    const endMins = h2 * 60 + (m2 || 0);
    const diff = endMins - startMins;
    return diff > 0 ? Number((diff / 60).toFixed(1)) : 0;
  } catch {
    return 0;
  }
}

export default function ApprovedLeaves() {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [otSearchTerm, setOtSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedOtUser, setSelectedOtUser] = useState<{ user: User; otLeaves: any[]; totalHours: number } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [allLeaves, allUsers] = await Promise.all([
        getStoredLeaves(),
        getAllUsersAsync()
      ]);
      const approved = allLeaves.filter(l => l.status === 'Approved');
      setLeaves(approved);
      setUsers(allUsers || []);
      setLoading(false);
    };
    loadData();
  }, []);

  const exportToExcel = () => {
    try {
      const exportData = filteredLeaves.map(l => ({
        'Employee Name': l.employeeName,
        'Employee Code': l.employeeCode,
        'Leave Type': l.type,
        'Duration': l.duration,
        'Time / Hours': l.duration === 'Hourly' && (l.fromTime || l.odFromTime) ? `${l.fromTime || l.odFromTime} - ${l.toTime || l.odToTime}` : '-',
        'Start Date': l.startDate,
        'End Date': l.endDate,
        'Applied Date': l.appliedDate,
        'Approved By': l.actionBy || '-',
        'Reason': l.description
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Approved Leaves');
      XLSX.writeFile(wb, `Approved-Leaves-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

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

  const exportOtReport = (otList?: any[], employeeName?: string) => {
    try {
      const source = otList || approvedOtLeaves;
      const exportData = source.map(l => {
        const hrs = calculateOtHours(l.fromTime || l.odFromTime, l.toTime || l.odToTime);
        return {
          'Employee Name': l.employeeName,
          'Employee Code': l.employeeCode,
          'OT Date': l.startDate,
          'Time Slot': `${l.fromTime || l.odFromTime || ''} - ${l.toTime || l.odToTime || ''}`,
          'OT Hours Worked': hrs > 0 ? `${hrs} hrs` : '-',
          'Reason / Description': l.description,
          'Approved By': l.actionBy || '-',
          'Applied Date': l.appliedDate,
        };
      });

      const fileName = employeeName ? `OT-Report-${employeeName.replace(/\s+/g, '_')}.xlsx` : `All-Employees-OT-Report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'OT Records');
      XLSX.writeFile(wb, fileName);

      toast({
        title: "OT Report Exported",
        description: `Successfully exported OT records to ${fileName}`,
      });
    } catch (err) {
      toast({
        title: "Export Failed",
        description: "Could not export OT report.",
        variant: "destructive"
      });
    }
  };

  const filteredLeaves = leaves.filter(l => {
    const matchesSearch = searchTerm === '' ||
      l.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.type.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDate = !selectedDate || (l.startDate <= selectedDate && l.endDate >= selectedDate);
    return matchesSearch && matchesDate;
  });

  // Filter only approved OT leaves
  const approvedOtLeaves = leaves.filter(l => l.type === 'OT');

  // Compute OT stats per user
  const userOtMap: Record<string, { user: User; otLeaves: any[]; totalHours: number }> = {};
  users.forEach(u => {
    const codeKey = (u.code || u.id || '').toLowerCase();
    userOtMap[codeKey] = { user: u, otLeaves: [], totalHours: 0 };
  });

  approvedOtLeaves.forEach(ot => {
    const codeKey = (ot.employeeCode || ot.employeeId || '').toLowerCase();
    const hrs = calculateOtHours(ot.fromTime || ot.odFromTime, ot.toTime || ot.odToTime);

    if (userOtMap[codeKey]) {
      userOtMap[codeKey].otLeaves.push(ot);
      userOtMap[codeKey].totalHours += hrs;
    } else {
      // Fallback if employee is not in main users list
      const tempUser: User = {
        id: ot.employeeId || ot.employeeCode,
        code: ot.employeeCode || ot.employeeId,
        name: ot.employeeName || ot.employeeCode,
        role: 'Employee',
        designation: 'Staff'
      };
      userOtMap[codeKey] = { user: tempUser, otLeaves: [ot], totalHours: hrs };
    }
  });

  const otStaffList = Object.values(userOtMap).filter(item => {
    if (!otSearchTerm) return true;
    const term = otSearchTerm.toLowerCase();
    return (
      item.user.name.toLowerCase().includes(term) ||
      item.user.code.toLowerCase().includes(term) ||
      item.user.role.toLowerCase().includes(term)
    );
  });

  const getStatusColor = (type: string) => {
    switch (type) {
      case 'Casual': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'Sick': return 'bg-red-500/10 text-red-600 border-red-500/20';
      case 'OD': return 'bg-green-500/10 text-green-600 border-green-500/20';
      case 'OT': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'Comp Off': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      default: return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-slate-900 mb-2">Approved Leaves & OT Records</h2>
          <p className="text-slate-600">History of all finalized leave requests and overtime logs</p>
        </div>
      </div>

      <Tabs defaultValue="all-leaves" className="w-full space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-xl border border-slate-200 inline-flex">
          <TabsTrigger value="all-leaves" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-5 py-2.5 font-bold text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> All Approved Leaves
          </TabsTrigger>
          <TabsTrigger value="ot-records" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-5 py-2.5 font-bold text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" /> Overtime (OT) Directory
            {approvedOtLeaves.length > 0 && (
              <Badge className="bg-amber-500 text-white ml-1 text-xs">{approvedOtLeaves.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: ALL APPROVED LEAVES */}
        <TabsContent value="all-leaves" className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="flex flex-col md:flex-row gap-4 flex-1 w-full">
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
            </div>
            <Button
              onClick={exportToExcel}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-md shrink-0"
            >
              <Download className="w-4 h-4 mr-2" /> Export Excel
            </Button>
          </div>

          <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="font-bold">Employee</TableHead>
                      <TableHead className="font-bold">Type</TableHead>
                      <TableHead className="font-bold">Duration</TableHead>
                      <TableHead className="font-bold">Time / Hours</TableHead>
                      <TableHead className="font-bold">Period</TableHead>
                      <TableHead className="font-bold">Reason</TableHead>
                      <TableHead className="font-bold">Approved By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-slate-500 italic">
                          Loading leaves...
                        </TableCell>
                      </TableRow>
                    ) : filteredLeaves.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-slate-500 italic">
                          No approved leaves found matching your filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLeaves.map((leave) => (
                        <TableRow key={leave.id} className="hover:bg-slate-50 border-slate-100">
                          <TableCell>
                            <div className="font-medium text-slate-900">{leave.employeeName}</div>
                            <div className="text-xs text-primary font-mono font-bold">{leave.employeeCode}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={getStatusColor(leave.type)}>
                              {leave.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-600 font-medium">
                            {leave.duration}
                          </TableCell>
                          <TableCell className="text-slate-600 font-medium text-xs">
                            {leave.duration === 'Hourly' && (leave.fromTime || leave.odFromTime) ? (
                              <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md border border-slate-200 font-mono font-bold">
                                {leave.fromTime || leave.odFromTime} - {leave.toTime || leave.odToTime}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-slate-600 text-sm">
                            {format(new Date(leave.startDate), 'MMM dd')} - {format(new Date(leave.endDate), 'MMM dd, yyyy')}
                          </TableCell>
                          <TableCell className="text-slate-600 max-w-[200px] truncate" title={leave.description}>
                            {leave.description}
                          </TableCell>
                          <TableCell>
                            <div className="text-xs font-medium text-slate-700">{leave.actionBy || '-'}</div>
                            <div className="text-[10px] text-slate-400">{leave.appliedDate} (Applied)</div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: OVERTIME (OT) DIRECTORY */}
        <TabsContent value="ot-records" className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search staff by name, code or role..."
                value={otSearchTerm}
                onChange={(e) => setOtSearchTerm(e.target.value)}
                className="pl-10 bg-white border-slate-200"
              />
            </div>
            <Button
              onClick={() => exportOtReport()}
              className="bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-md shrink-0"
              disabled={approvedOtLeaves.length === 0}
            >
              <Download className="w-4 h-4 mr-2" /> Export All OT Records
            </Button>
          </div>

          <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100">
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600" /> Employee Overtime (OT) Summary
              </CardTitle>
              <CardDescription className="text-slate-500">
                Click on any employee to view their detailed timeline of approved OT logs and hours worked.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="font-bold">Staff Member</TableHead>
                      <TableHead className="font-bold">Role & Designation</TableHead>
                      <TableHead className="font-bold text-center">Approved OT Sessions</TableHead>
                      <TableHead className="font-bold text-center">Total OT Hours Worked</TableHead>
                      <TableHead className="font-bold text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-slate-500 italic">
                          Loading staff list...
                        </TableCell>
                      </TableRow>
                    ) : otStaffList.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-slate-500 italic">
                          No staff found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      otStaffList.map(({ user, otLeaves, totalHours }) => (
                        <TableRow key={user.id || user.code} className="hover:bg-slate-50/80 border-slate-100 transition-colors">
                          <TableCell className="font-medium text-slate-900">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm border border-amber-200">
                                {user.name ? user.name.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900">{user.name}</p>
                                <p className="text-xs text-slate-500 font-mono">{user.code}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-semibold text-slate-800">{user.role}</div>
                            <div className="text-xs text-slate-500">{user.designation || 'Staff'}</div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={otLeaves.length > 0 ? "bg-amber-50 text-amber-700 border-amber-200 font-bold px-3 py-1" : "bg-slate-50 text-slate-400 border-slate-200 font-normal px-3 py-1"}>
                              {otLeaves.length} Session{otLeaves.length !== 1 ? 's' : ''}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={totalHours > 0 ? "text-base font-extrabold text-amber-600 font-mono" : "text-sm text-slate-400 font-mono"}>
                              {totalHours.toFixed(1)} hrs
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant={otLeaves.length > 0 ? "default" : "outline"}
                              className={otLeaves.length > 0 ? "bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-1.5 ml-auto shadow-sm" : "border-slate-200 text-slate-400 font-medium flex items-center gap-1.5 ml-auto"}
                              disabled={otLeaves.length === 0}
                              onClick={() => setSelectedOtUser({ user, otLeaves, totalHours })}
                            >
                              <Eye className="w-3.5 h-3.5" /> View OT History
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* INDIVIDUAL EMPLOYEE OT HISTORY DIALOG / MODAL */}
      {selectedOtUser && (
        <Dialog open={!!selectedOtUser} onOpenChange={(open) => { if (!open) setSelectedOtUser(null); }}>
          <DialogContent className="max-w-3xl bg-white border-slate-200 text-slate-900 rounded-2xl p-6 shadow-2xl">
            <DialogHeader className="pb-4 border-b border-slate-100">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-lg shadow-md">
                    {selectedOtUser.user.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                      {selectedOtUser.user.name}
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 font-mono text-xs">
                        {selectedOtUser.user.code}
                      </Badge>
                    </DialogTitle>
                    <DialogDescription className="text-slate-500 text-xs mt-0.5">
                      Role: {selectedOtUser.user.role} ({selectedOtUser.user.designation || 'Staff'})
                    </DialogDescription>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-right">
                    <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider block">Total OT Hours</span>
                    <span className="text-xl font-extrabold text-amber-600 font-mono">{selectedOtUser.totalHours.toFixed(1)} hrs</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => exportOtReport(selectedOtUser.otLeaves, selectedOtUser.user.name)}
                    className="bg-primary text-white font-bold"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Export Excel
                  </Button>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <span>Detailed Overtime (OT) Log</span>
                <span>{selectedOtUser.otLeaves.length} Logged Entries</span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="font-bold text-xs">Date</TableHead>
                      <TableHead className="font-bold text-xs">Time Slot</TableHead>
                      <TableHead className="font-bold text-xs text-center">Duration</TableHead>
                      <TableHead className="font-bold text-xs">Reason / Purpose</TableHead>
                      <TableHead className="font-bold text-xs text-right">Approved By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOtUser.otLeaves.map((otRow) => {
                      const hrs = calculateOtHours(otRow.fromTime || otRow.odFromTime, otRow.toTime || otRow.odToTime);
                      return (
                        <TableRow key={otRow.id} className="hover:bg-slate-50 border-slate-100 text-sm">
                          <TableCell className="font-semibold text-slate-900">
                            {format(new Date(otRow.startDate), 'MMM dd, yyyy')}
                          </TableCell>
                          <TableCell>
                            <span className="bg-amber-50 text-amber-800 border border-amber-200/80 px-2.5 py-1 rounded-md text-xs font-mono font-bold">
                              {otRow.fromTime || otRow.odFromTime || '-'} to {otRow.toTime || otRow.odToTime || '-'}
                            </span>
                          </TableCell>
                          <TableCell className="text-center font-bold font-mono text-amber-600">
                            {hrs > 0 ? `${hrs.toFixed(1)} hrs` : 'Hourly'}
                          </TableCell>
                          <TableCell className="text-slate-600 text-xs max-w-[180px] truncate" title={otRow.description}>
                            "{otRow.description}"
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            <div className="font-bold text-slate-800 flex items-center justify-end gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                              {otRow.actionBy || 'Admin'}
                            </div>
                            <div className="text-[10px] text-slate-400">{otRow.appliedDate}</div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
