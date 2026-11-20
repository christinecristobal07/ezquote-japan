import { createHash } from 'node:crypto';

/** Fixed namespace so generated ids are stable across runs and machines. */
const NAMESPACE = '1b4e28ba-2fa1-11d2-883f-0016d3cca427';

export type SqlValue = string | number | boolean | null | undefined;

/** Quotes a value as a Postgres literal. Assumes standard_conforming_strings (the default). */
export function lit(value: SqlValue): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Cannot emit non-finite number: ${value}`);
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `'${value.replaceAll("'", "''")}'`;
}

/** Postgres array literal for a text/enum array column, e.g. data_issues. */
export function arrayLit(values: readonly string[], cast: string): string {
  if (values.length === 0) return `'{}'::${cast}`;
  return `array[${values.map((v) => lit(v)).join(', ')}]::${cast}`;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replaceAll('-', '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * Deterministic UUID v5 (SHA-1, RFC 4122). The same name always yields the same
 * id, which is what makes the seed idempotent across runs.
 */
export function uuid5(name: string): string {
  const hash = createHash('sha1')
    .update(hexToBytes(NAMESPACE))
    .update(Buffer.from(name, 'utf8'))
    .digest();

  const bytes = Uint8Array.prototype.slice.call(hash, 0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/** Indents a multi-line SQL fragment for readability in the generated file. */
export function indent(sql: string, spaces = 2): string {
  const pad = ' '.repeat(spaces);
  return sql
    .split('\n')
    .map((line) => (line.trim() === '' ? line : pad + line))
    .join('\n');
}
