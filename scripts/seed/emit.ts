import { arrayLit, lit, uuid5 } from './sql.ts';
import { CITIES, DEFAULT_SERVICE_CODES, FIXED } from './content.ts';
import type { SeedAgent, SeedHotel, SeedService, SeedSetting } from './types.ts';

export interface SeedInput {
  readonly services: readonly SeedService[];
  readonly hotels: readonly SeedHotel[];
  readonly agents: readonly SeedAgent[];
  readonly settings: readonly SeedSetting[];
  readonly warnings: readonly string[];
}

function section(title: string): string {
  const rule = '-'.repeat(77);
  return `\n-- ${rule}\n-- ${title}\n-- ${rule}\n`;
}

function cityRef(name: string | null): string {
  if (name === null) return 'null';
  return `(select id from public.cities where name = ${lit(name)})`;
}

function emitCities(): string {
  const rows = CITIES.map(
    (name, index) => `  (${lit(name)}, ${index + 1})`, //
  ).join(',\n');
  return `${section('Cities')}insert into public.cities (name, sort_order) values\n${rows}\non conflict (name) do nothing;\n`;
}

function emitHotels(hotels: readonly SeedHotel[]): string {
  const statements = hotels.map(
    (h) =>
      `insert into public.hotels (city_id, name, star_rating, walk_to_station, sort_order)\n` +
      `select c.id, ${lit(h.name)}, ${h.starRating}, ${lit(h.walkToStation)}, ${h.sortOrder}\n` +
      `from public.cities c where c.name = ${lit(h.cityName)}\n` +
      `on conflict (city_id, name) do nothing;`,
  );
  return `${section(`Hotels (${hotels.length})`)}${statements.join('\n\n')}\n`;
}

function emitServices(services: readonly SeedService[]): string {
  const parts: string[] = [];

  for (const s of services) {
    parts.push(
      `insert into public.services (\n` +
        `  code, service_type, name, city_id, itinerary_title, itinerary_text,\n` +
        `  inclusion_text, consumes_day, adds_night, transfer_direction, sort_order\n` +
        `) values (\n` +
        `  ${lit(s.code)}, ${lit(s.serviceType)}, ${lit(s.name)}, ${cityRef(s.cityName)},\n` +
        `  ${lit(s.itineraryTitle)}, ${lit(s.itineraryText)},\n` +
        `  ${lit(s.inclusionText)}, ${lit(s.consumesDay)}, false, ${lit(s.transferDirection)}, ${s.sortOrder}\n` +
        `)\non conflict (code) do nothing;`,
    );
  }

  return `${section(`Services (${services.length})`)}${parts.join('\n\n')}\n`;
}

function emitRates(services: readonly SeedService[]): string {
  const parts: string[] = [];

  for (const s of services) {
    if (s.rate === null) continue;
    const versionId = uuid5(`rate:${s.code}`);
    const draftGuard =
      `where exists (\n` +
      `  select 1 from public.service_rate_versions v\n` +
      `  where v.id = ${lit(versionId)} and v.status = 'draft'\n` +
      `)`;

    const lines: string[] = [];
    lines.push(`-- ${s.name}`);
    lines.push(
      `insert into public.service_rate_versions (\n` +
        `  id, service_id, currency, pricing_basis, status, valid_until\n` +
        `)\n` +
        `select ${lit(versionId)}, s.id, ${lit(s.rate.currency)}, ${lit(s.rate.pricingBasis)},\n` +
        `       'draft', ${lit(s.rate.validUntil)}\n` +
        `from public.services s where s.code = ${lit(s.code)}\n` +
        `on conflict (id) do nothing;`,
    );

    // Children may only be written while the version is still a draft, so a
    // re-run skips these entirely.
    for (const t of s.rate.tiers) {
      lines.push(
        `insert into public.service_rate_tiers (rate_version_id, pax_type, min_pax, max_pax, amount)\n` +
          `select ${lit(versionId)}, ${lit(t.paxType)}, ${t.minPax}, ${t.maxPax}, ${t.amount}\n` +
          draftGuard +
          `;`,
      );
    }

    s.rate.addons.forEach((a, index) => {
      lines.push(
        `insert into public.service_rate_addons (rate_version_id, name, amount, default_selected, sort_order)\n` +
          `select ${lit(versionId)}, ${lit(a.name)}, ${a.amount}, ${lit(a.defaultSelected)}, ${index + 1}\n` +
          draftGuard +
          `;`,
      );
    });

    lines.push(
      `update public.service_rate_versions set status = 'published'\n` +
        `where id = ${lit(versionId)} and status = 'draft';`,
    );

    parts.push(lines.join('\n'));
  }

  const priced = services.filter((s) => s.rate !== null).length;
  return `${section(`Rate versions (${priced} priced services)`)}${parts.join('\n\n')}\n`;
}

