/**
 * A small CSV writer that is safe to open in Excel.
 *
 * Two hazards it handles. Quoting, so a value containing a comma, a quote or a
 * newline survives the round trip. And formula injection: Excel treats a cell
 * beginning with = + - @ as a formula, so a reason field reading
 * "=cmd|'/c calc'!A0" would execute on open. Those cells are prefixed with a
 * tab, which Excel shows as text and ignores.
 */

const DANGEROUS_START = /^[=+\-@\t\r]/;

/** A cell is text; an object would otherwise land as "[object Object]". */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  // Arrays and objects (the jsonb an audit row carries) read as their JSON.
  if (typeof value === 'object') return JSON.stringify(value);
  // A symbol or a function has nothing sensible to put in a cell.
  return '';
}

export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  let text = asText(value);

  // Neutralise anything Excel would read as a formula.
  if (DANGEROUS_START.test(text)) text = `\t${text}`;

  if (/[",\n\r\t]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export interface CsvOptions {
  /** A UTF-8 BOM, so Excel reads accents and emoji correctly. */
  readonly bom?: boolean;
}

export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
  options: CsvOptions = {},
): string {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) lines.push(row.map(escapeCell).join(','));
  const body = `${lines.join('\r\n')}\r\n`;
  return options.bom === false ? body : `\uFEFF${body}`;
}

/** Hands the browser a .csv file to save. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const CSV_ROW_LIMIT = 10_000;
