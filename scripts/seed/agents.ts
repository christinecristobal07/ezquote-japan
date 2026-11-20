import type { Workbook } from 'exceljs';
import { at, fail, hyperlink, sheet, text } from './workbook.ts';
import { uuid5 } from './sql.ts';
import type { DataIssue, SeedAgent } from './types.ts';

/** Strict enough to reject "lush,gladex@gmail.com" and "x.gladex.@gmail.com". */
const EMAIL_PATTERN = /^[a-z0-9]+(?:[._%+-][a-z0-9]+)*@[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/;

/**
 * The `=\d+` is required on purpose. Across the whole sheet the answer id is
 * uniform (VeryDissatisfied=9712, Satisfied=9713, 75 of each) and exactly one
 * link is truncated to a bare `?surveyAnswerId` — JUSTINE's Bad link. Without
 * the id the survey records nothing, so it is rejected and reported in the fix
 * list rather than stored or silently repaired. This is why the expected count
 * is 13 invalid bad links, not 12.
 */
const SURVEY_PATTERN =
  /\/org\d+\/submitsurvey\/agent\d+\/(Satisfied|VeryDissatisfied)\?surveyAnswerId=\d+/;

const SHORTENERS = /^(?:bit\.ly|surl\.li)$/i;

type Rating = 'bad' | 'great';

interface RawRow {
  readonly row: number;
  readonly name: string;
  readonly email: string | null;
  readonly emailNote: string | null;
  readonly badUrl: string | null;
  readonly greatUrl: string | null;
}

function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function readEmail(
  raw: string,
  link: string | null,
): { email: string | null; note: string | null } {
  const source = raw.trim() === '' ? (link ?? '') : raw;
  const candidate = source
    .replace(/\s+/g, '')
    .replace(/^mailto:/i, '')
    .toLowerCase();
  if (candidate === '') return { email: null, note: null };
  if (!EMAIL_PATTERN.test(candidate)) {
    return {
      email: null,
      note: `Email "${candidate}" is not a valid address; imported without it.`,
    };
  }
  return { email: candidate, note: null };
}

/** First https URL in the cell, with trailing punctuation removed. */
function firstUrl(raw: string, link: string | null): string | null {
  const match = /https:\/\/[^\s"'<>]+/i.exec(raw);
  const url = match?.[0] ?? (link !== null && /^https:/i.test(link) ? link : null);
  if (url === null) return null;
  return url.replace(/[.,;:!?)\]]+$/, '');
}

type LinkVerdict =
  | { readonly kind: 'ok'; readonly url: string }
  | { readonly kind: 'placeholder' }
  | { readonly kind: 'invalid'; readonly reason: string };

function classify(url: string | null, rating: Rating): LinkVerdict {
  if (url === null) return { kind: 'invalid', reason: 'no link in the cell' };
  if (/\/setup\/signature/i.test(url)) return { kind: 'placeholder' };

  let host: string;
  let path: string;
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    path = parsed.pathname;
  } catch {
    return { kind: 'invalid', reason: `"${url}" is not a usable URL` };
  }

  if (SHORTENERS.test(host)) {
    const slug = path.split('/').filter(Boolean).pop() ?? '';
    const saysBad = /bad|dissatisf/i.test(slug);
    const saysGood = /good|great|okay|satisf/i.test(slug);
    if (rating === 'great' && saysBad && !saysGood) {
      return { kind: 'invalid', reason: `short link "${slug}" looks like a Bad link` };
    }
    if (rating === 'bad' && saysGood && !saysBad) {
      return { kind: 'invalid', reason: `short link "${slug}" looks like a Great link` };
    }
    return { kind: 'ok', url };
  }

  if (/ratemyservice\.io$/i.test(host)) {
    const match = SURVEY_PATTERN.exec(url);
    if (!match) return { kind: 'invalid', reason: `"${url}" is not a complete survey link` };
    const wanted = rating === 'bad' ? 'VeryDissatisfied' : 'Satisfied';
    if (match[1] !== wanted) {
      return { kind: 'invalid', reason: `survey link is ${match[1] ?? '?'}, expected ${wanted}` };
    }
    return { kind: 'ok', url };
  }

  return { kind: 'invalid', reason: `unrecognised link host "${host}"` };
}

