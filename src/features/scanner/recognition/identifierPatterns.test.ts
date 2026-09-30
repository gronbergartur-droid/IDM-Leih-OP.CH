import { describe, expect, it } from 'vitest';
import { dedupeCandidates, extractIdentifierCandidates } from './identifierPatterns';

describe('extractIdentifierCandidates', () => {
  it('extracts a full facility-LEIH-tray-variant code', () => {
    const candidates = extractIdentifierCandidates('Sieb SSW-LEIH-04-02 bitte pruefen', 'ocr', 0.8);
    expect(candidates).toEqual([{ value: 'SSW-LEIH-04-02', source: 'ocr', confidence: 0.8 }]);
  });

  it('extracts a short LEIH alias in its various spacing forms', () => {
    for (const text of ['LEIH 04', 'LEIH-04', 'LEIH04']) {
      const candidates = extractIdentifierCandidates(text, 'barcode', 1);
      expect(candidates).toEqual([{ value: 'LEIH 04', source: 'barcode', confidence: 0.85 }]);
    }
  });

  it('does not duplicate the short alias when the full code already matched', () => {
    const candidates = extractIdentifierCandidates('SSW-LEIH-04-02', 'ocr', 0.9);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].value).toBe('SSW-LEIH-04-02');
  });

  it('returns no candidates for unrelated text', () => {
    expect(extractIdentifierCandidates('Kein Sieb-Code hier', 'ocr', 0.5)).toHaveLength(0);
  });
});

describe('dedupeCandidates', () => {
  it('keeps the highest-confidence entry per normalized value', () => {
    const result = dedupeCandidates([
      { value: 'LEIH 04', source: 'ocr', confidence: 0.5 },
      { value: 'leih 04', source: 'barcode', confidence: 0.9 },
    ]);
    expect(result).toEqual([{ value: 'leih 04', source: 'barcode', confidence: 0.9 }]);
  });

  it('sorts results by descending confidence', () => {
    const result = dedupeCandidates([
      { value: 'A', source: 'ocr', confidence: 0.3 },
      { value: 'B', source: 'ocr', confidence: 0.9 },
      { value: 'C', source: 'ocr', confidence: 0.6 },
    ]);
    expect(result.map((c) => c.value)).toEqual(['B', 'C', 'A']);
  });
});
