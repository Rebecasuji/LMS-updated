import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getPendingCompOffRequests, adminActionCompOff, hrActionCompOff, CompOffRequest } from '@/lib/compoff';

function statusBadge(status: string) {
  const map: Record<string, string> = {
    Pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    Approved: 'bg-green-50 text-green-700 border-green-200',
    Rejected: 'bg-red-50 text-red-700 border-red-200',
  };
  return <Badge variant="outline" className={`font-medium text-xs ${map[status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>{status}</Badge>;
}

export default function ApproveCompOff() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<CompOffRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [bulkRejectReason, setBulkRejectReason] = useState('');
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [loading, setLoading] = useState(true);

  const isHR = user?.role === 'HR';
  const myRoleLabel = isHR ? 'HR' : 'Admin';

  const load = async () => {
    const pending = await getPendingCompOffRequests();
    setRequests(pending);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAction = async (req: CompOffRequest, status: 'Approved' | 'Rejected', asRole?: 'Admin' | 'HR', reason?: string) => {
    if (!user) return;
    const actionBy = `${user.code} (${user.name})`;
    const targetRole = asRole || (isHR ? 'HR' : 'Admin');
    try {
      if (targetRole === 'HR') {
        await hrActionCompOff(req.id, status, actionBy, reason);
      } else {
        await adminActionCompOff(req.id, status, actionBy, reason);
      }
      setSelectedRequestIds((selected) => selected.filter((id) => id !== req.id));
      toast({
        title: `Comp Off ${status} (${targetRole})`,
        description: status === 'Approved'
          ? 'Approval recorded. 1 day credited if both Admin and HR have approved.'
          : 'Request rejected.',
        className: status === 'Approved'
          ? 'bg-green-500/10 border-green-500/20 text-green-700 font-medium'
          : 'bg-red-500/10 border-red-500/20 text-red-700 font-medium',
      });
      setRejectReason('');
      load();
    } catch (err) {
      toast({ title: 'Action failed', description: (err as any)?.message || 'Could not record action.', variant: 'destructive' });
    }
  };

  const filtered = requests.filter(r =>
    r.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.employeeCode.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const approvableSelectedCount = filtered.filter((request) =>
    selectedRequestIds.includes(request.id) &&
    (isHR ? request.hrStatus : request.adminStatus) === 'Pending'
  ).length;

  const toggleRequestSelection = (id: string, checked: boolean) => {
    setSelectedRequestIds((selected) => checked
      ? selected.includes(id) ? selected : selected.concat(id)
      : selected.filter((selectedId) => selectedId !== id));
  };

  const toggleAllVisibleRequests = (checked: boolean) => {
    const visibleIds = filtered
      .filter((request) => request.finalStatus !== 'Rejected')
      .map((request) => request.id);
    setSelectedRequestIds((selected) => checked
      ? selected.concat(visibleIds.filter((id) => !selected.includes(id)))
      : selected.filter((id) => !visibleIds.includes(id)));
  };

  const handleBulkAction = async (status: 'Approved' | 'Rejected', reason?: string) => {
    if (!user || bulkProcessing) return;

    const selectedRequests = requests.filter((request) =>
      selectedRequestIds.includes(request.id) &&
      request.finalStatus !== 'Rejected' &&
      (status === 'Rejected' || (isHR ? request.hrStatus : request.adminStatus) === 'Pending')
    );
    if (selectedRequests.length === 0) {
      toast({
        title: 'No eligible requests selected',
        description: status === 'Approved'
          ? `Selected requests already have your ${myRoleLabel} approval recorded.`
          : 'Select pending Comp Off requests to continue.',
        variant: 'destructive',
      });
      return;
    }

    setBulkProcessing(true);
    const completedIds: string[] = [];
    let failedCount = 0;
    const actionBy = `${user.code} (${user.name})`;

    for (const request of selectedRequests) {
      try {
        if (isHR) {
          await hrActionCompOff(request.id, status, actionBy, reason);
        } else {
          await adminActionCompOff(request.id, status, actionBy, reason);
        }
        completedIds.push(request.id);
      } catch (error) {
        console.error(`Failed to ${status.toLowerCase()} Comp Off request ${request.id}:`, error);
        failedCount += 1;
      }
    }

    await load();
    setSelectedRequestIds((selected) => selected.filter((id) => !completedIds.includes(id)));
    setBulkProcessing(false);
    setBulkRejectOpen(false);
    setBulkRejectReason('');
    toast({
      title: failedCount === 0 ? `Comp Off ${status} (${myRoleLabel})` : 'Some Comp Off actions failed',
      description: `${completedIds.length} request(s) ${status.toLowerCase()} by ${myRoleLabel}${failedCount > 0 ? `; ${failedCount} failed and remain pending` : ''}.`,
      variant: failedCount > 0 ? 'destructive' : undefined,
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div>
          <h2 className="text-3xl font-display font-bold text-slate-900 mb-2">Approve Comp Off Requests</h2>
          <p className="text-slate-600">Both Admin and HR must approve before Comp Off days are credited.</p>
        </div>
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search by Name or Code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-white border-slate-200 text-slate-900"
          />
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
        <p className="font-bold">⚠️ Dual approval required: Comp Off is credited only after BOTH Admin and HR approve.</p>
      </div>

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
          <Checkbox
            checked={filtered.filter((request) => request.finalStatus !== 'Rejected').length > 0 &&
              filtered.filter((request) => request.finalStatus !== 'Rejected')
                .every((request) => selectedRequestIds.includes(request.id))}
            onCheckedChange={(checked) => toggleAllVisibleRequests(checked === true)}
            aria-label="Select all visible pending Comp Off requests"
            disabled={bulkProcessing}
          />
          <span className="text-sm text-slate-600">{selectedRequestIds.length} selected</span>
          <Button
            onClick={() => void handleBulkAction('Approved')}
            disabled={approvableSelectedCount === 0 || bulkProcessing}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Check className="w-4 h-4 mr-2" /> Approve Selected as {myRoleLabel}
          </Button>
          <Dialog open={bulkRejectOpen} onOpenChange={setBulkRejectOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                disabled={selectedRequestIds.length === 0 || bulkProcessing}
                className="border-red-200 text-red-600 hover:bg-red-50"
              >
                <X className="w-4 h-4 mr-2" /> Reject Selected
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-slate-200">
              <DialogHeader>
                <DialogTitle className="text-slate-900">Reject Selected Comp Off Requests</DialogTitle>
                <DialogDescription>Please provide a reason. It will be recorded for each selected request.</DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label className="text-slate-700 font-bold mb-2 block">Rejection Reason</Label>
                <Textarea
                  value={bulkRejectReason}
                  onChange={(event) => setBulkRejectReason(event.target.value)}
                  className="bg-white border-slate-200 text-slate-900 mt-2"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBulkRejectOpen(false)} disabled={bulkProcessing}>Cancel</Button>
                <Button
                  onClick={() => void handleBulkAction('Rejected', bulkRejectReason)}
                  disabled={!bulkRejectReason.trim() || bulkProcessing}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold"
                >
                  Reject Selected
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <p className="text-slate-500 text-sm">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-slate-100 italic">
            No pending Comp Off requests found.
          </div>
        ) : (
          filtered.map((r) => (
            <Card key={r.id} className="bg-white border-slate-200 hover:border-primary/50 transition-all duration-300 shadow-sm">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row justify-between gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Checkbox
                        checked={selectedRequestIds.includes(r.id)}
                        onCheckedChange={(checked) => toggleRequestSelection(r.id, checked === true)}
                        aria-label={`Select Comp Off request for ${r.employeeName}`}
                        disabled={bulkProcessing || r.finalStatus === 'Rejected'}
                      />
                      <h3 className="text-xl font-bold text-slate-900">{r.employeeName} ({r.employeeCode})</h3>
                      <Badge variant="secondary" className="bg-slate-50 border-slate-200 text-slate-700">{r.compOffDays} day(s)</Badge>
                    </div>
                    <div className="text-sm text-slate-500 font-medium">
                      <span className="text-slate-400">Earned:</span> {r.earnedStartDate} to {r.earnedEndDate} &nbsp;|&nbsp;
                      <span className="text-slate-400"> Applied:</span> {r.appliedDate}
                    </div>
                    <div className="flex items-center gap-4 text-xs pt-1">
                      <span>Admin: {statusBadge(r.adminStatus)}</span>
                      <span>HR: {statusBadge(r.hrStatus)}</span>
                      <span className="font-semibold text-slate-600">Final: {r.finalStatus}</span>
                    </div>
                    <div className="mt-3 p-3 bg-slate-50 rounded-md border border-slate-100">
                      <p className="text-sm text-slate-600 italic">"{r.reason}"</p>
                    </div>
                  </div>

                  <div className="flex flex-col items-stretch gap-2 min-w-[200px] justify-center">
                    {r.adminStatus === 'Pending' && (
                      <Button
                        size="sm"
                        onClick={() => handleAction(r, 'Approved', 'Admin')}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold w-full"
                      >
                        <Check className="w-4 h-4 mr-1.5" /> Approve as Admin
                      </Button>
                    )}
                    {r.hrStatus === 'Pending' && (
                      <Button
                        size="sm"
                        onClick={() => handleAction(r, 'Approved', 'HR')}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold w-full"
                      >
                        <Check className="w-4 h-4 mr-1.5" /> Approve as HR
                      </Button>
                    )}
                    {r.finalStatus !== 'Rejected' && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 font-bold w-full">
                            <X className="w-4 h-4 mr-1.5" /> Reject Request
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-white border-slate-200">
                          <DialogHeader>
                            <DialogTitle className="text-slate-900">Reject Comp Off Request</DialogTitle>
                            <DialogDescription>Please provide a reason. This will be visible to the employee.</DialogDescription>
                          </DialogHeader>
                          <div className="py-4">
                            <Label className="text-slate-700 font-bold mb-2 block">Rejection Reason</Label>
                            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="bg-white border-slate-200 text-slate-900 mt-2" />
                          </div>
                          <DialogFooter>
                            <Button variant="outline" className="border-slate-200">Cancel</Button>
                            <DialogClose asChild>
                              <Button onClick={() => handleAction(r, 'Rejected', isHR ? 'HR' : 'Admin', rejectReason)} disabled={!rejectReason} className="bg-red-600 hover:bg-red-700 text-white font-bold">Confirm Rejection</Button>
                            </DialogClose>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
