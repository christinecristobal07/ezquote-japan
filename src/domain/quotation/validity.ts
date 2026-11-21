/**
 * How long a quotation's rates are good for.
 *
 * Every operator rate version carries a `valid_until`. The quotation has to say
 * so on its face: a client holding a quote with no visible expiry will book for
 * December against rates that stopped at the end of October, and nobody notices
 * until the operator bills a different figure.
 *
 * The binding date is the EARLIEST expiry among the services actually selected,
 * because the package cannot outlive its shortest-lived part.
 */

export interface ValidityService {
  readonly serviceId: string;
  readonly name: string;
  /** yyyy-mm-dd, or null for a rate with no stated expiry. */
  readonly validUntil: string | null;
}

export interface QuotationValidity {
  /** The earliest expiry among the selected services, or null if none state one. */
  readonly validUntil: string | null;
  /** "LAND ARRANGEMENT VALID UNTIL OCTOBER 31, 2027", or null when unknown. */
  readonly label: string | null;
  /** Services that expire on that date — who to chase when it needs extending. */
  readonly expiringServices: readonly string[];
  /** True when the travel date falls after the rates expire. */
  readonly travelDateOutside: boolean;
  /** True when no selected service states an expiry, so nothing can be promised. */
  readonly unknown: boolean;
}

const MONTHS = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
];

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "2027-10-31" to "OCTOBER 31, 2027".
 *
 * Deliberately not Intl: this is a plain yyyy-mm-dd with no time and no zone,
 * and parsing it into a Date would shift it a day either side of midnight
 * depending on where the browser is.
 */
export function formatValidityDate(day: string): string | null {
  const match = DAY.exec(day);
  if (match === null) return null;
  const [, year, month, date] = match;
  const name = MONTHS[Number(month) - 1];
  if (name === undefined || year === undefined || date === undefined) return null;
  return `${name} ${String(Number(date))}, ${year}`;
}

export const VALIDITY_PREFIX = 'LAND ARRANGEMENT VALID UNTIL ';

/**
 * Works out the validity of a quotation from the services on it.
 *
 * `travelDate` is the plain yyyy-mm-dd on the quotation, or null if the agent
 * has not set one yet.
 */
export function quotationValidity(
  services: readonly ValidityService[],
  travelDate: string | null,
): QuotationValidity {
  const dated = services.filter(
    (service): service is ValidityService & { validUntil: string } => service.validUntil !== null,
  );

  if (dated.length === 0) {
    return {
      validUntil: null,
      label: null,
      expiringServices: [],
      travelDateOutside: false,
      unknown: true,
    };
  }

  // yyyy-mm-dd sorts correctly as text, which is the point of the format.
  const earliest = dated
    .map((service) => service.validUntil)
    .reduce((soonest, day) => (day < soonest ? day : soonest));

  const formatted = formatValidityDate(earliest);

  return {
    validUntil: earliest,
    label: formatted === null ? null : `${VALIDITY_PREFIX}${formatted}`,
    expiringServices: dated
      .filter((service) => service.validUntil === earliest)
      .map((service) => service.name),
    travelDateOutside: travelDate !== null && travelDate !== '' && travelDate > earliest,
    unknown: false,
  };
}

/** The warning an agent sees when the travel date is past the rates' expiry. */
export function validityWarning(validity: QuotationValidity): string | null {
  if (validity.unknown) {
    return 'These rates have no stated expiry, so the quotation cannot promise one. Ask Product Development to set a Valid until date.';
  }
  if (!validity.travelDateOutside || validity.validUntil === null) return null;

  const pretty = formatValidityDate(validity.validUntil) ?? validity.validUntil;
  const who =
    validity.expiringServices.length === 0 ? '' : ` (${validity.expiringServices.join(', ')})`;
  return `The travel date is after these rates expire on ${pretty}${who}. The operator can charge a different rate. Confirm an extension before sending this.`;
}
