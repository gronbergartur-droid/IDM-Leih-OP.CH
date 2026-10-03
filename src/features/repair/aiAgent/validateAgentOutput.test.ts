import { describe, expect, it } from 'vitest';
import { validateAgentOutput } from './validateAgentOutput';

const validRaw = {
  instrumentCandidate: 'Metzenbaum-Schere, gebogen',
  refCandidate: 'REF-1234',
  defectCandidates: ['sichtbare Deformation', 'Korrosion'],
  confidence: 72,
  evidence: ['Form aehnlich bekannten Scheren'],
  uncertainties: ['Etikett teilweise verdeckt'],
  recommendedAction: 'HUMAN_REVIEW',
};

describe('validateAgentOutput', () => {
  it('accepts a well-formed response unchanged', () => {
    const result = validateAgentOutput(validRaw);
    expect(result).toEqual({
      instrumentCandidate: 'Metzenbaum-Schere, gebogen',
      refCandidate: 'REF-1234',
      defectCandidates: ['sichtbare Deformation', 'Korrosion'],
      confidence: 72,
      evidence: ['Form aehnlich bekannten Scheren'],
      uncertainties: ['Etikett teilweise verdeckt'],
      recommendedAction: 'HUMAN_REVIEW',
      recommendedActionAnomaly: null,
    });
  });

  it('rejects a response missing instrumentCandidate', () => {
    expect(validateAgentOutput({ ...validRaw, instrumentCandidate: undefined })).toBeNull();
  });

  it('rejects a response with a non-numeric confidence', () => {
    expect(validateAgentOutput({ ...validRaw, confidence: 'hoch' })).toBeNull();
  });

  it('clamps out-of-range confidence into 0..100', () => {
    expect(validateAgentOutput({ ...validRaw, confidence: 150 })?.confidence).toBe(100);
    expect(validateAgentOutput({ ...validRaw, confidence: -10 })?.confidence).toBe(0);
  });

  it.each(['APPROVE', 'REJECT', 'SAFE', 'UNSAFE', 'CLOSE_CASE'])(
    'forces recommendedAction to HUMAN_REVIEW even when the model returns %s, and records the anomaly',
    (attempted) => {
      const result = validateAgentOutput({ ...validRaw, recommendedAction: attempted });
      expect(result?.recommendedAction).toBe('HUMAN_REVIEW');
      expect(result?.recommendedActionAnomaly).toBe(attempted);
    },
  );

  it('reports no anomaly when the model correctly returns HUMAN_REVIEW', () => {
    expect(validateAgentOutput(validRaw)?.recommendedActionAnomaly).toBeNull();
  });

  it('reports no anomaly when recommendedAction is simply absent', () => {
    const { recommendedAction, ...withoutField } = validRaw;
    expect(validateAgentOutput(withoutField)?.recommendedActionAnomaly).toBeNull();
    void recommendedAction;
  });

  it('filters defectCandidates down to the fixed vocabulary', () => {
    const result = validateAgentOutput({ ...validRaw, defectCandidates: ['sichtbare Deformation', 'Sicherheitsrisiko', 42] });
    expect(result?.defectCandidates).toEqual(['sichtbare Deformation']);
  });

  it('drops non-string entries from evidence/uncertainties and caps their length', () => {
    const result = validateAgentOutput({
      ...validRaw,
      evidence: ['a', 'b', 'c', 'd', 'e', 'f', 42],
      uncertainties: [1, 'real caveat'],
    });
    expect(result?.evidence).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(result?.uncertainties).toEqual(['real caveat']);
  });

  it('normalizes a blank refCandidate to null', () => {
    expect(validateAgentOutput({ ...validRaw, refCandidate: '' })?.refCandidate).toBeNull();
    expect(validateAgentOutput({ ...validRaw, refCandidate: null })?.refCandidate).toBeNull();
  });

  it('rejects non-object input', () => {
    expect(validateAgentOutput(null)).toBeNull();
    expect(validateAgentOutput('not an object')).toBeNull();
    expect(validateAgentOutput(42)).toBeNull();
  });
});
