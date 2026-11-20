import { describe, expect, it } from 'vitest';
import { safeRedirectTo } from './redirectTo.ts';

const BACKSLASH = String.fromCharCode(92);

describe('safeRedirectTo', () => {
  it.each(['/quotations', '/admin/rates', '/audit?page=2', '/'])('keeps %s', (path) => {
    expect(safeRedirectTo(path)).toBe(path);
  });

  it.each([
    ['//evil.com', 'protocol-relative URL'],
    ['https://evil.com', 'absolute URL'],
    ['http://evil.com', 'absolute URL'],
    [`/${BACKSLASH}evil.com`, 'backslash trick'],
    ['javascript:alert(1)', 'script URL'],
    ['quotations', 'bare relative path'],
    ['', 'empty string'],
  ])('rejects %s (%s)', (value) => {
    expect(safeRedirectTo(value)).toBe('/');
  });

  it.each([null, undefined])('falls back to / for %s', (value) => {
    expect(safeRedirectTo(value)).toBe('/');
  });
});
