import type { Cell, CellHyperlinkValue, CellRichTextValue, Workbook, Worksheet } from 'exceljs';

export class SeedError extends Error {
  override readonly name = 'SeedError';
}

export function fail(message: string): never {
  throw new SeedError(message);
}

/** Looks a sheet up by exact name, then by trimmed name (some sheets have trailing spaces). */
export function sheet(wb: Workbook, name: string): Worksheet {
  const exact = wb.getWorksheet(name);
  if (exact) return exact;
  const loose = wb.worksheets.find((ws) => ws.name.trim() === name.trim());
  if (loose) return loose;
  const available = wb.worksheets.map((ws) => `"${ws.name}"`).join(', ');
  return fail(`Sheet "${name}" not found. The workbook has: ${available}`);
}

function isRichText(value: unknown): value is CellRichTextValue {
  return typeof value === 'object' && value !== null && 'richText' in value;
}

function isHyperlink(value: unknown): value is CellHyperlinkValue {
  return typeof value === 'object' && value !== null && 'hyperlink' in value;
}

function hasFormulaResult(value: unknown): value is { result?: unknown } {
  return typeof value === 'object' && value !== null && 'formula' in value;
}

/** Reads a cell as plain text, flattening rich text, hyperlinks and formula results. */
export function text(cell: Cell): string {
  const value: unknown = cell.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (isRichText(value)) return value.richText.map((part) => part.text).join('');
  if (isHyperlink(value)) {
    const label = value.text;
    if (typeof label === 'string' && label.trim() !== '') return label;
    if (isRichText(label)) return label.richText.map((part) => part.text).join('');
    return value.hyperlink;
  }
  if (hasFormulaResult(value)) {
    const result: unknown = value.result;
    if (typeof result === 'string' || typeof result === 'number') return String(result);
    return '';
  }
  return '';
}

/** The hyperlink target of a cell, if it carries one. */
export function hyperlink(cell: Cell): string | null {
  const value: unknown = cell.value;
  if (isHyperlink(value)) return value.hyperlink;
  return null;
}

/** Cell text with all runs of whitespace (including newlines) collapsed to one space. */
export function flat(cell: Cell): string {
  return text(cell).replace(/\s+/g, ' ').trim();
}

/** Cell text with blank lines dropped but real line breaks kept. */
export function lines(cell: Cell): string[] {
  return text(cell)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

export function at(ws: Worksheet, address: string): Cell {
  return ws.getCell(address);
}

/** Reads a required positive number, failing loudly when the layout is not as expected. */
export function amount(ws: Worksheet, address: string, context: string): number {
  const cell = at(ws, address);
  const raw: unknown = cell.value;
  const value =
    typeof raw === 'number'
      ? raw
      : hasFormulaResult(raw) && typeof raw.result === 'number'
        ? raw.result
        : Number.parseFloat(text(cell).replace(/[^0-9.-]/g, ''));

  if (!Number.isFinite(value) || value <= 0) {
    return fail(
      `${context}: expected a positive number in ${ws.name}!${address}, got "${text(cell)}".`,
    );
  }
  return Math.round(value * 100) / 100;
}
