export interface ItineraryService {
  readonly serviceId: string;
  readonly name: string;
  readonly consumesDay: boolean;
  readonly addsNight: boolean;
  /** The day the agent put it on, or null while unassigned. */
  readonly dayNumber: number | null;
  readonly itineraryTitle: string | null;
  readonly itineraryText: string | null;
}

export type DayKind = 'arrival' | 'service' | 'free' | 'departure';

export interface ItineraryDay {
  readonly dayNumber: number;
  readonly kind: DayKind;
  readonly title: string;
  readonly body: string;
  readonly serviceIds: readonly string[];
}

export type ItineraryIssueCode = 'DAY_CONFLICT' | 'DAY_OUT_OF_RANGE' | 'UNASSIGNED_SERVICE';

export interface ItineraryIssue {
  readonly code: ItineraryIssueCode;
  readonly serviceId: string;
  readonly dayNumber?: number;
}

export interface ItineraryInput {
  readonly durationDays: number;
  readonly services: readonly ItineraryService[];
  readonly arrivalText: string;
  readonly departureText: string;
  readonly freeDayText: string;
}

export interface ItineraryResult {
  readonly days: readonly ItineraryDay[];
  readonly issues: readonly ItineraryIssue[];
}

/** Day 1 is always arrival and the last day always departure. */
export function tourDayRange(durationDays: number): readonly number[] {
  const days: number[] = [];
  for (let day = 2; day <= durationDays - 1; day += 1) days.push(day);
  return days;
}

/**
 * Lays the selected services out across the trip.
 *
 * A service that consumes a day owns one of the middle days. A service that
 * does not — the airport transfer — never takes a day; with no explicit day it
 * is listed on both the arrival and departure days, which is what a round-trip
 * transfer actually is.
 */
export function buildItinerary(input: ItineraryInput): ItineraryResult {
  const { durationDays } = input;
  const issues: ItineraryIssue[] = [];
  const lastDay = durationDays;
  const middle = new Set(tourDayRange(durationDays));

  /**
   * A tour the agent has not put on a day yet still belongs in the itinerary.
   *
   * It used to be dropped: an agent who ticked three tours and never touched
   * the day dropdowns got a quotation whose itinerary showed arrival, free
   * days and departure, with no tours on it at all. Nothing said why. So
   * unassigned tours take the free middle days in order, and the dropdown
   * becomes a way to override that rather than a step you must remember.
   *
   * Anything still left over has nowhere to go, and that is a real problem
   * the agent has to resolve, so it keeps raising UNASSIGNED_SERVICE.
   */
  const taken = new Set(
    input.services
      .filter((service) => service.consumesDay && service.dayNumber !== null)
      .map((service) => service.dayNumber),
  );
  const freeDays = tourDayRange(durationDays).filter((day) => !taken.has(day));
  const placed = new Map<string, number>();
  for (const service of input.services) {
    if (!service.consumesDay || service.dayNumber !== null) continue;
    const day = freeDays.shift();
    if (day === undefined) break;
    placed.set(service.serviceId, day);
  }

  const services = input.services.map((service) => {
    const day = placed.get(service.serviceId);
    return day === undefined ? service : { ...service, dayNumber: day };
  });

  /** dayNumber -> services that own it. */
  const owners = new Map<number, ItineraryService[]>();
  /** Services listed on a day without owning it. */
  const passengers = new Map<number, ItineraryService[]>();

  function addPassenger(day: number, service: ItineraryService): void {
    passengers.set(day, [...(passengers.get(day) ?? []), service]);
  }

  for (const service of services) {
    if (!service.consumesDay) {
      if (service.dayNumber === null) {
        addPassenger(1, service);
        if (lastDay > 1) addPassenger(lastDay, service);
      } else if (service.dayNumber < 1 || service.dayNumber > lastDay) {
        issues.push({
          code: 'DAY_OUT_OF_RANGE',
          serviceId: service.serviceId,
          dayNumber: service.dayNumber,
        });
      } else {
        addPassenger(service.dayNumber, service);
      }
      continue;
    }

    if (service.dayNumber === null) {
      issues.push({ code: 'UNASSIGNED_SERVICE', serviceId: service.serviceId });
      continue;
    }
    if (!middle.has(service.dayNumber)) {
      issues.push({
        code: 'DAY_OUT_OF_RANGE',
        serviceId: service.serviceId,
        dayNumber: service.dayNumber,
      });
      continue;
    }

    const existing = owners.get(service.dayNumber) ?? [];
    if (existing.length > 0) {
      issues.push({
        code: 'DAY_CONFLICT',
        serviceId: service.serviceId,
        dayNumber: service.dayNumber,
      });
    }
    owners.set(service.dayNumber, [...existing, service]);
  }

  const days: ItineraryDay[] = [];
  for (let day = 1; day <= durationDays; day += 1) {
    const riding = passengers.get(day) ?? [];
    const owning = owners.get(day) ?? [];

    if (day === 1) {
      days.push({
        dayNumber: day,
        kind: 'arrival',
        title: 'Arrival',
        body: input.arrivalText,
        serviceIds: riding.map((service) => service.serviceId),
      });
      continue;
    }

    if (day === lastDay) {
      days.push({
        dayNumber: day,
        kind: 'departure',
        title: 'Departure',
        body: input.departureText,
        serviceIds: riding.map((service) => service.serviceId),
      });
      continue;
    }

    const first = owning[0];
    if (first === undefined) {
      days.push({
        dayNumber: day,
        kind: 'free',
        title: 'Free time (No tour)',
        body: input.freeDayText,
        serviceIds: riding.map((service) => service.serviceId),
      });
      continue;
    }

    days.push({
      dayNumber: day,
      kind: 'service',
      title: first.itineraryTitle ?? first.name,
      body: first.itineraryText ?? '',
      serviceIds: [...owning, ...riding].map((service) => service.serviceId),
    });
  }

  return { days, issues };
}

/**
 * Puts day-consuming services on the middle days, in selection order.
 *
 * A manual assignment that is still valid and unclaimed is kept, so
 * re-arranging one service does not shuffle the rest.
 */
export function autoAssignDays(
  services: readonly ItineraryService[],
  durationDays: number,
): readonly ItineraryService[] {
  const available = tourDayRange(durationDays);
  const taken = new Set<number>();

  const keep = new Map<string, number>();
  for (const service of services) {
    if (!service.consumesDay) continue;
    const day = service.dayNumber;
    if (day !== null && available.includes(day) && !taken.has(day)) {
      keep.set(service.serviceId, day);
      taken.add(day);
    }
  }

  const free = available.filter((day) => !taken.has(day));
  let next = 0;

  return services.map((service) => {
    if (!service.consumesDay) return service;
    const kept = keep.get(service.serviceId);
    if (kept !== undefined) return { ...service, dayNumber: kept };
    const day = free[next];
    next += 1;
    return { ...service, dayNumber: day ?? null };
  });
}

/** "3D2N" -> "3D2N JPN LAND ARRANGEMENT PACKAGE" */
export function defaultPackageTitle(durationLabel: string): string {
  return `${durationLabel} JPN LAND ARRANGEMENT PACKAGE`;
}
