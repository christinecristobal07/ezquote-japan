/**
 * The closing block of a quotation, per BRD 9.1.
 *
 * It carries the SIGNED-IN agent's own name and survey links — never the
 * quotation owner's and never anyone else's, since a rating would otherwise
 * land on the wrong person.
 */

export interface ClosingBlockInput {
  readonly agentName: string;
  readonly badUrl: string | null;
  readonly greatUrl: string | null;
}

export const RATE_MY_SERVICE_HEADING = 'How would you rate my service?';
/**
 * The URL goes on its own line, exactly as the Rate My Service workbook has
 * always had it. Messenger, Viber, Gmail and Outlook all turn a bare URL at the
 * start of a line into a link; sharing the line with the emoji prefix leaves it
 * to each app's guesswork, and a survey link a client cannot click is a survey
 * nobody answers.
 */
export const BAD_PREFIX = 'BAD \u{1F614}\u{1F614}\u{1F614}\n';
export const GREAT_PREFIX = 'GREAT \u{1F929}\u{1F929}\u{1F929}\n';

/** The greeting line that opens the quotation. */
export function formatGreeting(agentName: string): string {
  return `Hi my name is ${agentName}, I am pleased to offer you the below quotation:`;
}

/**
 * The "How would you rate my service?" block.
 *
 * A missing link drops its own line. With neither link there is nothing to
 * rate, so the whole block — heading included — is omitted.
 */
export function formatClosingBlock(input: ClosingBlockInput): string | null {
  if (input.badUrl === null && input.greatUrl === null) return null;

  const lines = [RATE_MY_SERVICE_HEADING];
  if (input.badUrl !== null) lines.push(`${BAD_PREFIX}${input.badUrl}`);
  if (input.greatUrl !== null) lines.push(`${GREAT_PREFIX}${input.greatUrl}`);
  return lines.join('\n');
}
