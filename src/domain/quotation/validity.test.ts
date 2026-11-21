import { describe, expect, it } from 'vitest';
import {
  formatValidityDate,
  quotationValidity,
  validityWarning,
  type ValidityService,
} from './validity.ts';

function service(name: string, validUntil: string | null): ValidityService {
  return { serviceId: name.toLowerCase().replace(/\s+/g, '-'), name, validUntil };
}

describe('formatValidityDate', () => {
  it.each([
    ['2027-10-31', 'OCTOBER 31, 2027'],
    ['2027-11-01', 'NOVEMBER 1, 2027'],
    ['2026-01-09', 'JANUARY 9, 2026'],
    ['2027-12-25', 'DECEMBER 25, 2027'],
  ])('%s reads %s', (day, expected) => {
    expect(formatValidityDate(day)).toBe(expected);
  });

  it('drops the leading zero on the day, but keeps the year whole', () => {
    expect(formatValidityDate('2027-03-05')).toBe('MARCH 5, 2027');
  });

  it('refuses anything that is not a plain yyyy-mm-dd', () => {
    expect(formatValidityDate('31/10/2027')).toBeNull();
    expect(formatValidityDate('2027-13-01')).toBeNull();
    expect(formatValidityDate('')).toBeNull();
  });

  it('does not shift the date across a timezone boundary', () => {
    // A Date-based implementation would read this as the 30th west of UTC.
    expect(formatValidityDate('2027-10-31')).toBe('OCTOBER 31, 2027');
  });
});

describe('quotationValidity', () => {
  it('takes the earliest expiry, because the package cannot outlive its shortest part', () => {
    const validity = quotationValidity(
      [
        service('Mt Fuji Tour', '2027-11-30'),
        service('Airport Transfer', '2027-10-31'),
        service('Tokyo Tour', '2028-03-31'),
      ],
      null,
    );
    expect(validity.validUntil).toBe('2027-10-31');
    expect(validity.label).toBe('LAND ARRANGEMENT VALID UNTIL OCTOBER 31, 2027');
  });

  it('names the services that expire first, so someone knows who to chase', () => {
    const validity = quotationValidity(
      [
        service('Airport Transfer', '2027-10-31'),
        service('Osaka Tour', '2027-10-31'),
        service('Mt Fuji Tour', '2027-11-30'),
      ],
      null,
    );
    expect(validity.expiringServices).toEqual(['Airport Transfer', 'Osaka Tour']);
  });

  it('ignores services with no stated expiry when others have one', () => {
    const validity = quotationValidity(
      [service('Mt Fuji Tour', null), service('Airport Transfer', '2027-10-31')],
      null,
    );
    expect(validity.validUntil).toBe('2027-10-31');
    expect(validity.unknown).toBe(false);
  });

  it('reports unknown when nothing states an expiry', () => {
    const validity = quotationValidity([service('Mt Fuji Tour', null)], null);
    expect(validity).toMatchObject({ validUntil: null, label: null, unknown: true });
  });

  it('reports unknown for a quotation with no services yet', () => {
    expect(quotationValidity([], null).unknown).toBe(true);
  });

  it('flags a travel date after the rates expire', () => {
    const validity = quotationValidity([service('Airport Transfer', '2027-10-31')], '2027-12-20');
    expect(validity.travelDateOutside).toBe(true);
  });

  it('accepts a travel date on the last valid day', () => {
    const validity = quotationValidity([service('Airport Transfer', '2027-10-31')], '2027-10-31');
    expect(validity.travelDateOutside).toBe(false);
  });

  it('accepts a travel date inside the window', () => {
    expect(
      quotationValidity([service('Airport Transfer', '2027-10-31')], '2027-09-01')
        .travelDateOutside,
    ).toBe(false);
  });

  it('flags nothing when no travel date has been set', () => {
    expect(
      quotationValidity([service('Airport Transfer', '2027-10-31')], null).travelDateOutside,
    ).toBe(false);
    expect(
      quotationValidity([service('Airport Transfer', '2027-10-31')], '').travelDateOutside,
    ).toBe(false);
  });
});

describe('validityWarning', () => {
  it('warns about a December booking against October rates, and names the service', () => {
    const warning = validityWarning(
      quotationValidity([service('Airport Transfer', '2027-10-31')], '2027-12-20'),
    );
    expect(warning).toContain('OCTOBER 31, 2027');
    expect(warning).toContain('Airport Transfer');
    expect(warning).toContain('different rate');
  });

  it('says nothing when the travel date is inside the window', () => {
    expect(
      validityWarning(quotationValidity([service('Airport Transfer', '2027-10-31')], '2027-09-01')),
    ).toBeNull();
  });

  it('asks for a Valid until date when none is set at all', () => {
    const warning = validityWarning(quotationValidity([service('Mt Fuji Tour', null)], null));
    expect(warning).toContain('no stated expiry');
    expect(warning).toContain('Product Development');
  });
});
