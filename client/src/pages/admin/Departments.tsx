import { DepartmentsManager } from '@/components/DepartmentsManager';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';

export default function DepartmentsPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center gap-4 mb-2">
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
          <h2 className="text-3xl font-display font-bold text-slate-900">Departments</h2>
          <p className="text-slate-600">Create, organize, and manage organizational departments</p>
        </div>
      </div>

      <DepartmentsManager />
    </div>
  );
}
