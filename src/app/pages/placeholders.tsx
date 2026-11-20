import { Link } from 'react-router';
import { Card, EmptyState, PageHeader } from '@/components/ui';

function Placeholder({
  title,
  description,
  step,
}: {
  title: string;
  description: string;
  step: number;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <EmptyState title="Not built yet" text={`Coming in Step ${String(step)}.`} />
      </Card>
    </>
  );
}

export function QuotationsPage() {
  return (
    <Placeholder
      title="Quotations"
      description="Every quotation you can see, newest first."
      step={11}
    />
  );
}

export function NewQuotationPage() {
  return (
    <Placeholder
      title="New quotation"
      description="Pick the services, hotels and travellers, then generate the rate."
      step={11}
    />
  );
}

export function TeamQuotationsPage() {
  return (
    <Placeholder
      title="Team quotations"
      description="Quotations from the agents who report to you."
      step={12}
    />
  );
}

export function RatesAdminPage() {
  return (
    <Placeholder
      title="Rates & FX"
      description="Rate versions, group-size tiers, add-ons and exchange rates."
      step={13}
    />
  );
}

export function ContentAdminPage() {
  return (
    <Placeholder
      title="Content"
      description="Inclusions, exclusions, notes, requirements and remarks."
      step={14}
    />
  );
}

export function AgentsAdminPage() {
  return (
    <Placeholder
      title="Agents"
      description="Agent profiles, roles, supervisors and Rate My Service links."
      step={10}
    />
  );
}

export function AuditPage() {
  return (
    <Placeholder
      title="Audit log"
      description="Every important change, with who made it and when."
      step={15}
    />
  );
}

export function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-brand-900 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-slate-600">The page you were looking for does not exist.</p>
        <Link to="/" className="text-brand-600 mt-6 inline-block text-sm hover:underline">
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}
