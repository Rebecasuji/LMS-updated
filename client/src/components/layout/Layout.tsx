import { Sidebar } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import { NotificationsBell } from '@/components/NotificationsBell';
import { Toaster } from '@/components/ui/toaster';
import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';

export function Layout({ children }: { children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    // Simple entry animation for page content
    if (contentRef.current) {
      gsap.fromTo(contentRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }
      );
    }
  }, [children]); // Re-run when children (route) changes

  return (
    <div className="min-h-screen bg-background text-foreground flex font-sans overflow-hidden relative transition-colors duration-300">
      {/* Ambient background effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-blue-100/10 dark:bg-blue-900/10 rounded-full blur-[120px]" />
      </div>

      {/* Sidebar collapses to an icon rail instead of disappearing */}
      <div className="fixed inset-y-0 left-0 z-40">
        <Sidebar collapsed={!sidebarOpen} onToggle={() => setSidebarOpen((open) => !open)} />
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/20 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className={`flex-1 ml-16 ${sidebarOpen ? 'md:ml-64' : 'md:ml-16'} relative z-10 h-screen overflow-y-auto transition-all duration-300`}>
        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-8 bg-white/50 dark:bg-slate-900/50 backdrop-blur border-b border-border sticky top-0 z-20">
          <div className="flex items-center gap-4" />
          <div className="flex items-center gap-4">
            <NotificationsBell />
            <ThemeToggle />
          </div>
        </header>

        <div className="container mx-auto p-8 max-w-7xl" ref={contentRef}>
          {children}
        </div>
      </main>
      <Toaster />
    </div>
  );
}
