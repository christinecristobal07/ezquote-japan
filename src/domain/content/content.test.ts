import { describe, expect, it } from 'vitest';
import { isValidCode, normalizeMultiline, slugifyCode } from './text.ts';
import {
  formatContentLine,
  isLive,
  liveState,
  manilaToday,
  prefixFor,
} from '../output/sectionFormat.ts';
import { groupHotelsForOutput } from '../output/hotelGroups.ts';

// -----------------------------------------------------------------------------
describe('normalizeMultiline', () => {
  it('converts CRLF and lone CR to LF', () => {
    expect(normalizeMultiline('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('trims trailing spaces and tabs per line', () => {
    expect(normalizeMultiline('a   \nb\t\nc')).toBe('a\nb\nc');
  });

  it('trims leading and trailing blank lines but keeps interior ones', () => {
    expect(normalizeMultiline('\n\nfirst\n\nsecond\n\n')).toBe('first\n\nsecond');
  });

  it('leaves plain text untouched', () => {
    expect(normalizeMultiline('Explore Mt Fuji')).toBe('Explore Mt Fuji');
  });

  it('never alters emoji, including variation selectors and ZWJ sequences', () => {
    const body = '🏨Hotel Pickup 7:00am\n🗻Chureito Pagoda\n⛩️Hakone shrine\n👨‍👩‍👧‍👦 Family';
    const result = normalizeMultiline(body);
    expect(result).toBe(body);
    // ⛩️ is U+26E9 followed by U+FE0F; the selector must survive.
    expect(result).toContain('⛩️');
    expect(result).toContain('‍'); // the ZWJ in the family emoji
    expect(Array.from(result).length).toBe(Array.from(body).length);
  });

  it('keeps emoji when trailing whitespace is stripped around them', () => {
    expect(normalizeMultiline('🗻Oishi Park   \n🗻Mt. Fuji  ')).toBe('🗻Oishi Park\n🗻Mt. Fuji');
  });
});

// -----------------------------------------------------------------------------
describe('slugifyCode', () => {
  it.each([
    ['Mt Fuji Tour', 'mt_fuji_tour'],
    ['Kyoto & Nara Tour', 'kyoto_nara_tour'],
    ['Airport Transfer (Kansai / Narita / Haneda)', 'airport_transfer_kansai_narita_haneda'],
    ['  Spaced  Out  ', 'spaced_out'],
    ['UPPER case', 'upper_case'],
    ['already_fine', 'already_fine'],
    ['Disney Transfer 2026', 'disney_transfer_2026'],
  ])('%s -> %s', (input, expected) => {
    expect(slugifyCode(input)).toBe(expected);
  });

  it('strips accents rather than dropping the letter', () => {
    expect(slugifyCode('Kyōto Tour')).toBe('kyoto_tour');
  });

  it('falls back to a usable code when nothing survives', () => {
    expect(slugifyCode('!!!')).toBe('item');
    expect(slugifyCode('')).toBe('item');
  });

  it('always produces a code the database will accept', () => {
    for (const name of ['Mt Fuji Tour', 'Kyōto & Nara', '!!!', '  ', 'A-B-C']) {
      expect(isValidCode(slugifyCode(name))).toBe(true);
    }
  });
});

// -----------------------------------------------------------------------------
describe('formatContentLine', () => {
  it.each([
    ['inclusion', '✅ '],
    ['exclusion', '👉 '],
    ['requirement', '👉 '],
    ['remark', '- '],
    ['note', 'Note: '],
  ] as const)('prefixes %s with %j', (type, prefix) => {
    expect(prefixFor(type)).toBe(prefix);
    expect(formatContentLine(type, 'Body').text).toBe(`${prefix}Body`);
  });

  it.each([
    'announcement',
    'availability_reminder',
    'booking_disclaimer',
    'personal_transactions',
  ] as const)('leaves %s unprefixed', (type) => {
    expect(formatContentLine(type, 'Body').text).toBe('Body');
  });

  it('replaces the duration token', () => {
    const line = formatContentLine('inclusion', '{{duration}} Hotel Accommodation', {
      duration: '3D2N',
    });
    expect(line.text).toBe('✅ 3D2N Hotel Accommodation');
    expect(line.unknownTokens).toEqual([]);
  });

  it('tolerates spaces inside the braces', () => {
    expect(formatContentLine('note', '{{ duration }} stay', { duration: '5D4N' }).text).toBe(
      'Note: 5D4N stay',
    );
  });

  it('leaves an unknown token visible and reports it', () => {
    const line = formatContentLine('inclusion', '{{duration}} in {{city}}', { duration: '3D2N' });
    expect(line.text).toBe('✅ 3D2N in {{city}}');
    expect(line.unknownTokens).toEqual(['city']);
  });

  it('reports each unknown token once', () => {
    const line = formatContentLine('remark', '{{a}} {{a}} {{b}}');
    expect(line.unknownTokens).toEqual(['a', 'b']);
  });

  it('keeps emoji in the body', () => {
    expect(formatContentLine('remark', '🗻 Mt Fuji').text).toBe('- 🗻 Mt Fuji');
  });
});

// -----------------------------------------------------------------------------
describe('isLive / liveState', () => {
  const today = '2026-11-21';

  it('is live with no window at all', () => {
    expect(isLive({ isActive: true }, today)).toBe(true);
    expect(liveState({ isActive: true }, today)).toBe('Live');
  });

  it('is never live when inactive, whatever the window says', () => {
    expect(isLive({ isActive: false, startsOn: '2026-01-01', endsOn: '2027-01-01' }, today)).toBe(
      false,
    );
    expect(liveState({ isActive: false }, today)).toBe('Inactive');
  });

  it('is scheduled before the start date', () => {
    expect(isLive({ isActive: true, startsOn: '2026-12-01' }, today)).toBe(false);
    expect(liveState({ isActive: true, startsOn: '2026-12-01' }, today)).toBe('Scheduled');
  });

  it('is expired after the end date', () => {
    expect(isLive({ isActive: true, endsOn: '2026-11-20' }, today)).toBe(false);
    expect(liveState({ isActive: true, endsOn: '2026-11-20' }, today)).toBe('Expired');
  });

  it('includes both boundary days', () => {
    expect(isLive({ isActive: true, startsOn: today, endsOn: today }, today)).toBe(true);
  });

  it('treats null and undefined as no limit', () => {
    expect(isLive({ isActive: true, startsOn: null, endsOn: null }, today)).toBe(true);
    expect(isLive({ isActive: true }, today)).toBe(true);
  });

  it('gives today in Manila as YYYY-MM-DD', () => {
    // 15:00 UTC is already the next day in Manila (UTC+8).
    expect(manilaToday(new Date('2026-11-20T17:00:00Z'))).toBe('2026-11-21');
    expect(manilaToday(new Date('2026-11-20T10:00:00Z'))).toBe('2026-11-20');
  });
});

// -----------------------------------------------------------------------------
describe('groupHotelsForOutput', () => {
  const hotels = [
    { name: 'Hotel Gracery Shinjuku', starRating: 5 },
    { name: 'Comfort Hotel Osaka Shinsaibashi', starRating: 3 },
    { name: 'Holiday Inn Osaka Namba', starRating: 3 },
    { name: 'Hotel Mystays Tokyo Bay', starRating: 4 },
  ];

  it('groups by star rating, lowest first', () => {
    expect(groupHotelsForOutput(hotels).map((group) => group.starRating)).toEqual([3, 4, 5]);
  });

  it('renders the BRD 9.1 line', () => {
    const three = groupHotelsForOutput(hotels)[0];
    expect(three?.heading).toBe('HOTEL CATEGORY: 3 STAR');
    expect(three?.line).toBe(
      'HOTEL CATEGORY: 3 STAR\nComfort Hotel Osaka Shinsaibashi / Holiday Inn Osaka Namba, or similar',
    );
  });

  it('keeps the input order within a rating', () => {
    expect(groupHotelsForOutput(hotels)[0]?.names).toEqual([
      'Comfort Hotel Osaka Shinsaibashi',
      'Holiday Inn Osaka Namba',
    ]);
  });

  it('leaves inactive hotels out', () => {
    const withInactive = [...hotels, { name: 'Closed Inn', starRating: 3, isActive: false }];
    expect(groupHotelsForOutput(withInactive)[0]?.names).not.toContain('Closed Inn');
  });

  it('handles a single hotel and an empty list', () => {
    expect(groupHotelsForOutput([{ name: 'Solo Inn', starRating: 4 }])[0]?.line).toBe(
      'HOTEL CATEGORY: 4 STAR\nSolo Inn, or similar',
    );
    expect(groupHotelsForOutput([])).toEqual([]);
  });
});
