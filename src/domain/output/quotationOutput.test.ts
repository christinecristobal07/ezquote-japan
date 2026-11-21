import { describe, expect, it } from 'vitest';
import {
  buildQuotationModel,
  outputFingerprint,
  renderQuotation,
  toClipboardHtml,
} from './quotationOutput.ts';
import { brdModelInput, SNAPSHOT, THREE_STAR_HOTELS } from './__fixtures__/brd91.ts';
import { parseSnapshot } from '../snapshot.ts';
import { snapshotJson, AIRPORT_ID, MT_FUJI_ID } from '../__fixtures__/snapshot.ts';
import { toEngineInput } from '../quotation/toEngineInput.ts';
// Loaded with Vite's ?raw so the fixture stays byte-for-byte, LF and all.
import EXPECTED from './__fixtures__/brd91.expected.txt?raw';

// -----------------------------------------------------------------------------
describe('GOLDEN: the BRD 9.1 sample', () => {
  it('renders byte-for-byte', () => {
    const model = buildQuotationModel(brdModelInput());
    expect(renderQuotation(model, 'full')).toBe(EXPECTED);
  });

  it('carries the Step 5 golden rates', () => {
    const text = renderQuotation(buildQuotationModel(brdModelInput()), 'full');
    expect(text).toContain('QUAD SHARE: PHP 19,099 per pax');
    expect(text).toContain('TWIN SHARE: PHP 20,299 per pax');
    expect(text).toContain('SOLO: PHP 27,099 per pax');
  });

  it('uses LF endings, no trailing spaces and no trailing blank line', () => {
    const text = renderQuotation(buildQuotationModel(brdModelInput()), 'full');
    expect(text).not.toContain('\r');
    expect(text).not.toMatch(/[ \t]\n/);
    expect(text.endsWith('\n')).toBe(false);
  });

  it('keeps every emoji intact, variation selector included', () => {
    const text = renderQuotation(buildQuotationModel(brdModelInput()), 'full');
    for (const glyph of ['\u{1F5FB}', '⛩️', '✅', '❌', '\u{1F614}', '\u{1F929}']) {
      expect(text).toContain(glyph);
    }
  });

  it('lists all five 3-star hotels when none were picked', () => {
    const text = renderQuotation(buildQuotationModel(brdModelInput()), 'full');
    expect(text).toContain('HOTEL CATEGORY: 3 STAR');
    for (const hotel of THREE_STAR_HOTELS) expect(text).toContain(hotel.name);
    expect(text).toContain(', or similar');
  });

  it("keeps the agent's own order when hotels were picked", () => {
    const text = renderQuotation(
      buildQuotationModel(
        brdModelInput({
          selectedHotels: [
            { name: 'Crystal Hotel Namba', starRating: 3 },
            { name: 'Holiday Inn Osaka Namba', starRating: 3 },
          ],
        }),
      ),
      'full',
    );
    expect(text).toContain('Crystal Hotel Namba / Holiday Inn Osaka Namba, or similar');
  });
});

// -----------------------------------------------------------------------------
describe('part renderers', () => {
  const model = buildQuotationModel(brdModelInput());

  it('rates = title, validity and the rate lines only', () => {
    const text = renderQuotation(model, 'rates');
    expect(text).toContain('3D2N JPN LAND ARRANGEMENT PACKAGE');
    expect(text).toContain('QUAD SHARE: PHP 19,099 per pax');
    expect(text).not.toContain('INCLUSION:');
    expect(text).not.toContain('Itinerary:');
  });

  it('itinerary = the Itinerary section only', () => {
    const text = renderQuotation(model, 'itinerary');
    expect(text.startsWith('Itinerary:')).toBe(true);
    expect(text).toContain('DAY 2: Explore Mt Fuji tours');
    expect(text).not.toContain('QUAD SHARE');
  });

  it('inclusionsExclusions = both sections only', () => {
    const text = renderQuotation(model, 'inclusionsExclusions');
    expect(text.startsWith('INCLUSION:')).toBe(true);
    expect(text).toContain('❌ EXCLUSION:');
    expect(text).not.toContain('REMARKS');
  });
});

