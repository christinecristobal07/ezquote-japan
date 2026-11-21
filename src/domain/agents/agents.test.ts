import { describe, expect, it } from 'vitest';
import {
  checkSurveyLink,
  computeDataIssues,
  emailMatchesName,
  validateEmail,
  type LinkOwner,
} from './validation.ts';
import {
  decideInvite,
  summariseInvites,
  validateInviteRequest,
  MAX_INVITES_PER_CALL,
} from './invite.ts';
import { formatClosingBlock } from '../output/closingBlock.ts';

const SURVEY_BAD =
  'https://app.ratemyservice.io/org303765/submitsurvey/agent12997/VeryDissatisfied?surveyAnswerId=9712';
const SURVEY_GREAT =
  'https://app.ratemyservice.io/org303765/submitsurvey/agent12997/Satisfied?surveyAnswerId=9713';

// -----------------------------------------------------------------------------
describe('validateEmail', () => {
  it.each([
    ['clarenceocampo.gladex@gmail.com', 'clarenceocampo.gladex@gmail.com'],
    ['  Alessandrafamoso.Gladex@gmail.com  ', 'alessandrafamoso.gladex@gmail.com'],
    ['mailto:aira.gladex@gmail.com', 'aira.gladex@gmail.com'],
  ])('accepts %s', (input, expected) => {
    expect(validateEmail(input).email).toBe(expected);
  });

  it.each([
    ['lushrodriguez,gladex@gmail.com', 'a comma in the local part'],
    ['x.gladex.@gmail.com', 'a dot immediately before the @'],
    ['no-at-sign', 'no @ at all'],
    ['two@@gmail.com', 'a doubled @'],
  ])('rejects %s (%s)', (input) => {
    const result = validateEmail(input);
    expect(result.email).toBeNull();
    expect(result.note).toContain('not a valid address');
  });

  it('treats blank and null as simply absent, with no complaint', () => {
    expect(validateEmail('')).toEqual({ email: null, note: null });
    expect(validateEmail(null)).toEqual({ email: null, note: null });
    expect(validateEmail('   ')).toEqual({ email: null, note: null });
  });
});

// -----------------------------------------------------------------------------
describe('checkSurveyLink', () => {
  it('accepts a complete survey link for the matching rating', () => {
    expect(checkSurveyLink(SURVEY_BAD, 'bad')).toEqual({ kind: 'ok', url: SURVEY_BAD });
    expect(checkSurveyLink(SURVEY_GREAT, 'great')).toEqual({ kind: 'ok', url: SURVEY_GREAT });
  });

  it("rejects JHEAN's swapped links", () => {
    // Her Bad cell holds a Satisfied link and her Great cell a VeryDissatisfied one.
    const bad = checkSurveyLink(SURVEY_GREAT, 'bad');
    const great = checkSurveyLink(SURVEY_BAD, 'great');
    expect(bad.kind).toBe('invalid');
    expect(great.kind).toBe('invalid');
    if (bad.kind === 'invalid') expect(bad.reason).toContain('expected VeryDissatisfied');
    if (great.kind === 'invalid') expect(great.reason).toContain('expected Satisfied');
  });

  it("rejects JUSTINE's truncated link", () => {
    const truncated =
      'https://app.ratemyservice.io/org303765/submitsurvey/agent12873/VeryDissatisfied?surveyAnswerId';
    const verdict = checkSurveyLink(truncated, 'bad');
    expect(verdict.kind).toBe('invalid');
    if (verdict.kind === 'invalid') expect(verdict.reason).toContain('not a complete survey link');
  });

  it('flags the signature setup page as a placeholder, not an error', () => {
    expect(
      checkSurveyLink('https://app.ratemyservice.io/org303765/setup/signature', 'bad'),
    ).toEqual({ kind: 'placeholder' });
  });

  it('accepts short links whose slug agrees with the rating', () => {
    expect(checkSurveyLink('https://bit.ly/AIRA-BAD', 'bad').kind).toBe('ok');
    expect(checkSurveyLink('https://bit.ly/AIRA-OKAY', 'great').kind).toBe('ok');
    expect(checkSurveyLink('https://surl.li/qtkooy', 'bad').kind).toBe('ok');
  });

  it("rejects KEIR's keri_bad used as a Great link", () => {
    const verdict = checkSurveyLink('https://bit.ly/keri_bad', 'great');
    expect(verdict.kind).toBe('invalid');
    if (verdict.kind === 'invalid') expect(verdict.reason).toContain('looks like a Bad link');
  });

  it('rejects a good-looking slug used as a Bad link', () => {
    expect(checkSurveyLink('https://bit.ly/jazz-good', 'bad').kind).toBe('invalid');
  });

  it('rejects a missing link and an unknown host', () => {
    expect(checkSurveyLink(null, 'bad')).toEqual({
      kind: 'invalid',
      reason: 'no link in the cell',
    });
    expect(checkSurveyLink('https://example.com/x', 'bad').kind).toBe('invalid');
    expect(checkSurveyLink('not a url', 'bad').kind).toBe('invalid');
  });
});

