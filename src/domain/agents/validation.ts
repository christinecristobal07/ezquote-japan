/**
 * The single source for agent email and Rate My Service link rules.
 *
 * The seed generator and the portal both import this. If they ever disagreed,
 * the fix list produced from the workbook would stop matching what a manager
 * sees on screen, and nobody would know which one was right.
 */

export type Rating = 'bad' | 'great';

export type DataIssue =
  'needs_email' | 'invalid_bad_link' | 'invalid_great_link' | 'placeholder_link';

/** Strict enough to reject "lush,gladex@gmail.com" and "x.gladex.@gmail.com". */
export const EMAIL_PATTERN =
  /^[a-z0-9]+(?:[._%+-][a-z0-9]+)*@[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/;

/**
 * The `=\d+` is required on purpose. Across the source workbook the answer id
 * is uniform (VeryDissatisfied=9712, Satisfied=9713) and exactly one link was
 * truncated to a bare `?surveyAnswerId`. Without the id the survey records
 * nothing, so it is rejected and reported rather than stored or silently
 * repaired.
 */
export const SURVEY_PATTERN =
  /\/org\d+\/submitsurvey\/agent\d+\/(Satisfied|VeryDissatisfied)\?surveyAnswerId=\d+/;

const SHORTENERS = /^(?:bit\.ly|surl\.li)$/i;

export interface EmailResult {
  readonly email: string | null;
  /** Set when something was supplied but rejected. */
  readonly note: string | null;
}

/** Cleans and validates an address. A rejected one yields null plus a reason. */
export function validateEmail(raw: string | null | undefined): EmailResult {
  const candidate = (raw ?? '')
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

export type LinkVerdict =
  | { readonly kind: 'ok'; readonly url: string }
  | { readonly kind: 'placeholder' }
  | { readonly kind: 'invalid'; readonly reason: string };

/** Classifies one survey link for the rating it is meant to carry. */
export function checkSurveyLink(url: string | null, rating: Rating): LinkVerdict {
  if (url === null || url.trim() === '') {
    return { kind: 'invalid', reason: 'no link in the cell' };
  }
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
export function emailMatchesName(name: string, email: string): boolean {
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  const parts = name
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((part) => part.length >= 2);

  return parts.some((part) =>
    part.length >= 3 ? local.includes(part.slice(0, 4)) : local.includes(part),
  );
}

export interface ProfileLinks {
  readonly badUrl: string | null;
  readonly greatUrl: string | null;
}

export interface LinkOwner extends ProfileLinks {
  readonly profileId: string;
  readonly fullName: string;
}

export interface DataIssuesResult {
  readonly issues: readonly DataIssue[];
  /** One human-readable line per problem, for the fix list and the editor. */
  readonly notes: readonly string[];
  /** Links that must not be stored, keyed by rating. */
  readonly rejected: { readonly bad: boolean; readonly great: boolean };
}

export interface ProfileForIssues {
  readonly profileId: string;
  readonly fullName: string;
  readonly email: string | null;
}

/**
 * Works out a profile's data_issues from its email and links.
 *
 * `allOwners` lets it spot a link shared with somebody else — an agent must
 * never carry another agent's survey link, because the rating would land on
 * the wrong person.
 */
export function computeDataIssues(
  profile: ProfileForIssues,
  links: ProfileLinks,
  allOwners: readonly LinkOwner[] = [],
): DataIssuesResult {
  const issues: DataIssue[] = [];
  const notes: string[] = [];
  let badRejected = false;
  let greatRejected = false;

  if (profile.email === null || profile.email.trim() === '') {
    issues.push('needs_email');
    notes.push('No email address, so this agent cannot be invited.');
  }

  const bad = checkSurveyLink(links.badUrl, 'bad');
  const great = checkSurveyLink(links.greatUrl, 'great');
  let placeholder = false;

  if (bad.kind === 'placeholder') placeholder = true;
  else if (bad.kind === 'invalid') {
    issues.push('invalid_bad_link');
    notes.push(`Bad link: ${bad.reason}.`);
    badRejected = true;
  }

  if (great.kind === 'placeholder') placeholder = true;
  else if (great.kind === 'invalid') {
    issues.push('invalid_great_link');
    notes.push(`Great link: ${great.reason}.`);
    greatRejected = true;
  }

  if (placeholder) {
    issues.push('placeholder_link');
    notes.push('Link is the Rate My Service signature setup page, not a survey link.');
  }

  // The same URL cannot serve as both ratings.
  if (
    bad.kind === 'ok' &&
    great.kind === 'ok' &&
    bad.url === great.url &&
    !badRejected &&
    !greatRejected
  ) {
    notes.push('The Bad and Great links are the same URL; both removed.');
    if (!issues.includes('invalid_bad_link')) issues.push('invalid_bad_link');
    if (!issues.includes('invalid_great_link')) issues.push('invalid_great_link');
    badRejected = true;
    greatRejected = true;
  }

  // A link belonging to somebody else.
  for (const [rating, verdict] of [
    ['bad', bad],
    ['great', great],
  ] as const) {
    if (verdict.kind !== 'ok') continue;
    const others = allOwners.filter(
      (owner) =>
        owner.profileId !== profile.profileId &&
        (owner.badUrl === verdict.url || owner.greatUrl === verdict.url),
    );
    if (others.length === 0) continue;

    const issue: DataIssue = rating === 'bad' ? 'invalid_bad_link' : 'invalid_great_link';
    if (!issues.includes(issue)) issues.push(issue);
    notes.push(
      `The ${rating === 'bad' ? 'Bad' : 'Great'} link is also used by ` +
        `${others.map((owner) => owner.fullName).join(', ')}; it must belong to one agent only.`,
    );
    if (rating === 'bad') badRejected = true;
    else greatRejected = true;
  }

  return { issues, notes, rejected: { bad: badRejected, great: greatRejected } };
}
