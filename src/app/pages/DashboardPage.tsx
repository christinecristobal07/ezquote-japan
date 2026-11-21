import { Link } from 'react-router';
import { Badge, Card, CardBody, PageHeader } from '@/components/ui';
import { visibleNavItems } from '@/app/navigation';
import { ROLE_LABELS } from '@/app/roleLabels';
import { useAuth } from '@/features/auth/useAuth';
import { firstName, greetingFor } from '@/lib/greeting';
import { RecentQuotationsCard } from './RecentQuotationsCard';

export function DashboardPage() {
  const { profile } = useAuth();
  if (profile === null) return null;

  const actions = visibleNavItems(profile.role).filter((item) => item.path !== '/');

  return (
    <>
      <PageHeader
        title={`${greetingFor(new Date())}, ${firstName(profile.fullName)}`}
        description="Build a quotation, or pick up where you left off."
        actions={<Badge tone="info">{ROLE_LABELS[profile.role]}</Badge>}
      />
      <div className="mb-6">
        <RecentQuotationsCard role={profile.role} />
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((item) => (
          <li key={item.path}>
            <Card className="hover:border-brand-600 h-full transition-colors">
              <CardBody>
                <Link to={item.path} className="flex items-start gap-3">
                  <span className="bg-brand-50 text-brand-700 rounded-md p-2">
                    <item.icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                    <span className="block text-xs text-slate-600">Go to {item.label}</span>
                  </span>
                </Link>
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
