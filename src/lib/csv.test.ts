import { describe, expect, it } from 'vitest';
import { CSV_ROW_LIMIT, escapeCell, toCsv } from './csv.ts';

describe('escapeCell', () => {
  it('leaves a plain value alone', () => {
    expect(escapeCell('Mt Fuji Tour')).toBe('Mt Fuji Tour');
    expect(escapeCell(1234)).toBe('1234');
    expect(escapeCell(0)).toBe('0');
    expect(escapeCell(true)).toBe('true');
  });

  it('writes nothing for a blank', () => {
    expect(escapeCell(null)).toBe('');
    expect(escapeCell(undefined)).toBe('');
  });

  it('quotes commas, quotes and newlines', () => {
    expect(escapeCell('a,b')).toBe('"a,b"');
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCell('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCell('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it.each(['=cmd|calc', "=cmd|'/c calc'!A0", '+1+1', '-1+1', '@SUM(A1)'])(
    'neutralises %s so Excel will not run it',
    (dangerous) => {
      const cell = escapeCell(dangerous);
      expect(cell).toBe(`"\t${dangerous}"`);
      // The original text is still readable in the cell.
      expect(cell).toContain(dangerous);
    },
  );

  it('neutralises a dangerous value that also needs quoting', () => {
    expect(escapeCell('=A1,B1')).toBe('"\t=A1,B1"');
  });

  it('does not treat a minus inside the text as a formula', () => {
    expect(escapeCell('Nov 20 - Nov 23')).toBe('Nov 20 - Nov 23');
  });
});

describe('toCsv', () => {
  it('writes header and rows with CRLF endings', () => {
    expect(toCsv(['a', 'b'], [['1', '2']], { bom: false })).toBe('a,b\r\n1,2\r\n');
  });

  it('writes a header-only file when there are no rows', () => {
    expect(toCsv(['a', 'b'], [], { bom: false })).toBe('a,b\r\n');
  });

  it('writes a BOM by default so Excel reads accents and emoji', () => {
    const csv = toCsv(['name'], [['Kyōto 🗻']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Kyōto 🗻');
  });

  it('can be asked to skip the BOM', () => {
    expect(toCsv(['a'], [['b']], { bom: false }).startsWith('﻿')).toBe(false);
  });

  it('escapes every cell, header row included', () => {
    const csv = toCsv(['Reason, if any'], [['=HYPERLINK("x")']], { bom: false });
    expect(csv).toBe('"Reason, if any"\r\n"\t=HYPERLINK(""x"")"\r\n');
  });

  it('caps exports at a size Excel and the browser can handle', () => {
    expect(CSV_ROW_LIMIT).toBe(10_000);
  });
});