// -----------------------------------------------------------------------------
describe('sections that disappear', () => {
  it('omits a section header when it has no lines', () => {
    const text = renderQuotation(
      buildQuotationModel(
        brdModelInput({
          content: brdModelInput().content.filter((c) => c.contentType !== 'remark'),
        }),
      ),
      'full',
    );
    expect(text).not.toContain('REMARKS');
  });

  it('hides the booking disclaimer once confirmed', () => {
    const base = renderQuotation(buildQuotationModel(brdModelInput()), 'full');
    expect(base).toContain('Nothing booked yet.');

    const confirmed = renderQuotation(
      buildQuotationModel(brdModelInput({ bookingStatus: 'confirmed' })),
      'full',
    );
    expect(confirmed).not.toContain('Nothing booked yet.');
  });

  it('omits an expired announcement', () => {
    const content = [
      ...brdModelInput().content,
      {
        id: 'ann-old',
        contentType: 'announcement' as const,
        body: 'Golden Week surcharge applies',
        isActive: true,
        startsOn: '2026-04-01',
        endsOn: '2026-05-10',
        sortOrder: 99,
        conditionServiceId: null,
      },
    ];
    const text = renderQuotation(buildQuotationModel(brdModelInput({ content })), 'full');
    expect(text).not.toContain('Golden Week');
    expect(text).not.toContain('ANNOUNCEMENTS:');
  });

  it('includes an announcement that is live today', () => {
    const content = [
      ...brdModelInput().content,
      {
        id: 'ann-now',
        contentType: 'announcement' as const,
        body: 'Book early for cherry blossom season',
        isActive: true,
        startsOn: '2026-11-01',
        endsOn: '2026-12-31',
        sortOrder: 99,
        conditionServiceId: null,
      },
    ];
    const text = renderQuotation(buildQuotationModel(brdModelInput({ content })), 'full');
    expect(text).toContain('ANNOUNCEMENTS:');
    expect(text).toContain('Book early for cherry blossom season');
  });
});

// -----------------------------------------------------------------------------
describe('conditional content', () => {
  const conditional = {
    id: 'ex-disney',
    contentType: 'exclusion' as const,
    body: 'Disney park tickets',
    isActive: true,
    startsOn: null,
    endsOn: null,
    sortOrder: 99,
    conditionServiceId: 'disney-id',
  };

  it('stays hidden when its service is not selected', () => {
    const text = renderQuotation(
      buildQuotationModel(brdModelInput({ content: [...brdModelInput().content, conditional] })),
      'full',
    );
    expect(text).not.toContain('Disney park tickets');
  });

  it('appears once its service is selected', () => {
    const input = brdModelInput({ content: [...brdModelInput().content, conditional] });
    const text = renderQuotation(
      buildQuotationModel({
        ...input,
        services: [
          ...input.services,
          {
            serviceId: 'disney-id',
            name: 'Disney Transfer',
            consumesDay: true,
            inclusionText: null,
            dayNumber: 3,
            selectedAddonNames: [],
          },
        ],
      }),
      'full',
    );
    expect(text).toContain('\u{1F449} Disney park tickets');
  });
});

// -----------------------------------------------------------------------------
describe('inclusions', () => {
  it('replaces the duration token', () => {
    const text = renderQuotation(buildQuotationModel(brdModelInput()), 'full');
    expect(text).toContain('✅ 3D2N Hotel Accommodation');
    expect(text).not.toContain('{{duration}}');
  });

  it('lists transfers before tours', () => {
    const text = renderQuotation(buildQuotationModel(brdModelInput()), 'full');
    expect(text.indexOf('Round-trip Airport Transfers')).toBeLessThan(
      text.indexOf('with MT FUJI TOUR'),
    );
  });

  it('adds a line per selected add-on, naming its service', () => {
    const input = brdModelInput();
    const text = renderQuotation(
      buildQuotationModel({
        ...input,
        services: input.services.map((service) =>
          service.serviceId === MT_FUJI_ID
            ? { ...service, selectedAddonNames: ['Entrance ticket'] }
            : service,
        ),
      }),
      'full',
    );
    expect(text).toContain('✅ Entrance ticket (Mt Fuji Tour)');
  });
});

// -----------------------------------------------------------------------------
describe('the agent block', () => {
  it('drops only the missing line', () => {
    const noGreat = renderQuotation(
      buildQuotationModel(brdModelInput({ agentGreatUrl: null })),
      'full',
    );
    expect(noGreat).toContain('BAD \u{1F614}\u{1F614}\u{1F614}\nhttps://bit.ly/AIRA-BAD');
    expect(noGreat).not.toContain('GREAT');
  });

  it('omits the whole block when both links are missing', () => {
    const model = buildQuotationModel(brdModelInput({ agentBadUrl: null, agentGreatUrl: null }));
    const text = renderQuotation(model, 'full');
    expect(text).not.toContain('How would you rate my service?');
    expect(model.issues.map((issue) => issue.code)).toContain('NO_LINKS_AT_ALL');
  });

  it('never borrows another agent link', () => {
    const text = renderQuotation(
      buildQuotationModel(
        brdModelInput({ agentName: 'Geneuele', agentBadUrl: null, agentGreatUrl: null }),
      ),
      'full',
    );
    expect(text).not.toContain('AIRA');
    expect(text).toContain('Hi my name is Geneuele,');
  });

  it('reports a missing link as an issue the UI can warn about', () => {
    const model = buildQuotationModel(brdModelInput({ agentGreatUrl: null }));
    expect(model.issues.map((issue) => issue.code)).toContain('NO_GREAT_LINK');
    expect(model.canGenerate).toBe(true);
  });
});

