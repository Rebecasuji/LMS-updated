import { getStoredLeaves, getStoredUsers, getStoredPermissions, PermissionRequest } from '@/lib/storage';
import { LeaveRequest, User } from '@/lib/data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Clock, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { StatCards } from '@/components/StatCards';

import { useEffect, useState } from 'react';

export default function AdminDashboard() {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const [l, p] = await Promise.all([getStoredLeaves(), getStoredPermissions()]);
        const u = getStoredUsers();
        if (!mounted) return;
        setLeaves(l);
        setPermissions(p);
        setUsers(u);
      } catch (err) {
        console.error('Error loading dashboard data', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const pendingCount = leaves.filter(l => l.status === 'Pending').length + permissions.filter(p => p.status === 'Pending').length;
  const approvedCount = leaves.filter(l => l.status === 'Approved').length + permissions.filter(p => p.status === 'Approved').length;
  const rejectedCount = leaves.filter(l => l.status === 'Rejected').length + permissions.filter(p => p.status === 'Rejected').length;
  const employeesCount = users.filter(u => u.role === 'Employee').length;
  const departmentsCount = new Set(users.map(u => (u as any).department).filter(Boolean)).size;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Admin Dashboard</h2>
          <p className="text-slate-600">Overview of organization performance</p>
        </div>
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search Employee, Code, or Dept..."
            className="pl-10 bg-white border-slate-200 text-slate-900 focus:border-primary/50"
          />
        </div>
      </div>

      <StatCards stats={[
        { label: 'Total Employees', value: employeesCount, type: 'info' },
        { label: 'Departments', value: departmentsCount, type: 'info' },
        { label: 'Pending Requests', value: pendingCount, type: 'pending' },
        { label: 'Approved', value: approvedCount, type: 'approved' },
        { label: 'Rejected', value: rejectedCount, type: 'rejected' },
      ]} />

      {/* Quick Actions or Recent Pending */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-900">Recent Pending Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingCount === 0 ? (
              <div className="text-slate-500 py-4">No pending requests</div>
            ) : (
              <div className="space-y-4">
                {[
                  ...leaves.filter(l => l.status === 'Pending').map(l => ({ ...l, kind: 'leave' })),
                  ...permissions.filter(p => p.status === 'Pending').map(p => ({ ...p, kind: 'permission' }))
                ]
                  .sort((a, b) => new Date(b.appliedDate).getTime() - new Date(a.appliedDate).getTime())
                  .slice(0, 5)
                  .map(request => (
                    <div key={`${(request as any).kind}-${request.id}`} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors border border-slate-100/50">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${(request as any).kind === 'leave' ? 'bg-blue-500/10 text-[#3B82F6]' : 'bg-amber-500/10 text-[#F59E0B]'}`}>
                          {(request as any).kind === 'leave' ? <FileText className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="text-slate-900 font-semibold">{request.employeeName}</p>
                          <p className="text-xs text-slate-500 font-medium">
                            {(request as any).kind === 'leave' ? `${request.type} Leave` : request.type}
                            {(request as any).duration ? ` • ${(request as any).duration}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-xs text-right text-slate-500 font-medium">
                        {(request as any).startDate || (request as any).startTime}
                        <p className="text-[10px] opacity-70 text-slate-400">{request.appliedDate}</p>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
