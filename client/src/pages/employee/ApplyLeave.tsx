import { useForm } from 'react-hook-form';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { addLeaveRequest, getLeaveBalance, LeaveBalance } from '@/lib/storage';
import { useLocation } from 'wouter';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle } from 'lucide-react';
import { validateCompOffCoverage, consumeCompOffForLeave, getCompOffBalance, CompOffCoverage } from '@/lib/compoff';
import { notifyUser, notifyAdminAndHR } from '@/lib/notifications';
import { supabase } from '@/lib/supabaseClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const leaveSchema = z.object({
  type: z.enum(['Casual', 'Sick', 'LWP', 'Earned', 'OD', 'Comp Off']),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  duration: z.enum(['Full Day', 'Half Day', 'Hourly']).optional(),
  fromTime: z.string().optional(),
  toTime: z.string().optional(),
  description: z.string().min(5, "Reason is required"),
}).refine((data) => {
  // If Hourly is selected, fromTime and toTime are required
  if (data.duration === 'Hourly') {
    return data.fromTime && data.toTime;
  }
  return true;
}, {
  message: "From Time and To Time are required for Hourly OD",
  path: ["duration"],
});

const permissionSchema = z.object({
  permissionType: z.enum(['Official', 'Personal']).optional(),
  date: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  reason: z.string().min(5, "Reason is required"),
});

type LeaveForm = z.infer<typeof leaveSchema>;
type PermissionForm = z.infer<typeof permissionSchema>;

