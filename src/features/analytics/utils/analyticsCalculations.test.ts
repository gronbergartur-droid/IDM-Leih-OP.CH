import type {
  CaseComparison,
  LoanCase,
  RepairCase,
  ScanRecord,
  Supplier,
  Tray,
  TrayInstrument,
} from '@/types/database';
import { describe, expect, it } from 'vitest';
import type { AnalyticsFilter } from '../types/analytics';
import {
  computeAbweichungenKpis,
  computeDefektarten,
  computeFaelleKpis,
  computeInstrumentAnalytics,
  computeLeihsiebeKpis,
  computeLifecycleTimes,
  computeReparaturKpis,
  computeSupplierAnalytics,
  countRepeatRepairInstruments,
  isWithinRange,
  resolveDateRange,
} from './analyticsCalculations';

const NOW = new Date('2026-06-15T12:00:00.000Z');

function baseFilter(overrides: Partial<AnalyticsFilter> = {}): AnalyticsFilter {
  return { preset: '30d', customRange: { start: null, end: null }, supplierId: null, ...overrides };
}

function comparison(overrides: Partial<CaseComparison> = {}): CaseComparison {
  return {
    instrumentDeltas: [],
    extraDeltas: [],
    substitutionSuggestions: [],
    hasDeviations: false,
    comparedAt: NOW.toISOString(),
    comparedBy: 'Tester',
    ...overrides,
  };
}

