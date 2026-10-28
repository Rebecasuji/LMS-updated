import { getStoredLeaves, getAllUsersAsync, getStoredPermissions, PermissionRequest } from '@/lib/storage';
import { LeaveRequest, User } from '@/lib/data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Clock, FileText, MessageSquare, CheckCircle, RefreshCw, Send, Power } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { StatCards } from '@/components/StatCards';
import { LeaveCalendar } from '@/components/LeaveCalendar';
import { useToast } from '@/hooks/use-toast';

import { useEffect, useState } from 'react';

export default function AdminDashboard() {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [cliqStatus, setCliqStatus] = useState<{ configured: boolean; hasRefreshToken: boolean; hasWebhook: boolean; channel?: string } | null>(null);
  const [testingCliq, setTestingCliq] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);
  const { toast } = useToast();

  const fetchCliqStatus = async () => {
    try {
      const res = await fetch('/api/cliq/status');
      if (res.ok) {
        const data = await res.json();
        setCliqStatus(data);
      }
    } catch (e) {
      console.warn('Could not fetch cliq status:', e);
    }
  };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const [l, p, u] = await Promise.all([getStoredLeaves(), getStoredPermissions(), getAllUsersAsync()]);
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
    fetchCliqStatus();
    return () => { mounted = false; };
  }, []);

  const handleTestCliq = async () => {
    setTestingCliq(true);
    try {
      const res = await fetch('/api/cliq/test-leave-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeName: 'Admin Test',
          leaveType: 'Casual Leave',
          reason: 'Testing Zoho Cliq integration from LMS Admin Dashboard',
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: '✅ Cliq Message Sent',
          description: `Test alert posted to channel #${cliqStatus?.channel || 'teaminformation'}.`,
        });
      } else {
        toast({
          title: '⚠️ Could Not Send Message',
          description: data.message || 'Please verify Cliq authorization.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to dispatch test notification.',
        variant: 'destructive',
      });
    } finally {
      setTestingCliq(false);
    }
  };

  const handleSendDailyReport = async () => {
    if (!window.confirm('Send today\'s attendance report to the connected Cliq channel?')) return;

    setSendingReport(true);
    try {
      const res = await fetch('/api/cliq/send-daily-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: 'Daily Report Sent',
          description: data.message || 'The attendance report was sent to Cliq.',
        });
      } else {
        toast({
          title: 'Could Not Send Daily Report',
          description: data.message || 'Please verify Cliq authorization.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to send the daily attendance report.',
        variant: 'destructive',
      });
    } finally {
      setSendingReport(false);
    }
  };

  const handleDisconnectCliq = async () => {
    try {
      const res = await fetch('/api/cliq/disconnect', { method: 'POST' });
      const data = await res.json().catch(() => ({ success: false }));
      if (res.ok && data.success) {
        toast({ title: 'Disconnected', description: 'Zoho Cliq has been disconnected.' });
        setCliqStatus({ configured: true, hasRefreshToken: false, hasWebhook: false, channel: cliqStatus?.channel });
      } else {
        toast({ title: 'Notice', description: 'Please restart your server or verify disconnect status.', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to disconnect.', variant: 'destructive' });
    }
  };

  const pendingCount = leaves.filter(l => l.status === 'Pending').length + permissions.filter(p => p.status === 'Pending').length;
  const approvedCount = leaves.filter(l => l.status === 'Approved').length + permissions.filter(p => p.status === 'Approved').length;
  const rejectedCount = leaves.filter(l => l.status === 'Rejected').length + permissions.filter(p => p.status === 'Rejected').length;
  const employeesCount = users.filter(u => u.role === 'Employee').length;
  const departmentsCount = new Set(users.map(u => (u as any).department).filter(Boolean)).size;

  const isConnected = Boolean(cliqStatus && (cliqStatus.hasRefreshToken || cliqStatus.hasWebhook));

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Admin Dashboard</h2>
          <p className="text-slate-600">Overview of organization performance</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isConnected ? (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-lg text-xs font-medium shadow-sm">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Cliq: <strong>#{cliqStatus?.channel || 'teaminformation'}</strong></span>
              <button
                onClick={handleTestCliq}
                disabled={testingCliq}
                className="ml-2 inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium text-xs transition-colors"
                title="Send a sample leave test notification to the channel"
              >
                <Send className="w-3 h-3" />
                {testingCliq ? 'Sending...' : 'Test Alert'}
              </button>
              <button
                onClick={handleSendDailyReport}
                disabled={sendingReport}
                className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded font-medium text-xs transition-colors"
                title="Send today's attendance report to the connected Cliq channel"
              >
                <FileText className="w-3 h-3" />
                {sendingReport ? 'Sending...' : 'Send Daily Report'}
              </button>
              <button
                onClick={handleDisconnectCliq}
                className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                title="Disconnect Zoho Cliq"
              >
                <Power className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <a
              href="/api/cliq/auth"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition-colors shadow-sm"
              title="Connect Zoho Cliq for automated leave notifications & attendance reports"
            >
              <MessageSquare className="w-4 h-4" />
              Connect Zoho Cliq
            </a>
          )}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search Employee, Code..."
              className="pl-10 bg-white border-slate-200 text-slate-900 focus:border-primary/50 text-sm"
            />
          </div>
        </div>
      </div>

      <StatCards stats={[
        { label: 'Total Employees', value: employeesCount, type: 'info', path: '/admin/employees' },
        { label: 'Departments', value: departmentsCount, type: 'info', path: '/admin/departments' },
        { label: 'Pending Requests', value: pendingCount, type: 'pending', path: '/admin/view-leaves' },
        { label: 'Approved', value: approvedCount, type: 'approved', path: '/admin/approved-leaves' },
        { label: 'Rejected', value: rejectedCount, type: 'rejected', path: '/admin/rejected-leaves' },
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

      {/* Hanging calendar: who is on leave / OD / permission this month */}
      <LeaveCalendar leaves={leaves} permissions={permissions} />
    </div>
  );
}