import { NavLink } from 'react-router';
import type { Role } from '@/domain/permissions';
import { visibleNavGroups } from '@/app/navigation';
import { cn } from '@/lib/cn';

export function SidebarNav({
  role,
  collapsed = false,
  onNavigate,
}: {
  role: Role;
  collapsed?: boolean;
  /** Called after a link is followed, so the mobile drawer can close itself. */
  onNavigate?: () => void;
}) {
  const groups = visibleNavGroups(role);

  return (
    <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group.name}>
          {!collapsed && (
            <h2 className="px-3 pb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              {group.name}
            </h2>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                      collapsed && 'justify-center px-2',
                      isActive
                        ? 'bg-brand-50 text-brand-900 font-medium'
                        : 'text-slate-700 hover:bg-slate-100',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                      {isActive && <span className="sr-only">(current page)</span>}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