function emitFixed(): string {
  const parts: string[] = [];

  for (const fx of FIXED.fxRates) {
    parts.push(
      `insert into public.fx_rates (currency, php_per_unit)\n` +
        `select ${lit(fx.currency)}, ${fx.phpPerUnit}\n` +
        `where not exists (select 1 from public.fx_rates where currency = ${lit(fx.currency)});`,
    );
  }

  for (const m of FIXED.categoryMarkups) {
    parts.push(
      `insert into public.category_markups (pax_category, markup_type, value)\n` +
        `select ${lit(m.paxCategory)}, 'fixed', ${m.value}\n` +
        `where not exists (\n` +
        `  select 1 from public.category_markups where pax_category = ${lit(m.paxCategory)}\n` +
        `);`,
    );
  }

  for (const m of FIXED.serviceMarkups) {
    parts.push(
      `insert into public.service_markups (service_type, markup_type, value)\n` +
        `select ${lit(m.serviceType)}, 'fixed', ${m.value}\n` +
        `where not exists (\n` +
        `  select 1 from public.service_markups where service_type = ${lit(m.serviceType)}\n` +
        `);`,
    );
  }

  return `${section('FX rates and markups (append-only: inserted only when absent)')}${parts.join('\n\n')}\n`;
}

function emitSettings(settings: readonly SeedSetting[]): string {
  const parts = settings.map(
    (s) =>
      `insert into public.app_settings (key, value, description)\n` +
      `values (${lit(s.key)}, ${lit(JSON.stringify(s.value))}::jsonb, ${lit(s.description)})\n` +
      `on conflict (key) do nothing;`,
  );
  return `${section(`App settings (${settings.length})`)}${parts.join('\n\n')}\n`;
}

function emitContent(): string {
  const parts = FIXED.contentItems.map(
    (c) =>
      `insert into public.content_items (content_type, body, sort_order)\n` +
      `select ${lit(c.contentType)}, ${lit(c.body)}, ${c.sortOrder}\n` +
      `where not exists (\n` +
      `  select 1 from public.content_items\n` +
      `  where content_type = ${lit(c.contentType)} and body = ${lit(c.body)}\n` +
      `);`,
  );
  return `${section(`Content items (${FIXED.contentItems.length})`)}${parts.join('\n\n')}\n`;
}

function emitAgents(agents: readonly SeedAgent[]): string {
  const parts: string[] = [];

  for (const a of agents) {
    const issues = arrayLit(a.dataIssues, 'public.data_issue[]');

    if (a.email !== null) {
      parts.push(
        `insert into public.profiles (id, full_name, email, role, is_active, data_issues)\n` +
          `values (${lit(a.id)}, ${lit(a.fullName)}, ${lit(a.email)}, 'sales_agent', true, ${issues})\n` +
          `on conflict do nothing;`,
      );
    } else {
      parts.push(
        `insert into public.profiles (id, full_name, email, role, is_active, data_issues)\n` +
          `select ${lit(a.id)}, ${lit(a.fullName)}, null, 'sales_agent', true, ${issues}\n` +
          `where not exists (\n` +
          `  select 1 from public.profiles\n` +
          `  where email is null and lower(full_name) = lower(${lit(a.fullName)})\n` +
          `);`,
      );
    }

    if (a.badUrl !== null || a.greatUrl !== null) {
      parts.push(
        `insert into public.agent_survey_links (profile_id, bad_url, great_url)\n` +
          `select p.id, ${lit(a.badUrl)}, ${lit(a.greatUrl)}\n` +
          `from public.profiles p where p.id = ${lit(a.id)}\n` +
          `on conflict (profile_id) do nothing;`,
      );
    }
  }

  return `${section(`Agent profiles (${agents.length})`)}${parts.join('\n\n')}\n`;
}

export function buildSql(input: SeedInput): string {
  const header = [
    '-- =============================================================================',
    '-- EZQUOTE Japan - seed data',
    '--',
    '-- GENERATED FILE - do not edit. Rebuild with `npm run seed:build`.',
    '-- Idempotent: safe to run more than once. It inserts only what is missing and',
    '-- never overwrites edits made in the portal.',
    '-- =============================================================================',
    '',
  ].join('\n');

  const warnings =
    input.warnings.length === 0
      ? ''
      : `${input.warnings.map((w) => `-- WARNING: ${w}`).join('\n')}\n`;

  return [
    header,
    warnings,
    'begin;',
    emitCities(),
    emitHotels(input.hotels),
    emitServices(input.services),
    emitRates(input.services),
    emitFixed(),
    emitSettings(input.settings),
    emitContent(),
    emitAgents(input.agents),
    '\ncommit;\n',
  ].join('\n');
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""').replace(/\r?\n/g, ' ')}"`;
}

/** UTF-8 with a BOM so Excel opens it without mangling the accents and emoji. */
export function buildFixList(agents: readonly SeedAgent[]): { csv: string; rows: number } {
  const needsAttention = agents.filter((a) => a.dataIssues.length > 0 || a.notes.length > 0);
  const lines = [['Workbook rows', 'Name', 'Email', 'Issues', 'Details'].map(csvCell).join(',')];

  for (const a of needsAttention) {
    lines.push(
      [a.rows.join(' '), a.fullName, a.email ?? '', a.dataIssues.join(' '), a.notes.join(' | ')]
        .map(csvCell)
        .join(','),
    );
  }

  return { csv: `\uFEFF${lines.join('\r\n')}\r\n`, rows: needsAttention.length };
}

export { DEFAULT_SERVICE_CODES };