/**
 * Decides whether a name owns an email. A name part of 3+ letters counts when
 * its first 4 letters appear in the local part; short names such as "JM" are
 * matched whole, so "JM" still claims jm.bustamante@…
 */
function nameMatchesEmail(name: string, email: string): boolean {
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  const parts = name
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((part) => part.length >= 2);

  return parts.some((part) =>
    part.length >= 3 ? local.includes(part.slice(0, 4)) : local.includes(part),
  );
}

export interface AgentsResult {
  readonly agents: SeedAgent[];
  readonly rowCount: number;
  readonly mergedCount: number;
}

export function readAgents(wb: Workbook): AgentsResult {
  const ws = sheet(wb, 'RATEMYSERVICE ');

  // Read the bound once: getCell() creates missing rows, so testing against a
  // live ws.rowCount inside the loop never terminates.
  const lastRow = ws.rowCount;
  const rows: RawRow[] = [];
  for (let row = 2; row <= lastRow; row += 1) {
    const name = cleanName(text(at(ws, `A${row}`)));
    if (name === '') continue;

    const emailCell = at(ws, `B${row}`);
    const { email, note } = readEmail(text(emailCell), hyperlink(emailCell));
    const badCell = at(ws, `C${row}`);
    const greatCell = at(ws, `D${row}`);

    rows.push({
      row,
      name,
      email,
      emailNote: note,
      badUrl: firstUrl(text(badCell), hyperlink(badCell)),
      greatUrl: firstUrl(text(greatCell), hyperlink(greatCell)),
    });
  }

  if (rows.length === 0) fail('Sheet "RATEMYSERVICE " has no agent rows.');

  // ---------------------------------------------------------------------------
  // Resolve who keeps each shared email.
  // ---------------------------------------------------------------------------
  const byEmail = new Map<string, RawRow[]>();
  for (const row of rows) {
    if (row.email === null) continue;
    const bucket = byEmail.get(row.email) ?? [];
    bucket.push(row);
    byEmail.set(row.email, bucket);
  }

  /** row index -> the email it ends up with (null = lost it). */
  const keptEmail = new Map<number, string | null>();
  /** row index -> groups of rows merged into it. */
  const mergeGroups: RawRow[][] = [];
  const extraNotes = new Map<number, string>();

  for (const [email, bucket] of byEmail) {
    const distinctNames = new Set(bucket.map((r) => r.name.toLowerCase()));

    if (distinctNames.size === 1) {
      // Same person listed twice: merge.
      mergeGroups.push(bucket);
      for (const r of bucket) keptEmail.set(r.row, email);
      continue;
    }

    const matching = bucket.filter((r) => nameMatchesEmail(r.name, email));
    const winner = matching.length === 1 ? matching[0] : undefined;

    for (const r of bucket) {
      if (winner?.row === r.row) {
        keptEmail.set(r.row, email);
        continue;
      }
      keptEmail.set(r.row, null);
      extraNotes.set(
        r.row,
        winner
          ? `Shared the email ${email} with ${winner.name}, who matches it. Imported without an email.`
          : `The email ${email} is claimed by ${bucket.length} rows (${bucket
              .map((x) => x.name)
              .join(', ')}) and matches none of them clearly. All imported without it.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Build one agent per person.
  // ---------------------------------------------------------------------------
  const agents: SeedAgent[] = [];
  const handled = new Set<number>();
  const noEmailNames = new Map<string, number>();
  let mergedCount = 0;

  const makeAgent = (group: RawRow[], email: string | null): SeedAgent => {
    const first = group[0];
    if (!first) fail('Internal error: empty agent group.');
    const issues: DataIssue[] = [];
    const notes: string[] = [];

    for (const r of group) {
      if (r.emailNote !== null) notes.push(`Row ${r.row}: ${r.emailNote}`);
      const extra = extraNotes.get(r.row);
      if (extra !== undefined) notes.push(`Row ${r.row}: ${extra}`);
    }

    if (email === null) issues.push('needs_email');

    // Links come from the first row in the group that supplies one.
    const badRaw = group.find((r) => r.badUrl !== null)?.badUrl ?? null;
    const greatRaw = group.find((r) => r.greatUrl !== null)?.greatUrl ?? null;

    const bad = classify(badRaw, 'bad');
    const great = classify(greatRaw, 'great');

    let badUrl: string | null = null;
    let greatUrl: string | null = null;
    let placeholder = false;

    if (bad.kind === 'ok') badUrl = bad.url;
    else if (bad.kind === 'placeholder') placeholder = true;
    else {
      issues.push('invalid_bad_link');
      notes.push(`Bad link: ${bad.reason}.`);
    }

    if (great.kind === 'ok') greatUrl = great.url;
    else if (great.kind === 'placeholder') placeholder = true;
    else {
      issues.push('invalid_great_link');
      notes.push(`Great link: ${great.reason}.`);
    }

    if (placeholder) {
      issues.push('placeholder_link');
      notes.push('Link is the Rate My Service signature setup page, not a survey link.');
    }

    // The same URL cannot serve as both ratings.
    if (badUrl !== null && greatUrl !== null && badUrl === greatUrl) {
      notes.push('The Bad and Great cells hold the same URL; both removed.');
      if (!issues.includes('invalid_bad_link')) issues.push('invalid_bad_link');
      if (!issues.includes('invalid_great_link')) issues.push('invalid_great_link');
      badUrl = null;
      greatUrl = null;
    }

    return {
      id: uuid5(email ?? `name:${first.name.toLowerCase()}`),
      fullName: first.name,
      email,
      dataIssues: issues,
      badUrl,
      greatUrl,
      notes,
      rows: group.map((r) => r.row),
    };
  };

  for (const group of mergeGroups) {
    const email = group[0]?.email ?? null;
    if (group.length > 1) mergedCount += group.length - 1;
    for (const r of group) handled.add(r.row);
    const agent = makeAgent(group, email);
    if (group.length > 1) {
      agent.notes.push(`Merged from workbook rows ${group.map((r) => r.row).join(', ')}.`);
    }
    agents.push(agent);
  }

  for (const row of rows) {
    if (handled.has(row.row)) continue;
    const email = row.email === null ? null : (keptEmail.get(row.row) ?? null);

    if (email === null) {
      const key = row.name.toLowerCase();
      const seen = noEmailNames.get(key);
      if (seen !== undefined) {
        fail(
          `Two agents without an email share the name "${row.name}" (rows ${seen} and ${row.row}). ` +
            `Resolve this in the workbook before seeding.`,
        );
      }
      noEmailNames.set(key, row.row);
    }

    handled.add(row.row);
    agents.push(makeAgent([row], email));
  }

  // ---------------------------------------------------------------------------
  // No agent may carry another agent's link.
  // ---------------------------------------------------------------------------
  for (const rating of ['bad', 'great'] as const) {
    const field = rating === 'bad' ? 'badUrl' : 'greatUrl';
    const owners = new Map<string, SeedAgent[]>();
    for (const agent of agents) {
      const url = agent[field];
      if (url === null) continue;
      const bucket = owners.get(url) ?? [];
      bucket.push(agent);
      owners.set(url, bucket);
    }
    for (const [url, sharers] of owners) {
      if (sharers.length < 2) continue;
      const issue: DataIssue = rating === 'bad' ? 'invalid_bad_link' : 'invalid_great_link';
      for (const agent of sharers) {
        const others = sharers.filter((a) => a !== agent).map((a) => a.fullName);
        agent[field] = null;
        if (!agent.dataIssues.includes(issue)) agent.dataIssues.push(issue);
        agent.notes.push(
          `The ${rating === 'bad' ? 'Bad' : 'Great'} link ${url} is also used by ` +
            `${others.join(', ')}; removed from everyone.`,
        );
      }
    }
  }

  return { agents, rowCount: rows.length, mergedCount };
}
