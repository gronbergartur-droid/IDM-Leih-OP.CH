import type { RepairAiSuggestion } from '@/types/database';
import { describe, expect, it } from 'vitest';
import { resolveAiConfirmation } from './resolveAiConfirmation';

const suggestion: RepairAiSuggestion = {
  instrumentCandidate: 'Chirurgische Schere, gebogen',
  refCandidate: 'REF-123',
  defectCandidates: ['sichtbare Deformation'],
  confidence: 96,
  evidence: ['Form ähnlich', 'Hersteller passend'],
  model: 'claude-sonnet-5',
  analyzedAt: '2026-10-01T00:00:00.000Z',
};

const existing = { instrumentName: 'Unbekanntes Instrument', refNumber: null };

describe('resolveAiConfirmation', () => {
  it('accepted: copies the AI candidate values verbatim', () => {
    const result = resolveAiConfirmation(existing, suggestion, 'accepted', null);
    expect(result).toEqual({ instrumentName: 'Chirurgische Schere, gebogen', refNumber: 'REF-123' });
  });

  it('accepted with no suggestion on record: falls back to the existing values', () => {
    const result = resolveAiConfirmation(existing, null, 'accepted', null);
    expect(result).toEqual(existing);
  });

  it('corrected: uses the human-provided override', () => {
    const result = resolveAiConfirmation(existing, suggestion, 'corrected', {
      instrumentName: 'Schere, gerade',
      refNumber: 'REF-999',
    });
    expect(result).toEqual({ instrumentName: 'Schere, gerade', refNumber: 'REF-999' });
  });

  it('other_instrument: uses the human-provided override, same as corrected', () => {
    const result = resolveAiConfirmation(existing, suggestion, 'other_instrument', {
      instrumentName: 'Komplett anderes Instrument',
    });
    expect(result.instrumentName).toBe('Komplett anderes Instrument');
    expect(result.refNumber).toBeNull();
  });

  it('corrected with a blank instrument name override: keeps the existing name', () => {
    const result = resolveAiConfirmation(existing, suggestion, 'corrected', { instrumentName: '   ' });
    expect(result.instrumentName).toBe(existing.instrumentName);
  });

  it('rejected: keeps the existing values untouched, even with a suggestion present', () => {
    const result = resolveAiConfirmation(existing, suggestion, 'rejected', null);
    expect(result).toEqual(existing);
  });
});