// -----------------------------------------------------------------------------
describe('blocking', () => {
  it('refuses to generate when a shown category cannot be priced', () => {
    const input = brdModelInput();
    const model = buildQuotationModel({
      ...input,
      engineInput: { ...input.engineInput, paxTotal: 99 },
    });
    expect(model.canGenerate).toBe(false);
    expect(model.issues.map((issue) => issue.code)).toContain('BLOCKED_CATEGORY');
  });

  it('generates happily when everything prices', () => {
    expect(buildQuotationModel(brdModelInput()).canGenerate).toBe(true);
  });
});

// -----------------------------------------------------------------------------
describe('outputFingerprint', () => {
  it('is stable when nothing changes', () => {
    expect(outputFingerprint(buildQuotationModel(brdModelInput()))).toBe(
      outputFingerprint(buildQuotationModel(brdModelInput())),
    );
  });

  it('changes when the pax count changes', () => {
    const input = brdModelInput();
    const other = buildQuotationModel({
      ...input,
      engineInput: { ...input.engineInput, paxTotal: 8 },
    });
    expect(outputFingerprint(other)).not.toBe(
      outputFingerprint(buildQuotationModel(brdModelInput())),
    );
  });

  it('changes when a service is removed', () => {
    const input = brdModelInput();
    const fewer = buildQuotationModel({
      ...input,
      engineInput: { ...input.engineInput, services: [{ serviceId: MT_FUJI_ID }] },
      services: input.services.filter((service) => service.serviceId === MT_FUJI_ID),
    });
    expect(outputFingerprint(fewer)).not.toBe(
      outputFingerprint(buildQuotationModel(brdModelInput())),
    );
  });

  it('changes when an adjustment changes', () => {
    const input = brdModelInput();
    const dearer = buildQuotationModel({
      ...input,
      engineInput: {
        ...input.engineInput,
        adjustments: [
          { paxCategory: 'quad', kind: 'hotel', amount: 24_000, currency: 'PHP' },
          { paxCategory: 'twin', kind: 'hotel', amount: 12_000, currency: 'PHP' },
          { paxCategory: 'solo', kind: 'hotel', amount: 6_000, currency: 'PHP' },
        ],
      },
    });
    expect(outputFingerprint(dearer)).not.toBe(
      outputFingerprint(buildQuotationModel(brdModelInput())),
    );
  });
});

// -----------------------------------------------------------------------------
describe('snapshot isolation on regenerate', () => {
  it('produces the same rates after the live FX moves', () => {
    const before = renderQuotation(buildQuotationModel(brdModelInput()), 'rates');

    // A newer FX exists in admin, but this quotation keeps its own snapshot.
    const newerFx = parseSnapshot(snapshotJson(0.42));
    expect(newerFx.fx.JPY).toBe(420_000);
    expect(SNAPSHOT.fx.JPY).toBe(500_000);

    const after = renderQuotation(buildQuotationModel(brdModelInput()), 'rates');
    expect(after).toBe(before);
    expect(after).toContain('QUAD SHARE: PHP 19,099 per pax');
  });

  it('would price differently if the newer snapshot were used', () => {
    const input = brdModelInput();
    const newerFx = parseSnapshot(snapshotJson(0.42));
    const model = buildQuotationModel({
      ...input,
      snapshot: newerFx,
      engineInput: toEngineInput(
        newerFx,
        {
          paxAdults: 4,
          paxChildren: 0,
          airfarePhp: 0,
          packageMarkupType: null,
          packageMarkupValue: null,
          outputCategories: ['quad'],
        },
        [
          { serviceId: MT_FUJI_ID, sortOrder: 1 },
          { serviceId: AIRPORT_ID, sortOrder: 2 },
        ],
        [],
        [{ paxCategory: 'quad', kind: 'hotel', amount: 20_000, currency: 'PHP' }],
      ),
    });
    expect(renderQuotation(model, 'rates')).not.toContain('PHP 19,099');
  });
});

// -----------------------------------------------------------------------------
describe('toClipboardHtml', () => {
  it('escapes HTML and turns newlines into breaks', () => {
    expect(toClipboardHtml('a <b> & "c"\nd')).toBe(
      '<div style="white-space: pre-wrap; font-family: inherit">a &lt;b&gt; &amp; &quot;c&quot;<br>d</div>',
    );
  });

  it('keeps emoji untouched', () => {
    expect(toClipboardHtml('\u{1F5FB} Fuji')).toContain('\u{1F5FB}');
  });
});
