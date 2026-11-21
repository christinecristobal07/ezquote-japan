import { NavLink, Outlet } from 'react-router';
import { PageHeader } from '@/components/ui';
import { cn } from '@/lib/cn';

const TABS = [
  { label: 'Tours & Transfers', path: '/admin/content/services' },
  { label: 'Hotels', path: '/admin/content/hotels' },
  { label: 'Package text', path: '/admin/content/text' },
  { label: 'Reference data', path: '/admin/content/reference' },
  { label: 'Quotation settings', path: '/admin/content/settings' },
] as const;

export function ContentLayout() {
  return (
    <>
      <PageHeader
        title="Content"
        description="Everything here flows into quotations. Prices live under Rates & FX."
      />
      <nav aria-label="Content sections" className="mb-6 border-b border-slate-200">
        <ul className="-mb-px flex flex-wrap gap-1">
          {TABS.map((tab) => (
            <li key={tab.path}>
              <NavLink
                to={tab.path}
                className={({ isActive }) =>
                  cn(
                    'inline-block border-b-2 px-3 py-2 text-sm',
                    isActive
                      ? 'border-brand-600 text-brand-700 font-medium'
                      : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900',
                  )
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </>
  );
}
