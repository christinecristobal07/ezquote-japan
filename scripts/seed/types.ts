export interface Tier {
  readonly paxType: 'adult';
  readonly minPax: number;
  readonly maxPax: number;
  readonly amount: number;
}

export interface Addon {
  readonly name: string;
  readonly amount: number;
  readonly defaultSelected: boolean;
}

export interface RateVersion {
  readonly currency: 'JPY';
  readonly pricingBasis: 'per_pax';
  readonly validUntil: string | null;
  readonly tiers: readonly Tier[];
  readonly addons: readonly Addon[];
}

export interface SeedService {
  readonly code: string;
  readonly name: string;
  readonly serviceType: 'tour' | 'transfer';
  readonly cityName: string | null;
  readonly inclusionText: string;
  readonly itineraryKey: string | null;
  itineraryTitle: string | null;
  itineraryText: string | null;
  readonly consumesDay: boolean;
  readonly transferDirection: 'one_way' | 'round_trip' | null;
  readonly sortOrder: number;
  readonly rate: RateVersion | null;
}

export interface SeedHotel {
  readonly name: string;
  readonly cityName: string;
  readonly starRating: number;
  readonly walkToStation: string | null;
  readonly sortOrder: number;
}

export type DataIssue =
  'needs_email' | 'invalid_bad_link' | 'invalid_great_link' | 'placeholder_link';

export interface SeedAgent {
  readonly id: string;
  readonly fullName: string;
  readonly email: string | null;
  readonly dataIssues: DataIssue[];
  badUrl: string | null;
  greatUrl: string | null;
  readonly notes: string[];
  readonly rows: number[];
}

export interface SeedSetting {
  readonly key: string;
  readonly value: unknown;
  readonly description: string;
}

export interface SeedContentItem {
  readonly contentType: string;
  readonly body: string;
  readonly sortOrder: number;
}

export interface FixedConfig {
  readonly fxRates: readonly { currency: 'JPY' | 'USD'; phpPerUnit: number }[];
  readonly categoryMarkups: readonly { paxCategory: string; value: number }[];
  readonly serviceMarkups: readonly { serviceType: 'tour' | 'transfer'; value: number }[];
  readonly contentItems: readonly SeedContentItem[];
}
