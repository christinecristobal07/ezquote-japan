import { formatPhp, type Centavos } from '../money.ts';
import { calculateQuotation, type QuotationInput } from '../rateEngine.ts';
import type { RateSnapshot } from '../snapshot.ts';
import type { ItineraryDay } from '../quotation/itinerary.ts';
import { formatContentLine, isLive, type ContentType } from './sectionFormat.ts';
import { groupHotelsForOutput, SIMILAR_SUFFIX } from './hotelGroups.ts';
import { formatClosingBlock, formatGreeting } from './closingBlock.ts';

// -----------------------------------------------------------------------------
export interface OutputContentItem {
  readonly id: string;
  readonly contentType: ContentType;
  readonly body: string;
  readonly isActive: boolean;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly sortOrder: number;
  /** Only shown when that service is selected. */
  readonly conditionServiceId: string | null;
}

export interface OutputService {
  readonly serviceId: string;
  readonly name: string;
  readonly consumesDay: boolean;
  readonly inclusionText: string | null;
  /** The day it was placed on, for inclusion ordering. */
  readonly dayNumber: number | null;
  readonly selectedAddonNames: readonly string[];
}

export interface OutputHotel {
  readonly name: string;
  readonly starRating: number;
}

export interface QuotationModelInput {
  readonly snapshot: RateSnapshot;
  readonly engineInput: QuotationInput;
  /** The signed-in user, not the quotation owner. */
  readonly agentName: string;
  readonly agentBadUrl: string | null;
  readonly agentGreatUrl: string | null;
  readonly packageTitle: string;
  readonly validityLabel: string;
  readonly seasonLabel: string | null;
  readonly durationLabel: string;
  readonly hotelCategory: number;
  /** The agent's picks, in saved order. Empty means "list the whole category". */
  readonly selectedHotels: readonly OutputHotel[];
  readonly categoryHotels: readonly OutputHotel[];
  readonly services: readonly OutputService[];
  readonly content: readonly OutputContentItem[];
  readonly itinerary: readonly ItineraryDay[];
  readonly bookingStatus: 'not_booked' | 'booked' | 'confirmed';
  /** YYYY-MM-DD in Manila, for the content date windows. */
  readonly today: string;
}

export interface RateLine {
  readonly paxCategory: string;
  readonly label: string;
  readonly amount: Centavos | null;
}

export interface QuotationSections {
  readonly greeting: string;
  readonly header: readonly string[];
  readonly hotels: readonly string[];
  readonly rates: readonly string[];
  readonly inclusions: readonly string[];
  readonly exclusions: readonly string[];
  readonly notes: readonly string[];
  readonly itinerary: readonly string[];
  readonly requirements: readonly string[];
  readonly announcements: readonly string[];
  readonly remarks: readonly string[];
  readonly availability: readonly string[];
  readonly bookingDisclaimer: readonly string[];
  readonly personalTransactions: readonly string[];
  readonly closing: readonly string[];
}

export type OutputIssueCode =
  | 'BLOCKED_CATEGORY'
  | 'NO_RATE_LINES'
  | 'NO_BAD_LINK'
  | 'NO_GREAT_LINK'
  | 'NO_LINKS_AT_ALL'
  | 'NO_HOTELS';

export interface OutputIssue {
  readonly code: OutputIssueCode;
  readonly detail?: string;
}

export interface QuotationModel {
  readonly sections: QuotationSections;
  readonly rateLines: readonly RateLine[];
  readonly issues: readonly OutputIssue[];
  /** True when nothing blocks generating the text. */
  readonly canGenerate: boolean;
}