// -----------------------------------------------------------------------------
describe('emailMatchesName', () => {
  it('matches a 3+ letter name part by its first four letters', () => {
    expect(emailMatchesName('ALBA', 'alvaroalba.gladex@gmail.com')).toBe(true);
    expect(emailMatchesName('Cindy', 'cindymontesclaros.gladex@gmail.com')).toBe(true);
  });

  it('matches a two-letter name whole, so JM claims jm.bustamante', () => {
    expect(emailMatchesName('JM', 'jm.bustamante.gladex@gmail.com')).toBe(true);
    expect(emailMatchesName('JEASHREE', 'jm.bustamante.gladex@gmail.com')).toBe(false);
  });

  it('does not match an unrelated owner', () => {
    expect(emailMatchesName('EDMAR', 'jemiecamaemagno.gladex@gmail.com')).toBe(false);
    expect(emailMatchesName('ELIZE', 'shaynabdon@gmail.com')).toBe(false);
  });
});

// -----------------------------------------------------------------------------
describe('computeDataIssues', () => {
  const profile = { profileId: 'p1', fullName: 'Aira', email: 'aira.gladex@gmail.com' };

  it('is clean when the email and both links are fine', () => {
    const result = computeDataIssues(profile, { badUrl: SURVEY_BAD, greatUrl: SURVEY_GREAT });
    expect(result.issues).toEqual([]);
    expect(result.rejected).toEqual({ bad: false, great: false });
  });

  it('reports a missing email', () => {
    const result = computeDataIssues({ ...profile, email: null }, { badUrl: null, greatUrl: null });
    expect(result.issues).toContain('needs_email');
  });

  it('reports a placeholder once, not per link', () => {
    const setup = 'https://app.ratemyservice.io/org303765/setup/signature';
    const result = computeDataIssues(profile, { badUrl: setup, greatUrl: setup });
    expect(result.issues.filter((issue) => issue === 'placeholder_link')).toHaveLength(1);
  });

  it('rejects both links when they are the same URL', () => {
    const result = computeDataIssues(profile, { badUrl: SURVEY_BAD, greatUrl: SURVEY_BAD });
    // The Great cell holding a VeryDissatisfied link is already wrong.
    expect(result.issues).toContain('invalid_great_link');
    expect(result.rejected.great).toBe(true);
  });

  it('names the other agent when a link is shared', () => {
    const owners: LinkOwner[] = [
      { profileId: 'p2', fullName: 'Amalia', badUrl: SURVEY_BAD, greatUrl: null },
    ];
    const result = computeDataIssues(profile, { badUrl: SURVEY_BAD, greatUrl: null }, owners);
    expect(result.issues).toContain('invalid_bad_link');
    expect(result.notes.join(' ')).toContain('Amalia');
    expect(result.rejected.bad).toBe(true);
  });

  it('does not flag a profile for its own link', () => {
    const owners: LinkOwner[] = [
      { profileId: 'p1', fullName: 'Aira', badUrl: SURVEY_BAD, greatUrl: SURVEY_GREAT },
    ];
    const result = computeDataIssues(
      profile,
      { badUrl: SURVEY_BAD, greatUrl: SURVEY_GREAT },
      owners,
    );
    expect(result.issues).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
describe('decideInvite', () => {
  const base = {
    profileId: 'p1',
    fullName: 'Aira',
    email: 'aira.gladex@gmail.com',
    isActive: true,
    authUserExists: false,
    emailConfirmed: false,
  };

  it('invites a fresh, active profile with an email', () => {
    expect(decideInvite(base).kind).toBe('invite');
  });

  it('skips a profile with no email', () => {
    const action = decideInvite({ ...base, email: null });
    expect(action.kind).toBe('skip');
    if (action.kind === 'skip') expect(action.reason).toContain('No email');
  });

  it('skips an inactive profile', () => {
    expect(decideInvite({ ...base, isActive: false }).kind).toBe('skip');
  });

  it('skips someone who already has a working login', () => {
    const action = decideInvite({ ...base, authUserExists: true, emailConfirmed: true });
    expect(action.kind).toBe('skip');
    if (action.kind === 'skip') expect(action.reason).toContain('already has a working login');
  });

  it('resends to an unconfirmed existing user', () => {
    expect(decideInvite({ ...base, authUserExists: true, emailConfirmed: false }).kind).toBe(
      'resend',
    );
  });
});

describe('validateInviteRequest', () => {
  const id = '11111111-1111-4111-8111-111111111111';

  it('accepts a list of UUIDs and removes duplicates', () => {
    const result = validateInviteRequest({ profileIds: [id, id] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.profileIds).toEqual([id]);
  });

  it.each([
    [{}, 'profileIds must be an array.'],
    [{ profileIds: [] }, 'Select at least one agent.'],
    [{ profileIds: ['nope'] }, 'Every profileId must be a UUID.'],
    [null, 'Expected a JSON object.'],
  ])('rejects %j', (body, message) => {
    const result = validateInviteRequest(body);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe(message);
  });

  it('caps the batch size', () => {
    const ids = Array.from({ length: MAX_INVITES_PER_CALL + 1 }, () => id);
    const result = validateInviteRequest({ profileIds: ids });
    // Duplicates are only collapsed after the size check, so this still fails.
    expect(result.ok).toBe(false);
  });
});

describe('summariseInvites', () => {
  it('counts each outcome', () => {
    expect(
      summariseInvites([
        { profileId: 'a', status: 'invited', message: '' },
        { profileId: 'b', status: 'resent', message: '' },
        { profileId: 'c', status: 'skipped', message: '' },
        { profileId: 'd', status: 'error', message: '' },
        { profileId: 'e', status: 'invited', message: '' },
      ]),
    ).toEqual({ invited: 2, resent: 1, skipped: 1, errors: 1 });
  });
});

// -----------------------------------------------------------------------------
describe('formatClosingBlock', () => {
  it('renders the BRD 9.1 shape with both links', () => {
    expect(
      formatClosingBlock({ agentName: 'Aira', badUrl: SURVEY_BAD, greatUrl: SURVEY_GREAT }),
    ).toBe(
      `Hi my name is Aira, thank you for letting me assist you!\n\nRATE MY SERVICE\nBad ${SURVEY_BAD}\nGreat ${SURVEY_GREAT}`,
    );
  });

  it('leaves out a link that is missing', () => {
    const text = formatClosingBlock({ agentName: 'Aira', badUrl: null, greatUrl: SURVEY_GREAT });
    expect(text).toContain('Great ');
    expect(text).not.toContain('Bad ');
  });

  it('drops the heading entirely when there are no links', () => {
    expect(formatClosingBlock({ agentName: 'Aira', badUrl: null, greatUrl: null })).toBe(
      'Hi my name is Aira, thank you for letting me assist you!',
    );
  });
});