function loanCase(overrides: Partial<LoanCase> = {}): LoanCase {
  return {
    id: crypto.randomUUID(),
    trayId: 'tray-1',
    supplierId: 'supplier-1',
    status: 'outtake_pending',
    operationNote: null,
    operationDate: null,
    operateurId: null,
    intakeScanId: 'scan-in',
    outtakeScanId: null,
    comparison: null,
    performedByIntake: 'Tester',
    performedByOuttake: null,
    hygienePassportPhotoUrl: null,
    readinessNotifiedAt: null,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function tray(overrides: Partial<Tray> = {}): Tray {
  return {
    id: 'tray-1',
    code: 'SSW-01',
    aliases: [],
    name: 'Grundsieb',
    supplierId: 'supplier-1',
    referencePhotoUrl: null,
    expectedInstrumentCount: 10,
    active: true,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function supplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 'supplier-1',
    name: 'Muster AG',
    shortCode: 'MUS',
    location: null,
    specialties: [],
    loanServiceConfirmed: true,
    loanServiceNote: null,
    contactPhone: null,
    contactEmail: null,
    contactNote: null,
    source: null,
    logoUrl: null,
    active: true,
    createdAt: NOW.toISOString(),
    ...overrides,
  };
}

function scan(overrides: Partial<ScanRecord> = {}): ScanRecord {
  return {
    id: crypto.randomUUID(),
    trayId: 'tray-1',
    supplierId: 'supplier-1',
    caseId: null,
    capturedImageDataUrl: null,
    additionalImageDataUrls: [],
    recognition: null,
    matchedIdentifier: null,
    status: 'confirmed',
    expectedCount: 1,
    detectedCount: 1,
    instrumentChecks: [],
    extraInstruments: [],
    missingInstrumentIds: [],
    notes: null,
    operationDate: null,
    operateurId: null,
    performedBy: 'Tester',
    createdAt: NOW.toISOString(),
    confirmedAt: NOW.toISOString(),
    ...overrides,
  };
}

function repairCase(overrides: Partial<RepairCase> = {}): RepairCase {
  return {
    id: crypto.randomUUID(),
    trayId: null,
    supplierId: 'supplier-1',
    instrumentName: 'Schere',
    refNumber: null,
    overviewPhotoUrl: 'data:image/jpeg;base64,x',
    defectPhotoUrl: null,
    refPhotoUrl: null,
    photoHash: null,
    defectNote: 'Spitze verbogen',
    status: 'open',
    performedBy: 'Tester',
    closedBy: null,
    createdAt: NOW.toISOString(),
    closedAt: null,
    aiSuggestion: null,
    aiConfirmation: null,
    confirmedBy: null,
    confirmedAt: null,
    ...overrides,
  };
}

function trayInstrument(overrides: Partial<TrayInstrument> = {}): TrayInstrument {
  return {
    id: crypto.randomUUID(),
    trayId: 'tray-1',
    name: 'Schere',
    quantity: 1,
    position: 0,
    critical: false,
    referenceImageUrl: null,
    ...overrides,
  };
}

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe('resolveDateRange / isWithinRange', () => {
  it('resolves "today" to the start of the calendar day', () => {
    const range = resolveDateRange({ preset: 'today', customRange: { start: null, end: null } }, NOW);
    expect(new Date(range.start!).getHours()).toBe(0);
    expect(range.end).toBe(NOW.toISOString());
  });

  it('treats a null date as outside any range', () => {
    const range = resolveDateRange({ preset: '30d', customRange: { start: null, end: null } }, NOW);
    expect(isWithinRange(null, range)).toBe(false);
  });

  it('respects a custom range', () => {
    const filter = { preset: 'custom' as const, customRange: { start: daysAgo(10), end: daysAgo(5) } };
    const range = resolveDateRange(filter, NOW);
    expect(isWithinRange(daysAgo(7), range)).toBe(true);
    expect(isWithinRange(daysAgo(1), range)).toBe(false);
  });
});

describe('computeLeihsiebeKpis', () => {
  it('counts Eingaenge/Ausgaenge/offene Faelle/Einsaetze and ignores supplier mismatches', () => {
    const cases = [
      loanCase({ createdAt: daysAgo(2), status: 'outtake_pending' }),
      loanCase({
        trayId: 'tray-2',
        createdAt: daysAgo(3),
        status: 'compared',
        comparison: comparison({ comparedAt: daysAgo(1) }),
      }),
      loanCase({ supplierId: 'supplier-2', createdAt: daysAgo(2) }),
    ];
    const trays = [tray(), tray({ id: 'tray-2' }), tray({ id: 'tray-3', active: false })];

    const kpis = computeLeihsiebeKpis(cases, trays, baseFilter({ supplierId: 'supplier-1' }), NOW);

    expect(kpis.aktiveLeihsiebe).toBe(2);
    expect(kpis.eingaenge).toBe(2);
    expect(kpis.ausgaenge).toBe(1);
    expect(kpis.offeneFaelle).toBe(1);
    expect(kpis.einsaetze).toBe(2);
    expect(kpis.durchschnittlicheVerweildauerStunden).toBeCloseTo(48, 0);
  });

  it('reports null average dwell time when nothing was compared in range', () => {
    const kpis = computeLeihsiebeKpis([loanCase()], [tray()], baseFilter(), NOW);
    expect(kpis.durchschnittlicheVerweildauerStunden).toBeNull();
  });
});

describe('computeFaelleKpis', () => {
  it('uses fixed heute/7/30-Tage windows regardless of the main filter', () => {
    const cases = [
      loanCase({ createdAt: NOW.toISOString() }),
      loanCase({ createdAt: daysAgo(3) }),
      loanCase({ createdAt: daysAgo(20) }),
      loanCase({ createdAt: daysAgo(3), status: 'compared', comparison: comparison() }),
    ];
    const kpis = computeFaelleKpis(cases, { supplierId: null }, NOW);
    expect(kpis.faelleHeute).toBe(1);
    expect(kpis.faelle7Tage).toBe(3);
    expect(kpis.faelle30Tage).toBe(4);
    expect(kpis.offeneFaelle).toBe(3);
    expect(kpis.abgeschlosseneFaelle).toBe(1);
  });
});

describe('computeAbweichungenKpis', () => {
  it('tallies deviation sub-categories and counts deviating cases as gesamt', () => {
    const cases = [
      loanCase({
        status: 'compared',
        comparison: comparison({
          comparedAt: daysAgo(1),
          hasDeviations: true,
          instrumentDeltas: [
            { instrumentId: 'a', name: 'Schere', intakeQuantity: 1, outtakeQuantity: 0, delta: -1, critical: false },
            { instrumentId: 'b', name: 'Klemme', intakeQuantity: 2, outtakeQuantity: 1, delta: -1, critical: false },
          ],
          extraDeltas: [{ name: 'Unbekannt', intakeQuantity: 0, outtakeQuantity: 1 }],
          substitutionSuggestions: [
            { missingInstrumentId: 'a', missingName: 'Schere', extraName: 'Unbekannt', similarity: 0.5 },
          ],
        }),
      }),
      loanCase({
        status: 'compared',
        comparison: comparison({ comparedAt: daysAgo(1), hasDeviations: false }),
      }),
    ];
    const scans = [
      scan({ status: 'unmatched', createdAt: daysAgo(1) }),
      scan({ status: 'confirmed', createdAt: daysAgo(1) }),
    ];

    const kpis = computeAbweichungenKpis(cases, scans, baseFilter(), NOW);

    expect(kpis.gesamt).toBe(1);
    expect(kpis.fehlendeInstrumente).toBe(1);
    expect(kpis.mengenabweichungen).toBe(1);
    expect(kpis.zusaetzlicheInstrumente).toBe(1);
    expect(kpis.falscheInstrumente).toBe(1);
    expect(kpis.nichtErkannt).toBe(1);
  });
});

describe('computeReparaturKpis / countRepeatRepairInstruments', () => {
  it('counts open repairs as current state, independent of the date filter', () => {
    const repairs = [
      repairCase({ status: 'open', createdAt: daysAgo(400) }),
      repairCase({ status: 'closed', closedAt: daysAgo(5), createdAt: daysAgo(10) }),
    ];
    const kpis = computeReparaturKpis(repairs, baseFilter(), NOW);
    expect(kpis.offeneReparaturen).toBe(1);
    expect(kpis.abgeschlosseneReparaturen).toBe(1);
    expect(kpis.reparaturfaelle).toBe(1); // only the closed one falls within the default 30d filter
  });

  it('flags an instrument/REF with 2+ repairs within the trailing 12 months as a repeat', () => {
    const repairs = [
      repairCase({ refNumber: 'REF-1', createdAt: daysAgo(300) }),
      repairCase({ refNumber: 'REF-1', createdAt: daysAgo(10) }),
      repairCase({ refNumber: 'REF-2', createdAt: daysAgo(10) }),
    ];
    expect(countRepeatRepairInstruments(repairs, NOW)).toBe(1);
  });

  it('does not count a single old repair outside the 12-month window', () => {
    const repairs = [repairCase({ refNumber: 'REF-1', createdAt: daysAgo(400) })];
    expect(countRepeatRepairInstruments(repairs, NOW)).toBe(0);
  });
});

describe('computeDefektarten', () => {
  it('only counts accepted AI suggestions, never corrected/rejected ones', () => {
    const repairs = [
      repairCase({
        createdAt: daysAgo(1),
        aiConfirmation: 'accepted',
        aiSuggestion: {
          instrumentCandidate: 'Schere',
          refCandidate: null,
          defectCandidates: ['sichtbare Deformation'],
          confidence: 95,
          evidence: [],
          model: 'test',
          analyzedAt: daysAgo(1),
        },
      }),
      repairCase({
        createdAt: daysAgo(1),
        aiConfirmation: 'rejected',
        aiSuggestion: {
          instrumentCandidate: 'Klemme',
          refCandidate: null,
          defectCandidates: ['Korrosion'],
          confidence: 95,
          evidence: [],
          model: 'test',
          analyzedAt: daysAgo(1),
        },
      }),
    ];
    const result = computeDefektarten(repairs, baseFilter(), NOW);
    expect(result).toEqual([{ defekt: 'sichtbare Deformation', anzahl: 1 }]);
  });
});

describe('computeSupplierAnalytics', () => {
  it('reports per-supplier metrics without labelling suppliers good/bad', () => {
    const suppliers = [supplier(), supplier({ id: 'supplier-2', name: 'Andere AG' })];
    const trays = [tray(), tray({ id: 'tray-2', supplierId: 'supplier-2' })];
    const cases = [
      loanCase({ createdAt: daysAgo(2) }),
      loanCase({
        supplierId: 'supplier-2',
        status: 'compared',
        createdAt: daysAgo(3),
        comparison: comparison({ comparedAt: daysAgo(1), hasDeviations: true }),
      }),
    ];

    const rows = computeSupplierAnalytics(suppliers, cases, trays, baseFilter(), NOW);

    expect(rows).toHaveLength(2);
    const musterRow = rows.find((r) => r.supplierId === 'supplier-1')!;
    expect(musterRow.siebeAnzahl).toBe(1);
    expect(musterRow.faelleAnzahl).toBe(1);
    expect(musterRow.offeneFaelle).toBe(1);
    const andereRow = rows.find((r) => r.supplierId === 'supplier-2')!;
    expect(andereRow.abweichungenAnzahl).toBe(1);
    expect(andereRow.durchschnittlicheFalldauerStunden).toBeCloseTo(48, 0);
    expect(rows.every((r) => !('rating' in r) && !('score' in r))).toBe(true);
  });
});

describe('computeInstrumentAnalytics', () => {
  it('groups by normalized instrument name across trays, cases, deviations and repairs', () => {
    const trays = [tray(), tray({ id: 'tray-2' })];
    const trayInstrumentsByTrayId = new Map<string, ReturnType<typeof trayInstrument>[]>([
      ['tray-1', [trayInstrument({ name: 'Schere', quantity: 2 }), trayInstrument({ name: ' Klemme ', quantity: 1 })]],
      ['tray-2', [trayInstrument({ trayId: 'tray-2', name: 'schere', quantity: 3 })]],
    ]);
    const cases = [
      loanCase({ trayId: 'tray-1', createdAt: daysAgo(2) }),
      loanCase({
        trayId: 'tray-1',
        createdAt: daysAgo(3),
        status: 'compared',
        comparison: comparison({
          comparedAt: daysAgo(1),
          hasDeviations: true,
          instrumentDeltas: [
            { instrumentId: 'a', name: 'Schere', intakeQuantity: 2, outtakeQuantity: 1, delta: -1, critical: false },
          ],
        }),
      }),
    ];
    const repairs = [
      repairCase({ instrumentName: 'Schere', createdAt: daysAgo(1) }),
      repairCase({ instrumentName: 'Unbekanntes Teil', createdAt: daysAgo(1), trayId: null }),
    ];

    const rows = computeInstrumentAnalytics(trays, trayInstrumentsByTrayId, cases, repairs, baseFilter(), NOW);

    const schere = rows.find((r) => r.key === 'schere')!;
    expect(schere.vorkommen).toBe(5); // 2 (tray-1) + 3 (tray-2), case-insensitive/whitespace-insensitive match
    expect(schere.faelleAnzahl).toBe(2); // both cases use tray-1
    expect(schere.abweichungenAnzahl).toBe(1);
    expect(schere.reparaturenAnzahl).toBe(1);

    const klemme = rows.find((r) => r.key === 'klemme')!;
    expect(klemme.vorkommen).toBe(1);
    expect(klemme.faelleAnzahl).toBe(2);

    // A repaired instrument with no tray composition at all still appears, with vorkommen 0.
    const unbekannt = rows.find((r) => r.key === 'unbekanntes teil')!;
    expect(unbekannt.vorkommen).toBe(0);
    expect(unbekannt.reparaturenAnzahl).toBe(1);
  });

  it('flags an instrument as a repeat repair once it has 2+ reports within 12 months', () => {
    const trays = [tray()];
    const trayInstrumentsByTrayId = new Map([['tray-1', [trayInstrument({ name: 'Schere' })]]]);
    const repairs = [
      repairCase({ instrumentName: 'Schere', createdAt: daysAgo(300) }),
      repairCase({ instrumentName: 'Schere', createdAt: daysAgo(10) }),
    ];

    const rows = computeInstrumentAnalytics(trays, trayInstrumentsByTrayId, [], repairs, baseFilter(), NOW);
    expect(rows.find((r) => r.key === 'schere')!.wiederholungsreparatur).toBe(true);
  });
});

describe('computeLifecycleTimes', () => {
  it('computes Eingang->OP->Ausgang only for cases with a plausible OP-Datum, Eingang->Ausgang for all compared cases', () => {
    const cases = [
      loanCase({
        createdAt: daysAgo(4),
        operationDate: daysAgo(3),
        status: 'compared',
        comparison: comparison({ comparedAt: daysAgo(1) }),
      }),
      loanCase({
        createdAt: daysAgo(2),
        operationDate: null,
        status: 'compared',
        comparison: comparison({ comparedAt: daysAgo(1) }),
      }),
    ];

    const times = computeLifecycleTimes(cases, baseFilter(), NOW);
    expect(times.eingangZuAusgangStunden).not.toBeNull();
    expect(times.eingangZuOpStunden).toBeCloseTo(24, 0);
    expect(times.opZuAusgangStunden).toBeCloseTo(48, 0);
  });

  it('excludes an implausible OP-Datum (outside Eingang..Ausgang) rather than showing a negative duration', () => {
    const cases = [
      loanCase({
        createdAt: daysAgo(2),
        operationDate: daysAgo(5), // before Eingang - implausible
        status: 'compared',
        comparison: comparison({ comparedAt: daysAgo(1) }),
      }),
    ];
    const times = computeLifecycleTimes(cases, baseFilter(), NOW);
    expect(times.eingangZuOpStunden).toBeNull();
    expect(times.opZuAusgangStunden).toBeNull();
  });

  it('reports null (never invented) when there are no compared cases', () => {
    const times = computeLifecycleTimes([loanCase()], baseFilter(), NOW);
    expect(times.eingangZuOpStunden).toBeNull();
    expect(times.opZuAusgangStunden).toBeNull();
    expect(times.eingangZuAusgangStunden).toBeNull();
  });
});
