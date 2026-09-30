import type { ExtraInstrumentEntry, InstrumentCheckEntry } from '@/types/database';
import { describe, expect, it } from 'vitest';
import { compareCaseScans } from './comparison';

function check(overrides: Partial<InstrumentCheckEntry> = {}): InstrumentCheckEntry {
  return {
    instrumentId: 'instr-1',
    name: 'Schere',
    quantityExpected: 1,
    quantityConfirmed: 1,
    critical: false,
    userConfirmed: true,
    ...overrides,
  };
}

function extra(overrides: Partial<ExtraInstrumentEntry> = {}): ExtraInstrumentEntry {
  return {
    id: 'extra-1',
    name: 'Klemme',
    quantity: 1,
    note: null,
    ...overrides,
  };
}

describe('compareCaseScans', () => {
  it('reports no deviations when intake and outtake checklists match exactly', () => {
    const checks = [check()];
    const result = compareCaseScans({ instrumentChecks: checks, extraInstruments: [] }, { instrumentChecks: checks, extraInstruments: [] }, 'Tester');

    expect(result.hasDeviations).toBe(false);
    expect(result.instrumentDeltas).toHaveLength(0);
    expect(result.extraDeltas).toHaveLength(0);
    expect(result.comparedBy).toBe('Tester');
  });

  it('flags a missing instrument as a negative delta', () => {
    const intake = [check({ instrumentId: 'a', name: 'Schere', quantityConfirmed: 2 })];
    const outtake = [check({ instrumentId: 'a', name: 'Schere', quantityConfirmed: 1 })];

    const result = compareCaseScans({ instrumentChecks: intake, extraInstruments: [] }, { instrumentChecks: outtake, extraInstruments: [] }, 'Tester');

    expect(result.hasDeviations).toBe(true);
    expect(result.instrumentDeltas).toEqual([
      expect.objectContaining({ instrumentId: 'a', intakeQuantity: 2, outtakeQuantity: 1, delta: -1 }),
    ]);
  });

  it('treats an instrument entirely absent at outtake as fully missing (delta = -quantity)', () => {
    const intake = [check({ instrumentId: 'a', quantityConfirmed: 1 })];
    const outtake: InstrumentCheckEntry[] = [];

    const result = compareCaseScans({ instrumentChecks: intake, extraInstruments: [] }, { instrumentChecks: outtake, extraInstruments: [] }, 'Tester');

    expect(result.instrumentDeltas).toEqual([
      expect.objectContaining({ intakeQuantity: 1, outtakeQuantity: 0, delta: -1 }),
    ]);
  });

  it('reports a new extra instrument appearing only at outtake', () => {
    const outtake = [extra({ name: 'Neue Klemme', quantity: 1 })];

    const result = compareCaseScans({ instrumentChecks: [], extraInstruments: [] }, { instrumentChecks: [], extraInstruments: outtake }, 'Tester');

    expect(result.hasDeviations).toBe(true);
    expect(result.extraDeltas).toEqual([
      expect.objectContaining({ name: 'Neue Klemme', intakeQuantity: 0, outtakeQuantity: 1 }),
    ]);
  });

  it('does not report an extra instrument present unchanged at both ends', () => {
    const extras = [extra({ name: 'Klemme', quantity: 2 })];

    const result = compareCaseScans({ instrumentChecks: [], extraInstruments: extras }, { instrumentChecks: [], extraInstruments: extras }, 'Tester');

    expect(result.extraDeltas).toHaveLength(0);
  });

  it('suggests a substitution when a missing instrument name resembles a new extra', () => {
    const intake = [check({ instrumentId: 'a', name: 'Chirurgische Schere gerade', quantityConfirmed: 1 })];
    const outtake: InstrumentCheckEntry[] = [];
    const outtakeExtras = [extra({ name: 'Chirurgische Schere gebogen', quantity: 1 })];

    const result = compareCaseScans(
      { instrumentChecks: intake, extraInstruments: [] },
      { instrumentChecks: outtake, extraInstruments: outtakeExtras },
      'Tester',
    );

    expect(result.substitutionSuggestions.length).toBeGreaterThan(0);
    expect(result.substitutionSuggestions[0]).toEqual(
      expect.objectContaining({ missingName: 'Chirurgische Schere gerade', extraName: 'Chirurgische Schere gebogen' }),
    );
  });

  it('does not suggest a substitution for unrelated names', () => {
    const intake = [check({ instrumentId: 'a', name: 'Schere', quantityConfirmed: 1 })];
    const outtake: InstrumentCheckEntry[] = [];
    const outtakeExtras = [extra({ name: 'Elektrokabel', quantity: 1 })];

    const result = compareCaseScans(
      { instrumentChecks: intake, extraInstruments: [] },
      { instrumentChecks: outtake, extraInstruments: outtakeExtras },
      'Tester',
    );

    expect(result.substitutionSuggestions).toHaveLength(0);
  });
});
