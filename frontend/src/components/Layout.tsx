import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Table2,
  Cpu,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/athletes', label: 'Athletes', icon: Users },
  { to: '/results', label: 'Results', icon: Table2 },
  { to: '/devices', label: 'Devices', icon: Cpu },
];

export function Layout() {
  const { logout, config } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Mobile header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-surface-900">
        <div className="flex items-center gap-2">
          <img
            src="/logo.jpeg"
            alt="RiadhaTrack"
            className="h-9 w-auto object-contain rounded"
          />
        </div>
        <button
          className="btn-ghost p-2"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {/* Sidebar */}
      <aside
        className={cn(
          'w-64 shrink-0 border-r border-slate-800 bg-surface-900/95 flex flex-col',
          'md:flex',
          mobileOpen ? 'flex' : 'hidden'
        )}
      >
        <div className="hidden md:flex items-center justify-center px-4 py-4 border-b border-slate-800">
          <img
            src="/logo.jpeg"
            alt="RiadhaTrack"
            className="h-14 w-auto object-contain rounded"
          />
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-600/20 text-brand-300 border border-brand-500/30'
                    : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
                )
              }
            >
              <Icon className="h-4.5 w-4.5 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-4 space-y-3">
          {config?.user && (
            <div className="px-1">
              <div className="text-xs text-slate-500">Signed in as</div>
              <div className="text-sm font-medium text-slate-200 truncate">
                {config.user.username}
              </div>
              <div className="text-[11px] text-slate-500 capitalize">
                {config.user.role}
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="btn-ghost w-full justify-start text-slate-400 hover:text-red-300"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}