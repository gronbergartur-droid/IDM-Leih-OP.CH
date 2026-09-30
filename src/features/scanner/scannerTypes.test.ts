import { describe, expect, it } from 'vitest';
import { normalizeTrayIdentifier } from './scannerTypes';

describe('normalizeTrayIdentifier', () => {
  it('uppercases and trims the value', () => {
    expect(normalizeTrayIdentifier('  leih 04  ')).toBe('LEIH-04');
  });

  it('collapses internal whitespace/underscores into a single dash', () => {
    expect(normalizeTrayIdentifier('leih   04')).toBe('LEIH-04');
    expect(normalizeTrayIdentifier('leih_04')).toBe('LEIH-04');
    expect(normalizeTrayIdentifier('leih__04')).toBe('LEIH-04');
  });

  it('leaves an already-normalized full code unchanged', () => {
    expect(normalizeTrayIdentifier('SSW-LEIH-04-02')).toBe('SSW-LEIH-04-02');
  });
});
