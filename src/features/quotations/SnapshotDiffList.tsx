import { formatPhp, fromPhp, type Markup, type SnapshotDiff } from '@/domain';

function jpy(amount: number): string {
  return `JPY ${amount.toLocaleString('en-US')}`;
}

/** Snapshot markups are plain pesos, as the rate engine reads them. */
function markupText(markup: Markup | null): string {
  if (markup === null) return 'none';
  return markup.type === 'percent' ? `${String(markup.value)}%` : formatPhp(fromPhp(markup.value));
}

/** What has moved between a quotation's frozen rates and today's. */
export function SnapshotDiffList({ diff }: { diff: SnapshotDiff }) {
  return (
    <div className="space-y-4 text-sm">
      {diff.fx.length > 0 && (
        <section>
          <h4 className="font-semibold text-slate-900">Exchange rate</h4>
          <ul className="mt-1 space-y-0.5 text-slate-700">
            {diff.fx.map((change) => (
              <li key={change.currency}>
                {change.currency}: {String(change.oldRate ?? '—')} → {String(change.newRate ?? '—')}{' '}
                PHP
              </li>
            ))}
          </ul>
        </section>
      )}

      {diff.tiers.length > 0 && (
        <section>
          <h4 className="font-semibold text-slate-900">Operator rates</h4>
          <ul className="mt-1 space-y-0.5 text-slate-700">
            {diff.tiers.map((change) => (
              <li key={`${change.serviceId}-${change.paxType}-${String(change.minPax)}`}>
                {change.serviceName} · {String(change.minPax)}–{String(change.maxPax)} pax:{' '}
                {change.oldAmount === null ? 'new' : jpy(change.oldAmount)} →{' '}
                {change.newAmount === null ? 'withdrawn' : jpy(change.newAmount)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(diff.categoryMarkups.length > 0 || diff.serviceMarkups.length > 0) && (
        <section>
          <h4 className="font-semibold text-slate-900">Markups</h4>
          <ul className="mt-1 space-y-0.5 text-slate-700">
            {[...diff.categoryMarkups, ...diff.serviceMarkups].map((change) => (
              <li key={change.key}>
                {change.key.replace('_', ' ')}: {markupText(change.oldMarkup)} →{' '}
                {markupText(change.newMarkup)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(diff.servicesRemoved.length > 0 || diff.servicesAdded.length > 0) && (
        <section>
          <h4 className="font-semibold text-slate-900">Services</h4>
          <ul className="mt-1 space-y-0.5 text-slate-700">
            {diff.servicesRemoved.map((service) => (
              <li key={service.serviceId}>{service.serviceName}: no longer on sale</li>
            ))}
            {diff.servicesAdded.map((service) => (
              <li key={service.serviceId}>{service.serviceName}: newly available</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