export default function ApplyLeave() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [attachment, setAttachment] = useState<{
    name: string;
    size: number;
    type: string;
    dataUrl: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [compOffCoverage, setCompOffCoverage] = useState<CompOffCoverage | null>(null);
  const [compOffBalanceDays, setCompOffBalanceDays] = useState<number | null>(null);
  const [lopConfirmOpen, setLopConfirmOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<{ data: LeaveForm; coverage: CompOffCoverage } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      getLeaveBalance(user.code).then(setBalance);
      getCompOffBalance(user.id).then(b => setCompOffBalanceDays(b.remainingDays));
    }
  }, [user]);

  const form = useForm<LeaveForm>({
    resolver: zodResolver(leaveSchema),
    defaultValues: {
      type: 'Casual',
      duration: 'Full Day',
      fromTime: '',
      toTime: '',
    }
  });

  // Watch for changes to enable reactive rendering
  const watchedLeaveType = form.watch('type');
  const watchedDuration = form.watch('duration');
  const watchedStartDate = form.watch('startDate');
  const watchedEndDate = form.watch('endDate');

  // Live Comp Off coverage preview: whenever type is "Comp Off" and both dates
  // are set, show exactly which dates are covered by approved Comp Off balance
  // and which will fall through to LOP.
  useEffect(() => {
    if (!user || watchedLeaveType !== 'Comp Off' || !watchedStartDate || !watchedEndDate) {
      setCompOffCoverage(null);
      return;
    }
    let cancelled = false;
    validateCompOffCoverage(user.id, watchedStartDate, watchedEndDate).then(cov => {
      if (!cancelled) setCompOffCoverage(cov);
    });
    return () => { cancelled = true; };
  }, [user, watchedLeaveType, watchedStartDate, watchedEndDate]);

  const permissionForm = useForm<PermissionForm>({
    resolver: zodResolver(permissionSchema),
    defaultValues: {
      permissionType: 'Official',
    }
  });

  const [requestKind, setRequestKind] = useState<'Leave' | 'Permission'>('Leave');

  const onSubmit = async (data: LeaveForm) => {
    console.log('ApplyLeave onSubmit called', data);
    if (!user) return;

    const user_id = user.id;
    if (!user_id) {
      toast({ title: 'Error', description: 'User not properly logged in. Please log in again.', variant: 'destructive' });
      return;
    }

    // Optional: Check balance before submitting (soft check)
    if (data.type === 'Casual' && balance && balance.casual.remaining <= 0) {
      toast({
        title: "Warning",
        description: "You have exhausted your Casual Leave quota. This may be processed as LWP.",
        variant: "destructive"
      });
    }

    // Comp Off: if any requested day exceeds the approved balance, stop and
    // ask for an explicit confirmation via dialog before submitting — never
    // silently drop the submission on the person.
    if (data.type === 'Comp Off') {
      const coverage = await validateCompOffCoverage(user_id, data.startDate, data.endDate);
      if (coverage.lopDays > 0) {
        setPendingSubmit({ data, coverage });
        setLopConfirmOpen(true);
        return;
      }
      await doSubmitLeave(data, coverage);
      return;
    }

    await doSubmitLeave(data, null);
  };

  const doSubmitLeave = async (data: LeaveForm, coverage: CompOffCoverage | null) => {
    if (!user) return;
    const user_id = user.id;
    if (!user_id) return;

    setSubmitting(true);
    const leaveData = {
      id: Math.random().toString(36).substr(2, 9),
      employeeId: user_id,
      employeeName: user.name,
      employeeCode: user.code,
      ...data,
      status: 'Pending' as const,
      attachment: attachment?.dataUrl,
      appliedDate: new Date().toISOString().split('T')[0],
      ...(data.duration === 'Hourly' && data.type === 'OD' ? {
        odFromTime: data.fromTime,
        odToTime: data.toTime,
      } : {})
    } as any;

    let insertedLeaveId: number | undefined;
    try {
      const inserted = await addLeaveRequest(leaveData);
      insertedLeaveId = Array.isArray(inserted) && inserted[0] ? inserted[0].id : undefined;
    } catch (err) {
      console.error('Failed to submit leave:', err);
      const message = (err as any)?.message || JSON.stringify(err) || 'Could not submit leave request.';
      toast({ title: 'Submission failed', description: message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    // Comp Off: consume the FIFO balance for covered dates, tag the leave row
    // with exactly which days were covered vs. LOP, and notify everyone.
    if (data.type === 'Comp Off' && coverage) {
      try {
        await consumeCompOffForLeave(user_id, insertedLeaveId, coverage.coveredDates);
        if (insertedLeaveId) {
          await supabase.from('leaves').update({
            comp_off_covered_days: coverage.coveredDates.length,
            lop_days: coverage.lopDays,
            comp_off_uncovered_dates: coverage.uncoveredDates.join(','),
          }).eq('id', insertedLeaveId);
        }

        if (coverage.lopDays > 0) {
          const uncoveredStr = coverage.uncoveredDates.join(', ');
          await notifyUser(
            user_id,
            'Comp Off Leave Partially Covered',
            `You have ${coverage.approvedAvailable} approved Comp Off day(s). ${coverage.coveredDates.join(', ') || 'None'} will be covered by Comp Off. ${uncoveredStr} will NOT be covered and will be treated as LOP.`,
            'comp_off_leave_lop_warning',
            'leave',
            insertedLeaveId
          );
          await notifyAdminAndHR(
            'Comp Off Leave — LOP Indication',
            `${user.name} (${user.code}) applied Comp Off leave ${data.startDate} to ${data.endDate}. Only ${coverage.approvedAvailable} day(s) approved Comp Off available — dates ${uncoveredStr} will be treated as LOP.`,
            'comp_off_leave_lop_warning',
            'leave',
            insertedLeaveId
          );
        } else {
          await notifyUser(
            user_id,
            'Comp Off Leave Applied',
            `Your Comp Off leave for ${data.startDate} to ${data.endDate} is fully covered by your approved Comp Off balance.`,
            'comp_off_leave_applied',
            'leave',
            insertedLeaveId
          );
          await notifyAdminAndHR(
            'Comp Off Leave Applied',
            `${user.name} (${user.code}) applied Comp Off leave ${data.startDate} to ${data.endDate}, fully covered by approved Comp Off balance.`,
            'comp_off_leave_applied',
            'leave',
            insertedLeaveId
          );
        }
      } catch (e) {
        console.error('Comp Off consumption/notification failed:', e);
      }
    }

    // Send email notification to HR and Admin (using fixed fallback emails)
    fetch('/api/send-leave-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeName: user.name,
        leaveType: data.type,
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.description,
        duration: data.duration,
        ...(data.duration === 'Hourly' ? { fromTime: data.fromTime, toTime: data.toTime } : {}),
        hrEmails: ['naveen@ctint.in'],
        adminEmails: ['naveen@ctint.in']
      })
    }).catch(() => { });

    toast({
      title: "✅ Leave Application Submitted",
      description: "Your manager will review it shortly. Notification sent to HR and Admin.",
      className: "bg-green-500/10 border-green-500/20 text-green-700 font-medium"
    });

    setSubmitting(false);
    setLocation('/employee/dashboard');
  };

  const onPermissionSubmit = async (data: PermissionForm) => {
    console.log('Apply Permission onSubmit', data);
    if (!user) return;

    const user_id = user.id;
    if (!user_id) {
      toast({ title: 'Error', description: 'User not properly logged in. Please log in again.', variant: 'destructive' });
      return;
    }

    const permissionData = {
      id: Math.random().toString(36).substr(2, 9),
      employeeId: user_id,
      employeeName: user.name,
      employeeCode: user.code,
      type: 'Permission',
      permissionType: data.permissionType || 'Official',
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      description: data.reason,
      status: 'Pending',
      appliedDate: new Date().toISOString().split('T')[0]
    };

    try {
      await addLeaveRequest(permissionData as any);
    } catch (err) {
      console.error('Failed to submit permission:', err);
      const message = (err as any)?.message || JSON.stringify(err) || 'Could not submit permission request.';
      toast({ title: 'Submission failed', description: message, variant: 'destructive' });
      return;
    }

    // Send permission notification
    try {
      const { adminEmails, hrEmails } = await (await import('@/lib/storage')).getNotificationEmails();
      fetch('/api/send-permission-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeName: user.name,
          permissionType: data.permissionType || 'Official',
          startTime: data.startTime,
          endTime: data.endTime,
          reason: data.reason,
          hrEmails,
          adminEmails
        })
      }).catch(err => console.log('Permission email notification sent (demo)'));
    } catch (e) {
      console.log('Failed to resolve notification emails for permission, using defaults', e);
      fetch('/api/send-permission-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeName: user.name,
          permissionType: data.permissionType || 'Official',
          startTime: data.startTime,
          endTime: data.endTime,
          reason: data.reason,
          hrEmails: ['naveen@ctint.in'],
          adminEmails: ['naveen@ctint.in']
        })
      }).catch(() => { });
    }

    toast({
      title: "✅ Permission Request Submitted",
      description: "HR/Admin will review it shortly. Notification sent.",
      className: "bg-green-500/10 border-green-500/20 text-green-700 font-medium"
    });

    setLocation('/employee/dashboard');
  };

  const handleFile = (file?: File) => {
    if (!file) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) {
      toast({ title: 'Invalid file type', description: 'Only PDF, JPG, PNG are allowed', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum allowed size is 5MB', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachment({ name: file.name, size: file.size, type: file.type, dataUrl: reader.result as string });
      toast({ title: 'Attachment added', description: file.name });
    };
    reader.readAsDataURL(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    handleFile(file);
  };

  const removeAttachment = () => setAttachment(null);

  return (
    <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">Apply for Leave</h2>
          <p className="text-slate-600">Submit your leave request for approval</p>
        </div>
        {balance && (
          <div className="flex gap-4 text-xs">
            <div className="bg-white border border-slate-200 px-3 py-2 rounded-md shadow-sm">
              <span className="text-slate-500 block">Casual Balance</span>
              <span className={`font-bold ${balance.casual.remaining === 0 ? 'text-red-500' : 'text-primary'}`}>
                {balance.casual.remaining} / {balance.casual.total}
              </span>
            </div>
            <div className="bg-white border border-slate-200 px-3 py-2 rounded-md shadow-sm">
              <span className="text-slate-500 block">Sick Balance</span>
              <span className={`font-bold ${balance.sick.remaining === 0 ? 'text-red-500' : 'text-primary'}`}>
                {balance.sick.remaining} / {balance.sick.total}
              </span>
            </div>
          </div>
        )}
      </div>

      <Card className="bg-white border-slate-200 shadow-2xl">
        <CardContent className="pt-6">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            <div className="space-y-2">
              <Label className="text-slate-700 font-medium">Leave Type</Label>
              <Select onValueChange={(val) => form.setValue('type', val as any)} defaultValue={form.getValues('type')}>
                <SelectTrigger className="bg-white border-slate-200 text-slate-900">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200 text-slate-900">
                  <SelectItem value="Casual">Casual Leave</SelectItem>
                  <SelectItem value="Sick">Sick Leave</SelectItem>
                  <SelectItem value="OD">On Duty (OD)</SelectItem>
                  <SelectItem value="Comp Off">Comp Off</SelectItem>
                  <SelectItem value="LWP">Leave Without Pay (LWP)</SelectItem>
                  <SelectItem value="Earned">Earned Leave</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-700 font-medium">Start Date</Label>
                <Input
                  type="date"
                  {...form.register('startDate')}
                  className="bg-white border-slate-200 text-slate-900"
                />
                {form.formState.errors.startDate && <p className="text-red-400 text-xs">{form.formState.errors.startDate.message}</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700 font-medium">End Date</Label>
                <Input
                  type="date"
                  {...form.register('endDate')}
                  className="bg-white border-slate-200 text-slate-900"
                />
                {form.formState.errors.endDate && <p className="text-red-400 text-xs">{form.formState.errors.endDate.message}</p>}
              </div>
            </div>

            {watchedLeaveType === 'Comp Off' && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm space-y-2">
                <p className="font-bold text-blue-800">
                  Approved Comp Off Balance: {compOffBalanceDays ?? '...'} day(s)
                </p>
                {compOffCoverage && (
                  <div className="space-y-1 text-blue-700">
                    <p>Requested Days: <span className="font-semibold">{compOffCoverage.requestedDays}</span></p>
                    <p>Approved Comp Off Available: <span className="font-semibold">{compOffCoverage.approvedAvailable}</span></p>
                    <p>Comp Off Covered Dates: <span className="font-semibold">{compOffCoverage.coveredDates.join(', ') || 'None'}</span></p>
                    {compOffCoverage.lopDays > 0 ? (
                      <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md p-2 mt-2">
                        <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                        <p className="text-red-700 font-semibold">
                          You have {compOffCoverage.approvedAvailable} approved Comp Off day(s). {compOffCoverage.coveredDates.join(', ') || 'No dates'} will be covered by Comp Off.
                          {' '}{compOffCoverage.uncoveredDates.join(', ')} {compOffCoverage.uncoveredDates.length > 1 ? 'are' : 'is'} not covered and will be treated as LOP ({compOffCoverage.lopDays} day(s)).
                        </p>
                      </div>
                    ) : (
                      <p className="text-green-700 font-semibold">All requested days are fully covered by approved Comp Off. No LOP.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-slate-700 font-medium">Duration</Label>
              <RadioGroup
                defaultValue="Full Day"
                onValueChange={(val) => {
                  form.setValue('duration', val as any);
                  // Clear time fields when switching away from Hourly
                  if (val !== 'Hourly') {
                    form.setValue('fromTime', '');
                    form.setValue('toTime', '');
                  }
                }}
                className="flex gap-4 flex-wrap"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Full Day" id="full" className="border-slate-300 text-primary" />
                  <Label htmlFor="full" className="text-slate-900">Full Day</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Half Day" id="half" className="border-slate-300 text-primary" />
                  <Label htmlFor="half" className="text-slate-900">Half Day</Label>
                </div>
                {watchedLeaveType === 'OD' && (
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Hourly" id="hourly" className="border-slate-300 text-primary" />
                    <Label htmlFor="hourly" className="text-slate-900">Hourly</Label>
                  </div>
                )}
              </RadioGroup>
            </div>

            {watchedDuration === 'Hourly' && watchedLeaveType === 'OD' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-700 font-medium">From Time</Label>
                  <Input
                    type="time"
                    {...form.register('fromTime')}
                    className="bg-white border-slate-200 text-slate-900"
                  />
                  {form.formState.errors.fromTime && <p className="text-red-400 text-xs">{form.formState.errors.fromTime.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700 font-medium">To Time</Label>
                  <Input
                    type="time"
                    {...form.register('toTime')}
                    className="bg-white border-slate-200 text-slate-900"
                  />
                  {form.formState.errors.toTime && <p className="text-red-400 text-xs">{form.formState.errors.toTime.message}</p>}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-slate-700 font-medium">Reason / Description</Label>
              <Textarea
                {...form.register('description')}
                placeholder="Please describe the reason for your leave..."
                className="bg-white border-slate-200 text-slate-900 min-h-[100px]"
              />
              {form.formState.errors.description && <p className="text-red-400 text-xs">{form.formState.errors.description.message}</p>}
            </div>

            <div className="space-y-2">
              <Label className="text-slate-700 font-medium">Attachment (Optional)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={onFileChange}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
                role="button"
                className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer bg-slate-50"
              >
                {!attachment ? (
                  <>
                    <p className="text-sm text-slate-600 font-medium">Click to upload or drag and drop</p>
                    <p className="text-xs text-slate-400 mt-1">PDF, JPG, PNG up to 5MB</p>
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <p className="text-sm text-slate-900 font-semibold">{attachment.name}</p>
                      <p className="text-xs text-slate-500 font-medium">{(attachment.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" onClick={(e) => { e.stopPropagation(); removeAttachment(); }} className="text-red-400">Remove</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4">
              <Button type="submit" disabled={submitting} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                {submitting ? 'Submitting...' : 'Submit Application'}
              </Button>
            </div>

          </form>
        </CardContent>
      </Card>

      <Dialog open={lopConfirmOpen} onOpenChange={setLopConfirmOpen}>
        <DialogContent className="bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" /> Insufficient Comp Off Balance
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              {pendingSubmit && (
                <>
                  You have {pendingSubmit.coverage.approvedAvailable} approved Comp Off day(s) available.
                  {' '}{pendingSubmit.coverage.coveredDates.join(', ') || 'No dates'} will be covered by Comp Off.
                  {' '}{pendingSubmit.coverage.uncoveredDates.join(', ')} {pendingSubmit.coverage.uncoveredDates.length > 1 ? 'will' : 'will'} be treated as Loss of Pay (LOP) — {pendingSubmit.coverage.lopDays} day(s).
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-slate-200 hover:bg-slate-50 text-slate-600"
              onClick={() => { setLopConfirmOpen(false); setPendingSubmit(null); }}
            >
              Cancel
            </Button>
            <Button
              disabled={submitting}
              className="bg-red-600 hover:bg-red-700 text-white font-bold"
              onClick={async () => {
                if (!pendingSubmit) return;
                setLopConfirmOpen(false);
                await doSubmitLeave(pendingSubmit.data, pendingSubmit.coverage);
                setPendingSubmit(null);
              }}
            >
              Confirm & Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}