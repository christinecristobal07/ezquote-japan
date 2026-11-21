/**
 * The closing block of a quotation, per BRD 9.1.
 *
 * It carries the signed-in agent's own name and survey links — never anyone
 * else's, since a rating would otherwise land on the wrong person.
 */

export interface ClosingBlockInput {
  readonly agentName: string;
  readonly badUrl: string | null;
  readonly greatUrl: string | null;
}

export const RATE_MY_SERVICE_HEADING = 'RATE MY SERVICE';

export function formatClosingBlock(input: ClosingBlockInput): string {
  const lines = [`Hi my name is ${input.agentName}, thank you for letting me assist you!`, ''];

  const hasAny = input.badUrl !== null || input.greatUrl !== null;
  if (hasAny) {
    lines.push(RATE_MY_SERVICE_HEADING);
    if (input.badUrl !== null) lines.push(`Bad ${input.badUrl}`);
    if (input.greatUrl !== null) lines.push(`Great ${input.greatUrl}`);
  }

  return lines.join('\n').replace(/\n+$/, '');
}
