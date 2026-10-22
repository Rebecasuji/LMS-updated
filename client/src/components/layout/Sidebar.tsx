import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  CalendarPlus,
  CalendarClock,
  Clock,
  History,
  User,
  LogOut,
  Users,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  BarChart3,
  FileBarChart,
  CalendarDays,
  SlidersHorizontal,
  FolderOpen,
  Settings2,
  Send,
  ChevronDown,
  Menu,
  type LucideIcon,
} from 'lucide-react';

import logoUrl from '@assets/Screenshot_2025-10-15_183825_1765652253224.png';

type NavLink = { icon: LucideIcon; label: string; path: string };
type NavGroup = { id: string; icon: LucideIcon; label: string; items: NavLink[] };
type NavEntry = ({ kind: 'link' } & NavLink) | ({ kind: 'group' } & NavGroup);

const link = (icon: LucideIcon, label: string, path: string): NavEntry => ({ kind: 'link', icon, label, path });
const group = (id: string, icon: LucideIcon, label: string, items: NavLink[]): NavEntry => ({ kind: 'group', id, icon, label, items });

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const isActive = (path: string) => location === path;

  // ---- Menus (same pages as before, now grouped) -------------------------
  const employeeNav: NavEntry[] = [
    link(LayoutDashboard, 'Dashboard', '/employee/dashboard'),
    group('apply', Send, 'Apply', [
      { icon: CalendarPlus, label: 'Leave', path: '/employee/apply-leave' },
      { icon: CalendarClock, label: 'Comp Off', path: '/employee/apply-comp-off' },
      { icon: Clock, label: 'Permission', path: '/employee/permission' },
    ]),
    group('history', History, 'History', [
      { icon: History, label: 'Leave History', path: '/employee/history' },
      { icon: History, label: 'Permission History', path: '/employee/permission-history' },
    ]),
    link(BarChart3, 'My Report', `/admin/individual-report/${user?.id || ''}`),
    link(User, 'Profile', '/employee/profile'),
  ];

  const adminNav: NavEntry[] = [
    link(LayoutDashboard, 'Dashboard', '/admin/dashboard'),
    group('approvals', ClipboardCheck, 'Approvals', [
      { icon: CalendarPlus, label: 'Leaves', path: '/admin/view-leaves' },
      { icon: Clock, label: 'Permissions', path: '/admin/view-permissions' },
      { icon: CalendarClock, label: 'Comp Off', path: '/admin/approve-comp-off' },
    ]),
    group('apply', Send, 'Apply', [
      { icon: CalendarPlus, label: 'Leave', path: '/employee/apply-leave' },
      { icon: CalendarClock, label: 'Comp Off', path: '/employee/apply-comp-off' },
      { icon: Clock, label: 'Permission', path: '/employee/permission' },
    ]),
    group('records', FolderOpen, 'Records', [
      { icon: CheckCircle2, label: 'Approved Leaves', path: '/admin/approved-leaves' },
      { icon: CheckCircle2, label: 'Approved Permissions', path: '/admin/approved-permissions' },
      { icon: XCircle, label: 'Rejected Requests', path: '/admin/rejected-leaves' },
    ]),
    group('manage', Settings2, 'Manage', [
      { icon: Users, label: 'Employees', path: '/admin/employees' },
      { icon: SlidersHorizontal, label: 'Manage Balances', path: '/admin/manage-balances' },
      { icon: CalendarDays, label: 'Settings', path: '/admin/leave-settings' },
    ]),
    group('insights', BarChart3, 'Reports', [
      { icon: BarChart3, label: 'Analytics', path: '/admin/charts' },
      { icon: FileBarChart, label: 'Reports', path: '/reports' },
    ]),
  ];

  const hrNav: NavEntry[] = [
    link(LayoutDashboard, 'Dashboard', '/employee/dashboard'),
    group('approvals', ClipboardCheck, 'Approvals', [
      { icon: CalendarPlus, label: 'Leaves', path: '/admin/view-leaves' },
      { icon: Clock, label: 'Permissions', path: '/admin/view-permissions' },
      { icon: CalendarClock, label: 'Comp Off', path: '/admin/approve-comp-off' },
    ]),
    group('apply', Send, 'Apply', [
      { icon: CalendarPlus, label: 'Leave', path: '/employee/apply-leave' },
      { icon: CalendarClock, label: 'Comp Off', path: '/employee/apply-comp-off' },
    ]),
    group('history', History, 'History', [
      { icon: History, label: 'Leave History', path: '/employee/history' },
      { icon: History, label: 'Permission History', path: '/employee/permission-history' },
    ]),
    group('records', FolderOpen, 'Records', [
      { icon: CheckCircle2, label: 'Approved Leaves', path: '/admin/approved-leaves' },
      { icon: CheckCircle2, label: 'Approved Permissions', path: '/admin/approved-permissions' },
      { icon: XCircle, label: 'Rejected Requests', path: '/admin/rejected-leaves' },
    ]),
    group('manage', Settings2, 'Manage', [
      { icon: SlidersHorizontal, label: 'Manage Balances', path: '/admin/manage-balances' },
      { icon: CalendarDays, label: 'Settings', path: '/admin/leave-settings' },
    ]),
    link(FileBarChart, 'Reports', '/reports'),
    link(User, 'Profile', '/employee/profile'),
  ];

  const nav = user?.role === 'Admin' ? adminNav : user?.role === 'HR' ? hrNav : employeeNav;

  // ---- Expand / collapse groups -------------------------------------------
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // Always open the group that contains the page you are on.
  useEffect(() => {
    nav.forEach((entry) => {
      if (entry.kind === 'group' && entry.items.some((i) => isActive(i.path))) {
        setOpen((prev) => (prev[entry.id] ? prev : { ...prev, [entry.id]: true }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, user?.role]);

  const toggleGroup = (id: string) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  const getInitials = (name?: string, code?: string) => {
    if (name && name.trim()) {
      const parts = name.trim().split(/\s+/);
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return code ? code.slice(0, 2).toUpperCase() : '';
  };

  // ---- Row renderers ---------------------------------------------------------
  const renderLink = (item: NavLink, opts: { nested?: boolean } = {}) => {
    const active = isActive(item.path);
    return (
      <Link key={item.path} href={item.path}>
        <div
          title={collapsed ? item.label : undefined}
          className={cn(
            'group relative flex cursor-pointer items-center rounded-lg text-sm transition-colors',
            collapsed ? 'justify-center px-0 py-2.5' : opts.nested ? 'gap-3 py-2 pl-3 pr-3' : 'gap-3 px-3 py-2.5',
            active
              ? 'bg-white text-[#1A3DB1] font-semibold shadow-sm dark:bg-blue-500/20 dark:text-white'
              : 'text-white/75 hover:bg-white/10 hover:text-white dark:text-slate-400'
          )}
        >
          <item.icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-[#1A3DB1] dark:text-white' : 'text-white/70 group-hover:text-white dark:text-slate-400')} />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </div>
      </Link>
    );
  };

  const renderGroup = (g: NavGroup) => {
    // Icon rail: show the group's pages as plain icons, separated by a thin line.
    if (collapsed) {
      return (
        <div key={g.id} className="space-y-1 border-t border-white/10 pt-2 first:border-t-0 first:pt-0">
          {g.items.map((i) => renderLink(i))}
        </div>
      );
    }

    const isOpen = !!open[g.id];
    const hasActive = g.items.some((i) => isActive(i.path));

    return (
      <div key={g.id}>
        <button
          type="button"
          onClick={() => toggleGroup(g.id)}
          aria-expanded={isOpen}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
            hasActive && !isOpen ? 'bg-white/15 text-white' : 'text-white/85 hover:bg-white/10 hover:text-white dark:text-slate-300'
          )}
        >
          <g.icon className="h-[18px] w-[18px] shrink-0 text-white/80 dark:text-slate-400" />
          <span className="flex-1 truncate text-left">{g.label}</span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-white/60 transition-transform duration-200', isOpen && 'rotate-180')} />
        </button>

        <div className={cn('grid transition-[grid-template-rows] duration-200 ease-out', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
          <div className="overflow-hidden">
            <div className="ml-[21px] mt-1 space-y-0.5 border-l border-white/15 pl-3">
              {g.items.map((i) => renderLink(i, { nested: true }))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-50 flex h-screen flex-col bg-[#1A3DB1] shadow-xl transition-all duration-300 dark:bg-[#0F172A]',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo + toggle */}
      <div className={cn('relative flex h-[84px] shrink-0 items-center border-b border-white/10', collapsed ? 'justify-center px-2' : 'justify-center px-6')}>
        {!collapsed && <img src={logoUrl} alt="Knockturn Logo" className="h-12 w-auto object-contain mix-blend-screen" />}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
          aria-expanded={!collapsed}
          className={cn(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
            collapsed ? '' : 'absolute right-3 top-1/2 -translate-y-1/2'
          )}
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation (scrolls on its own; logo and user card stay fixed) */}
      <nav className={cn('flex-1 space-y-1 overflow-y-auto py-4 [scrollbar-width:thin]', collapsed ? 'px-2' : 'px-3')}>
        {nav.map((entry) => (entry.kind === 'link' ? renderLink(entry) : renderGroup(entry)))}
      </nav>

      {/* User + logout */}
      <div className={cn('shrink-0 border-t border-white/10 bg-black/10', collapsed ? 'p-2' : 'p-3')}>
        <div className={cn('mb-3 flex items-center', collapsed ? 'justify-center' : 'gap-3 px-1')}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/20 text-xs font-bold text-white">
            {getInitials(user?.name, user?.code)}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user?.name}</p>
              <p className="truncate text-xs text-white/60">
                {user?.id}
                {user?.role ? ` · ${user.role}` : ''}
              </p>
            </div>
          )}
        </div>
        <button
          onClick={logout}
          title={collapsed ? 'Logout' : undefined}
          aria-label="Logout"
          className={cn(
            'flex w-full items-center justify-center rounded-lg border border-white/20 bg-white/10 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20',
            collapsed ? '' : 'gap-2'
          )}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && 'Logout'}
        </button>
      </div>
    </aside>
  );
}