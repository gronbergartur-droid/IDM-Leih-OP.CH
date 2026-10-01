import { describe, expect, it } from 'vitest';
import { confidenceTier } from './aiConfidence';

describe('confidenceTier', () => {
  it('is "strong" at and above 98', () => {
    expect(confidenceTier(98)).toBe('strong');
    expect(confidenceTier(100)).toBe('strong');
  });

  it('is "confirm" between 90 and 97', () => {
    expect(confidenceTier(90)).toBe('confirm');
    expect(confidenceTier(97)).toBe('confirm');
  });

  it('is "manual" below 90', () => {
    expect(confidenceTier(89)).toBe('manual');
    expect(confidenceTier(0)).toBe('manual');
  });
});
