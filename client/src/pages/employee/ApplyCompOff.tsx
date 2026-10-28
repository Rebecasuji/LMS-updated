import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, XCircle, Clock } from 'lucide-react';
import {
  applyCompOff,
  getMyCompOffRequests,
  getCompOffBalance,
  CompOffRequest,
  CompOffBalance,
} from '@/lib/compoff';

const schema = z.object({
  earnedStartDate: z.string().min(1, 'Start date is required'),
  earnedEndDate: z.string().min(1, 'End date is required'),
  reason: z.string().min(5, 'Reason / details are required'),
}).refine(d => new Date(d.earnedEndDate) >= new Date(d.earnedStartDate), {
  message: 'End date cannot be before start date',
  path: ['earnedEndDate'],
});

type FormData = z.infer<typeof schema>;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    Pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    Approved: 'bg-green-50 text-green-700 border-green-200',
    Rejected: 'bg-red-50 text-red-700 border-red-200',
    'Partially Approved / Pending Final Approval': 'bg-blue-50 text-blue-700 border-blue-200',
  };
  return <Badge variant="outline" className={`font-medium ${map[status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>{status}</Badge>;
}

function TimelineStep({ label, state }: { label: string; state: 'done' | 'rejected' | 'pending' }) {
  const icon = state === 'done' ? <CheckCircle2 className="w-5 h-5 text-green-600" />
    : state === 'rejected' ? <XCircle className="w-5 h-5 text-red-500" />
    : <Circle className="w-5 h-5 text-slate-300" />;
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      {icon}
      <span className={`text-xs font-medium ${state === 'done' ? 'text-green-700' : state === 'rejected' ? 'text-red-500' : 'text-slate-400'}`}>{label}</span>
    </div>
  );
}

export default function ApplyCompOff() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [balance, setBalance] = useState<CompOffBalance | null>(null);
  const [requests, setRequests] = useState<CompOffRequest[]>([]);
  const [requestDateFilter, setRequestDateFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { earnedStartDate: '', earnedEndDate: '', reason: '' },
  });
  const selectedEarnedDate = form.watch('earnedStartDate');
  const selectedDateAlreadyApplied = !!selectedEarnedDate && requests.some((request) =>
    request.earnedStartDate <= selectedEarnedDate &&
    request.earnedEndDate >= selectedEarnedDate
  );
  const filteredRequests = requests.filter((request) =>
    !requestDateFilter ||
    (request.earnedStartDate <= requestDateFilter && request.earnedEndDate >= requestDateFilter)
  );

  const load = async () => {
    if (!user) return;
    const [b, r] = await Promise.all([getCompOffBalance(user.id), getMyCompOffRequests(user.id)]);
    setBalance(b);
    setRequests(r);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const onSubmit = async (data: FormData) => {
    if (!user) return;
    const overlapsExistingRequest = requests.some((request) =>
      request.earnedStartDate <= data.earnedEndDate &&
      request.earnedEndDate >= data.earnedStartDate
    );
    if (overlapsExistingRequest) {
      form.setError('earnedStartDate', {
        type: 'manual',
        message: 'A Comp Off application already exists for this date.',
      });
      return;
    }

    try {
      await applyCompOff({
        employeeId: user.id,
        employeeCode: user.code,
        employeeName: user.name,
        earnedStartDate: data.earnedStartDate,
        earnedEndDate: data.earnedEndDate,
        reason: data.reason,
      });
      toast({
        title: '✅ Comp Off Application Submitted',
        description: 'Your request now needs both Admin and HR approval before it is credited.',
        className: 'bg-green-500/10 border-green-500/20 text-green-700 font-medium',
      });
      form.reset({ earnedStartDate: '', earnedEndDate: '', reason: '' });
      load();
    } catch (err) {
      const message = (err as any)?.message || 'Could not submit Comp Off request.';
      toast({ title: 'Submission failed', description: message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div>
        <h2 className="text-3xl font-display font-bold text-slate-900 mb-2">Apply Comp Off</h2>
        <p className="text-slate-600">Apply for earned Comp Off. Requires approval from both Admin and HR before credit.</p>
      </div>

      {/* Balance card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Approved Days</p>
            <p className="text-3xl font-bold text-primary">{balance?.approvedDays ?? '-'}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Used Days</p>
            <p className="text-3xl font-bold text-slate-700">{balance?.usedDays ?? '-'}</p>
          </CardContent>
        </Card>
        <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500">Remaining Days</p>
            <p className="text-3xl font-bold text-green-600">{balance?.remainingDays ?? '-'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Apply form */}
      <Card className="bg-white border-slate-200 shadow-2xl max-w-2xl">
        <CardHeader>
          <CardTitle className="text-slate-900">New Comp Off Application</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-slate-700 font-medium flex items-center justify-between">
                <span>Date Worked (Off-day / Sunday) *</span>
                <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">1 Day Comp Off</span>
              </Label>
              <Input
                type="date"
                {...form.register('earnedStartDate')}
                onChange={(e) => {
                  const val = e.target.value;
                  form.clearErrors('earnedStartDate');
                  form.setValue('earnedStartDate', val);
                  form.setValue('earnedEndDate', val);
                }}
                className="bg-white border-slate-200 text-slate-900 h-12"
              />
              {form.formState.errors.earnedStartDate && <p className="text-red-400 text-xs">{form.formState.errors.earnedStartDate.message}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-slate-700 font-medium">Reason / Details</Label>
              <Textarea {...form.register('reason')} placeholder="e.g. Worked on Sunday for site inspection..." className="bg-white border-slate-200 text-slate-900 min-h-[90px]" />
              {form.formState.errors.reason && <p className="text-red-400 text-xs">{form.formState.errors.reason.message}</p>}
            </div>
            {selectedDateAlreadyApplied && (
              <p className="text-red-600 text-sm" role="alert">
                A Comp Off application already exists for this date. Please select another date.
              </p>
            )}
            <Button
              type="submit"
              disabled={selectedDateAlreadyApplied}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Apply Comp Off
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* My requests */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-slate-900">My Comp Off Requests</CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="comp-off-request-date-filter" className="text-sm text-slate-600 whitespace-nowrap">Worked date</Label>
            <Input
              id="comp-off-request-date-filter"
              type="date"
              value={requestDateFilter}
              onChange={(event) => setRequestDateFilter(event.target.value)}
              className="w-auto bg-white border-slate-200 text-slate-900"
              aria-label="Filter Comp Off requests by worked date"
            />
            {requestDateFilter && (
              <Button type="button" variant="outline" size="sm" onClick={() => setRequestDateFilter('')}>
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-slate-500 text-sm">Loading...</p>
          ) : requests.length === 0 ? (
            <p className="text-slate-500 text-sm italic">No Comp Off requests yet.</p>
          ) : filteredRequests.length === 0 ? (
            <p className="text-slate-500 text-sm italic">No Comp Off requests found for this worked date.</p>
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {filteredRequests.map((r) => (
                <AccordionItem key={r.id} value={r.id} className="rounded-lg border border-slate-200 px-4">
                  <AccordionTrigger className="gap-3 py-3 text-left hover:no-underline">
                    <span className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1">
                      <span className="font-semibold text-slate-900">
                        {r.earnedStartDate} to {r.earnedEndDate} &middot; {r.compOffDays} day(s)
                        <span className="ml-3 text-xs font-normal text-slate-500">Applied {r.appliedDate}</span>
                      </span>
                      {statusBadge(r.finalStatus)}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <p className="text-sm text-slate-600 italic">"{r.reason}"</p>

                    <div className="flex items-center gap-1 pt-2">
                      <TimelineStep label="Employee" state="done" />
                      <div className="h-px flex-1 bg-slate-200 mb-4" />
                      <TimelineStep label="Admin" state={r.adminStatus === 'Approved' ? 'done' : r.adminStatus === 'Rejected' ? 'rejected' : 'pending'} />
                      <div className="h-px flex-1 bg-slate-200 mb-4" />
                      <TimelineStep label="HR" state={r.hrStatus === 'Approved' ? 'done' : r.hrStatus === 'Rejected' ? 'rejected' : 'pending'} />
                      <div className="h-px flex-1 bg-slate-200 mb-4" />
                      <TimelineStep label="Credited" state={r.credited ? 'done' : 'pending'} />
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-slate-500 md:grid-cols-4">
                      <div>Credited: <span className="font-semibold text-slate-700">{r.creditedDays}</span></div>
                      <div>Used: <span className="font-semibold text-slate-700">{r.usedDays}</span></div>
                      <div>Remaining: <span className="font-semibold text-slate-700">{Math.max(0, r.creditedDays - r.usedDays)}</span></div>
                      <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {r.finalStatus}</div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
