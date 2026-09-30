import { describe, expect, it } from 'vitest';
import { formatGs1Date, hasGs1Fields, parseGs1ApplicationIdentifiers } from './gs1';

describe('parseGs1ApplicationIdentifiers', () => {
  it('parses gtin, ref, lot, serial and expiry from a full UDI string', () => {
    const fields = parseGs1ApplicationIdentifiers('(01)10886705012633(240)REF-123(10)LOT9(21)SER5(17)261231');
    expect(fields).toEqual({
      gtin: '10886705012633',
      ref: 'REF-123',
      lot: 'LOT9',
      serial: 'SER5',
      expiryDate: '261231',
    });
  });

  it('ignores application identifiers it does not recognize', () => {
    const fields = parseGs1ApplicationIdentifiers('(01)10886705012633(99)IGNORED-AI');
    expect(fields).toEqual({ gtin: '10886705012633' });
  });

  it('returns an empty object for text with no GS1 AIs', () => {
    expect(parseGs1ApplicationIdentifiers('kein GS1 hier')).toEqual({});
  });
});

describe('hasGs1Fields', () => {
  it('is true when at least one field is set', () => {
    expect(hasGs1Fields({ gtin: '123' })).toBe(true);
  });

  it('is false for an empty fields object', () => {
    expect(hasGs1Fields({})).toBe(false);
  });
});

describe('formatGs1Date', () => {
  it('formats a 6-digit YYMMDD value as DD.MM.20YY', () => {
    expect(formatGs1Date('261231')).toBe('31.12.2026');
  });

  it('returns null for a value that is not 6 digits', () => {
    expect(formatGs1Date('2612311')).toBeNull();
    expect(formatGs1Date('abc123')).toBeNull();
  });
});
