/**
 * How a content line renders in a quotation.
 *
 * This is the single source for the prefixes and token substitution. Step 13
 * builds the full output on top of it, and the content screens preview with
 * it, so what a manager sees while editing is what an agent sends.
 */

export type ContentType =
  | 'inclusion'
  | 'exclusion'
  | 'note'
  | 'requirement'
  | 'remark'
  | 'announcement'
  | 'availability_reminder'
  | 'booking_disclaimer'
  | 'personal_transactions';

const PREFIXES: Partial<Record<ContentType, string>> = {
  inclusion: '✅ ',
  exclusion: '\u{1F449} ',
  // requirement has no prefix: the "JAPAN REQUIREMENTS" header carries the 👉.
  remark: '- ',
  note: 'Note: ',
};

export function prefixFor(type: ContentType): string {
  return PREFIXES[type] ?? '';
}

export type ContentTokens = Readonly<Record<string, string>>;

export interface FormattedLine {
  readonly text: string;
  /** Tokens that had no value. They stay visible so the gap is obvious. */
  readonly unknownTokens: readonly string[];
}

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/**
 * Applies the prefix and fills {{tokens}}.
 *
 * An unknown token is deliberately left in place rather than blanked: a
 * quotation reading "{{duration}} Hotel Accommodation" is obviously wrong,
 * while one reading " Hotel Accommodation" looks fine and ships broken.
 */
export function formatContentLine(
  type: ContentType,
  body: string,
  tokens: ContentTokens = {},
): FormattedLine {
  const unknown = new Set<string>();

  const filled = body.replace(TOKEN_PATTERN, (match, name: string) => {
    const value = tokens[name];
    if (value === undefined) {
      unknown.add(name);
      return match;
    }
    return value;
  });

  return { text: `${prefixFor(type)}${filled}`, unknownTokens: [...unknown] };
}

export interface LiveWindow {
  readonly isActive: boolean;
  /** ISO date (YYYY-MM-DD) or null for no limit. */
  readonly startsOn?: string | null;
  readonly endsOn?: string | null;
}

/**
 * Whether a line should appear today. `today` is a plain YYYY-MM-DD in Manila
 * time, so a window never shifts because the laptop is in another timezone.
 */
export function isLive(item: LiveWindow, today: string): boolean {
  if (!item.isActive) return false;
  if (item.startsOn != null && today < item.startsOn) return false;
  if (item.endsOn != null && today > item.endsOn) return false;
  return true;
}

export type LiveState = 'Live' | 'Scheduled' | 'Expired' | 'Inactive';

export function liveState(item: LiveWindow, today: string): LiveState {
  if (!item.isActive) return 'Inactive';
  if (item.startsOn != null && today < item.startsOn) return 'Scheduled';
  if (item.endsOn != null && today > item.endsOn) return 'Expired';
  return 'Live';
}

/** Today in Manila as YYYY-MM-DD. */
export function manilaToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Manila',
  }).format(now);
}