// -----------------------------------------------------------------------------
function liveItems(
  content: readonly OutputContentItem[],
  type: ContentType,
  today: string,
  selectedServiceIds: ReadonlySet<string>,
): readonly OutputContentItem[] {
  return content
    .filter((item) => item.contentType === type)
    .filter((item) => isLive(item, today))
    .filter(
      (item) => item.conditionServiceId === null || selectedServiceIds.has(item.conditionServiceId),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** "PHP 13,999" — thousands separator, no decimals. */
export function formatRateAmount(centavos: Centavos): string {
  return formatPhp(Math.round(centavos / 100) * 100);
}

/**
 * Assembles every section of the quotation.
 *
 * Prices come from the engine running on the quotation's own snapshot, so the
 * text can be regenerated years later and still read the same. Display wording
 * comes from the live content tables, which is why a reworded inclusion shows
 * up on regenerate while the rates do not move.
 */
export function buildQuotationModel(input: QuotationModelInput): QuotationModel {
  const issues: OutputIssue[] = [];
  const selectedServiceIds = new Set(input.services.map((service) => service.serviceId));
  const tokens = { duration: input.durationLabel };

  // -- rates ------------------------------------------------------------------
  const result = calculateQuotation(input.engineInput);
  const order = new Map(input.snapshot.categories.map((category, index) => [category.code, index]));

  const rateLines: RateLine[] = result.categories
    .slice()
    .sort((a, b) => (order.get(a.paxCategory) ?? 0) - (order.get(b.paxCategory) ?? 0))
    .map((category) => ({
      paxCategory: category.paxCategory,
      label:
        input.snapshot.categoryByCode.get(category.paxCategory)?.outputLabel ??
        category.outputLabel,
      amount: category.final,
    }));

  for (const line of rateLines) {
    if (line.amount === null) {
      issues.push({ code: 'BLOCKED_CATEGORY', detail: line.label });
    }
  }
  if (rateLines.length === 0) issues.push({ code: 'NO_RATE_LINES' });

  // -- hotels -----------------------------------------------------------------
  const hotelSource =
    input.selectedHotels.length > 0
      ? input.selectedHotels
      : input.categoryHotels.filter((hotel) => hotel.starRating === input.hotelCategory);

  const hotelLines: string[] = [];
  if (hotelSource.length === 0) {
    issues.push({ code: 'NO_HOTELS' });
  } else if (input.selectedHotels.length > 0) {
    // Keep the agent's own order rather than regrouping it.
    hotelLines.push(
      `HOTEL CATEGORY: ${String(input.hotelCategory)} STAR`,
      `${hotelSource.map((hotel) => hotel.name).join(' / ')}${SIMILAR_SUFFIX}`,
    );
  } else {
    for (const group of groupHotelsForOutput(hotelSource)) {
      hotelLines.push(group.heading, `${group.names.join(' / ')}${SIMILAR_SUFFIX}`);
    }
  }

  // -- inclusions -------------------------------------------------------------
  const inclusionLines = liveItems(input.content, 'inclusion', input.today, selectedServiceIds).map(
    (item) => formatContentLine('inclusion', item.body, tokens).text,
  );

  const withText = input.services.filter(
    (service) => service.inclusionText !== null && service.inclusionText !== '',
  );
  // Transfers first, then the tours in the order they fall in the itinerary.
  const transfersFirst = withText.filter((service) => !service.consumesDay);
  const toursByDay = withText
    .filter((service) => service.consumesDay)
    .sort((a, b) => (a.dayNumber ?? 99) - (b.dayNumber ?? 99));

  for (const service of [...transfersFirst, ...toursByDay]) {
    inclusionLines.push(formatContentLine('inclusion', service.inclusionText ?? '', tokens).text);
  }
  for (const service of [...transfersFirst, ...toursByDay]) {
    for (const addon of service.selectedAddonNames) {
      inclusionLines.push(
        formatContentLine('inclusion', `${addon} (${service.name})`, tokens).text,
      );
    }
  }

  // -- the remaining text sections -------------------------------------------
  const section = (type: ContentType): string[] =>
    liveItems(input.content, type, input.today, selectedServiceIds).map(
      (item) => formatContentLine(type, item.body, tokens).text,
    );

  const exclusions = section('exclusion');
  const notes = section('note');
  const requirements = section('requirement');
  const announcements = section('announcement');
  const remarks = section('remark');
  const availability = section('availability_reminder');
  const personalTransactions = section('personal_transactions');
  const bookingDisclaimer =
    input.bookingStatus === 'confirmed' ? [] : section('booking_disclaimer');

  // -- itinerary --------------------------------------------------------------
  const itineraryLines: string[] = [];
  for (const day of input.itinerary) {
    if (day.kind === 'service') {
      // A tour day leads with its title and lists the stops beneath.
      itineraryLines.push(`DAY ${String(day.dayNumber)}: ${day.title}`);
      if (day.body.trim() !== '') itineraryLines.push(day.body);
    } else {
      // Arrival, departure and free days are a single line, per BRD 9.1.
      const text = day.body.trim() === '' ? day.title : day.body;
      itineraryLines.push(`DAY ${String(day.dayNumber)}: ${text}`);
    }
  }

  // -- closing ----------------------------------------------------------------
  if (input.agentBadUrl === null && input.agentGreatUrl === null) {
    issues.push({ code: 'NO_LINKS_AT_ALL' });
  } else {
    if (input.agentBadUrl === null) issues.push({ code: 'NO_BAD_LINK' });
    if (input.agentGreatUrl === null) issues.push({ code: 'NO_GREAT_LINK' });
  }

  const closingText = formatClosingBlock({
    agentName: input.agentName,
    badUrl: input.agentBadUrl,
    greatUrl: input.agentGreatUrl,
  });

  const header = [input.packageTitle, input.validityLabel];
  if (input.seasonLabel !== null && input.seasonLabel !== '') header.push(input.seasonLabel);

  const sections: QuotationSections = {
    greeting: formatGreeting(input.agentName),
    header,
    hotels: hotelLines,
    rates: rateLines
      .filter((line) => line.amount !== null)
      .map((line) => `${line.label}: ${formatRateAmount(line.amount ?? 0)} per pax`),
    inclusions: inclusionLines,
    exclusions,
    notes,
    itinerary: itineraryLines,
    requirements,
    announcements,
    remarks,
    availability,
    bookingDisclaimer,
    personalTransactions,
    closing: closingText === null ? [] : closingText.split('\n'),
  };

  const blocking = issues.filter(
    (issue) => issue.code === 'BLOCKED_CATEGORY' || issue.code === 'NO_RATE_LINES',
  );

  return { sections, rateLines, issues, canGenerate: blocking.length === 0 };
}

// -----------------------------------------------------------------------------
export type OutputPart = 'full' | 'rates' | 'itinerary' | 'inclusionsExclusions';

/** Joins the blocks that have content, separated by exactly one blank line. */
function joinBlocks(blocks: readonly (readonly string[])[]): string {
  return blocks
    .filter((block) => block.length > 0)
    .map((block) => block.join('\n'))
    .join('\n\n');
}

export function renderQuotation(model: QuotationModel, part: OutputPart = 'full'): string {
  const s = model.sections;

  if (part === 'rates') {
    return joinBlocks([s.header, s.rates]);
  }
  if (part === 'itinerary') {
    return joinBlocks([s.itinerary.length > 0 ? ['Itinerary:', ...s.itinerary] : []]);
  }
  if (part === 'inclusionsExclusions') {
    return joinBlocks([
      s.inclusions.length > 0 ? ['INCLUSION:', ...s.inclusions] : [],
      s.exclusions.length > 0 ? ['❌ EXCLUSION:', ...s.exclusions] : [],
    ]);
  }

  return joinBlocks([
    [s.greeting],
    s.header,
    s.hotels.length > 0 || s.rates.length > 0 ? [...s.hotels, ...s.rates] : [],
    s.inclusions.length > 0 ? ['INCLUSION:', ...s.inclusions] : [],
    s.exclusions.length > 0 ? ['❌ EXCLUSION:', ...s.exclusions] : [],
    s.notes,
    s.itinerary.length > 0 ? ['Itinerary:', ...s.itinerary] : [],
    s.requirements.length > 0 ? ['\u{1F449} JAPAN REQUIREMENTS:', ...s.requirements] : [],
    s.announcements.length > 0 ? ['ANNOUNCEMENTS:', ...s.announcements] : [],
    s.remarks.length > 0 ? ['REMARKS', ...s.remarks] : [],
    s.availability,
    s.bookingDisclaimer,
    s.personalTransactions,
    s.closing,
  ]);
}

// -----------------------------------------------------------------------------
/**
 * A stable hash of everything that lands in the text.
 *
 * Used to spot a saved version that no longer matches the current inputs, so
 * an agent cannot copy a stale quotation after changing the pax count.
 */
export function outputFingerprint(model: QuotationModel): string {
  const text = renderQuotation(model, 'full');
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Rich-paste flavour, so Messenger and Gmail keep the line breaks. */
export function toClipboardHtml(text: string): string {
  const escaped = text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
  return `<div style="white-space: pre-wrap; font-family: inherit">${escaped.replaceAll('\n', '<br>')}</div>`;
}
