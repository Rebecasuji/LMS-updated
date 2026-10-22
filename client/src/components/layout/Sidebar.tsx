import { useAuth } from '@/context/AuthContext';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  History,
  User,
  LogOut,
  Users,
  CheckSquare,
  XSquare,
  BarChart3,
  Building2,
  Lock,
  CalendarClock,
  CalendarDays,
  SlidersHorizontal,
  Menu
} from 'lucide-react';

import logoUrl from '@assets/Screenshot_2025-10-15_183825_1765652253224.png';

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const isActive = (path: string) => location === path;

  const employeeLinks = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/employee/dashboard' },
    { icon: FileText, label: 'Apply Leave', path: '/employee/apply-leave' },
    { icon: CalendarClock, label: 'Apply Comp Off', path: '/employee/apply-comp-off' },
    { icon: Lock, label: 'Permission', path: '/employee/permission' },
    { icon: History, label: 'Permission History', path: '/employee/permission-history' },
    { icon: History, label: 'Leave History', path: '/employee/history' },
    { icon: User, label: 'Profile', path: '/employee/profile' },
    { icon: BarChart3, label: 'My Report', path: `/admin/individual-report/${user?.id || ''}` },
  ];

  const adminLinks = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/admin/dashboard' },
    { icon: FileText, label: 'Apply Leave', path: '/employee/apply-leave' },
    { icon: CalendarClock, label: 'Apply Comp Off', path: '/employee/apply-comp-off' },
    { icon: Lock, label: 'Permission', path: '/employee/permission' },
    { icon: CheckSquare, label: 'View Leaves', path: '/admin/view-leaves' },
    { icon: CalendarClock, label: 'Approve Comp Off', path: '/admin/approve-comp-off' },
    { icon: Lock, label: 'View Permissions', path: '/admin/view-permissions' },
    { icon: SlidersHorizontal, label: 'Manage Balances', path: '/admin/manage-balances' },
    { icon: CalendarDays, label: 'Leave Settings', path: '/admin/leave-settings' },
    { icon: Building2, label: 'Departments', path: '/admin/departments' },
    { icon: Users, label: 'Employees', path: '/admin/employees' },
    { icon: BarChart3, label: 'Analytics', path: '/admin/charts' },
    { icon: CheckSquare, label: 'Approved Leaves', path: '/admin/approved-leaves' },
    { icon: Lock, label: 'Approved Permissions', path: '/admin/approved-permissions' },
    { icon: FileText, label: 'Reports', path: '/reports' },
  ];

  const hrLinks = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/employee/dashboard' },
    { icon: CheckSquare, label: 'Approve Leaves', path: '/admin/view-leaves' },
    { icon: CalendarClock, label: 'Approve Comp Off', path: '/admin/approve-comp-off' },
    { icon: Lock, label: 'View Permissions', path: '/admin/view-permissions' },
    { icon: SlidersHorizontal, label: 'Manage Balances', path: '/admin/manage-balances' },
    { icon: CalendarDays, label: 'Leave Settings', path: '/admin/leave-settings' },
    { icon: FileText, label: 'Apply Leave', path: '/employee/apply-leave' },
    { icon: CalendarClock, label: 'Apply Comp Off', path: '/employee/apply-comp-off' },
    { icon: History, label: 'Leave History', path: '/employee/history' },
    { icon: History, label: 'Permission History', path: '/employee/permission-history' },
    { icon: User, label: 'Profile', path: '/employee/profile' },
    { icon: CheckSquare, label: 'Approved Leaves', path: '/admin/approved-leaves' },
    { icon: Lock, label: 'Approved Permissions', path: '/admin/approved-permissions' },
    { icon: BarChart3, label: 'Reports', path: '/reports' },
  ];

  const links = user?.role === 'Admin' ? adminLinks : (user?.role === 'HR' ? hrLinks : employeeLinks);

  const getInitials = (name?: string, code?: string) => {
    if (name && name.trim()) {
      const parts = name.trim().split(/\s+/);
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return code ? code.slice(0, 2).toUpperCase() : '';
  };

  return (
    <aside className={cn(
      "h-screen bg-[#1A3DB1] dark:bg-[#0F172A] flex flex-col fixed left-0 top-0 z-50 shadow-xl transition-all duration-300",
      collapsed ? "w-16" : "w-64"
    )}>
      <div className={cn(
        "relative flex h-[84px] items-center border-b border-white/10",
        collapsed ? "justify-center px-2" : "justify-center px-6"
      )}>
        {!collapsed && <img src={logoUrl} alt="Knockturn Logo" className="h-12 w-auto object-contain mix-blend-screen" />}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand navigation sidebar" : "Collapse navigation sidebar"}
          aria-expanded={!collapsed}
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
            collapsed ? "" : "absolute right-3 top-1/2 -translate-y-1/2"
          )}
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <div className={cn("flex-1 space-y-1 overflow-y-auto py-6", collapsed ? "px-2" : "px-3")}>
        {links.map((link) => (
          <Link key={link.path} href={link.path}>
            <div
              className={cn(
                "flex items-center rounded-md transition-all duration-300 group cursor-pointer border-l-4",
                collapsed ? "justify-center px-0 py-3" : "gap-3 px-4 py-3",
                isActive(link.path)
                  ? "bg-white/20 dark:bg-blue-500/15 text-white border-white/20 dark:border-blue-500 shadow-md"
                  : "text-white/70 dark:text-slate-400 border-transparent hover:text-white hover:bg-white/10 dark:hover:bg-white/5"
              )}
              title={collapsed ? link.label : undefined}
            >
              <link.icon className={cn("h-5 w-5 shrink-0", isActive(link.path) ? "text-white" : "text-white/70 dark:text-slate-400 group-hover:text-white")} />
              {!collapsed && <span className="font-medium">{link.label}</span>}
            </div>
          </Link>
        ))}
      </div>

      <div className={cn("border-t border-white/10 bg-white/5", collapsed ? "p-2" : "p-4")}>
        <div className={cn("mb-4 flex items-center", collapsed ? "justify-center" : "gap-3 px-2")}>
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center border border-white/10 text-xs font-bold text-white">
            {getInitials(user?.name, user?.code)}
          </div>
          {!collapsed && <div className="overflow-hidden">
            <p className="text-sm font-medium text-white truncate">{user?.name}</p>
            <p className="text-xs text-white/60">{user?.id}</p>
          </div>}
        </div>
        <button
          onClick={logout}
          title={collapsed ? "Logout" : undefined}
          aria-label="Logout"
          className={cn(
            "flex items-center justify-center rounded-md border border-white/20 bg-white/10 py-2 text-sm font-medium text-white transition-all hover:bg-white/20",
            collapsed ? "w-full" : "w-full gap-2"
          )}
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && "Logout"}
        </button>
      </div>
    </aside>
  );
}
