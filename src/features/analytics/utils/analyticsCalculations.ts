/**
 * Pure KPI/report calculations for IDM Analytics (v2.2 Phase 5 - see
 * docs/roadmap/v2.2/MASTER-PROMPT-v2.2.md section 8/9/11/12). Every function
 * here takes already-loaded arrays (fetched once via the existing
 * dataProvider getters - see analyticsService.ts) plus a filter/reference
 * time, and returns deterministic numbers - no network/DOM access, so this
 * is fully unit-testable like the rest of the app's business logic.
 *
 * Deliberate scoping decisions (documented here rather than re-derived at
 * every call site):
 * - "offene X" (offene Faelle, offene Reparaturen) are always a CURRENT
 *   snapshot by status, never date-range-filtered - an old still-open case
 *   must not disappear just because it falls outside the chosen window.
 * - "aktive Leihsiebe" and Lieferanten "Siebe-Anzahl" are likewise current
 *   state (Tray.active / Tray.supplierId), not time-filtered.
 * - The FaelleKpis group (heute/7/30 Tage) always uses its own fixed
 *   windows anchored on `now`, independent of the page's chosen date
 *   filter preset - it is a fixed-reference overview, not a filtered report.
 * - Deviation sub-categories can overlap in principle (a line only ever
 *   belongs to one category here, but a single case can contribute to
 *   several categories) - "gesamt" is the count of deviating CASES, the
 *   four sub-categories are counts of deviation LINES, intentionally not
 *   required to sum to "gesamt".
 * - "nicht erkannt" maps to ScanRecord.status === 'unmatched' (the Sieb
 *   itself could not be recognised), since the checklist-based comparison
 *   has no per-instrument "unrecognised" category of its own.
 * - Wiederholungsreparaturen uses the spec's own default (repeat window)
 *   of 12 months, always anchored on `now`, independent of the chosen
 *   filter - matching docs section 11.
 * - "Defektarten" only counts human-CONFIRMED AI defect candidates
 *   (aiConfirmation === 'accepted'): an AI suggestion the human corrected,
 *   rejected or redirected to another instrument is explicitly not
 *   authoritative data (see docs section 12/13 and RepairAiSuggestion).
 * - Instrument Analytics (v2.2 Phase 6, docs section 10) groups by
 *   normalized instrument name, not REF: the app has no canonical
 *   instrument-master table yet, only free-text TrayInstrument.name /
 *   RepairCase.instrumentName. "Vorkommen" is the summed reference
 *   quantity across tray compositions, not a live scan count.
 * - Durchlaufzeiten (v2.2 Phase 6, docs section 8): Eingang->OP and
 *   OP->Ausgang are only computed over cases that have an operationDate -
 *   never invented. Eingang->Ausgang reuses the same population as
 *   LeihsiebeKpis.durchschnittlicheVerweildauerStunden.
 */

import type {
  CaseComparison,
  LoanCase,
  RepairCase,
  ScanRecord,
  Supplier,
  Tray,
  TrayInstrument,
} from '@/types/database';
import type {
  AbweichungenKpis,
  AnalyticsFilter,
  DateRange,
  InstrumentAnalyticsRow,
  LifecycleTimes,
  DefektartEntry,
  FaelleKpis,
  LeihsiebeKpis,
  ReparaturKpis,
  SupplierAnalyticsRow,
} from '../types/analytics';

const MS_PER_HOUR = 1000 * 60 * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;
const REPEAT_REPAIR_WINDOW_MONTHS = 12;

export function resolveDateRange(filter: Pick<AnalyticsFilter, 'preset' | 'customRange'>, now: Date): DateRange {
  const end = now.toISOString();
  switch (filter.preset) {
    case 'today': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { start: start.toISOString(), end };
    }
    case '7d':
      return { start: new Date(now.getTime() - 7 * MS_PER_DAY).toISOString(), end };
    case '30d':
      return { start: new Date(now.getTime() - 30 * MS_PER_DAY).toISOString(), end };
    case '90d':
      return { start: new Date(now.getTime() - 90 * MS_PER_DAY).toISOString(), end };
    case 'year':
      return { start: new Date(now.getFullYear(), 0, 1).toISOString(), end };
    case 'custom':
      return filter.customRange;
  }
}

export function isWithinRange(iso: string | null, range: DateRange): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (range.start && t < new Date(range.start).getTime()) return false;
  if (range.end && t > new Date(range.end).getTime()) return false;
  return true;
}

function matchesSupplier(supplierId: string | null, filterSupplierId: string | null): boolean {
  return !filterSupplierId || supplierId === filterSupplierId;
}

function hoursBetween(startIso: string, endIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / MS_PER_HOUR;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function computeLeihsiebeKpis(
  cases: LoanCase[],
  trays: Tray[],
  filter: Pick<AnalyticsFilter, 'preset' | 'customRange' | 'supplierId'>,
  now: Date,
): LeihsiebeKpis {
  const range = resolveDateRange(filter, now);
  const supplierCases = cases.filter((c) => matchesSupplier(c.supplierId, filter.supplierId));
  const eingaengeCases = supplierCases.filter((c) => isWithinRange(c.createdAt, range));
  const ausgaengeCases = supplierCases.filter((c) => c.comparison && isWithinRange(c.comparison.comparedAt, range));

  const verweildauern = ausgaengeCases.map((c) => hoursBetween(c.createdAt, c.comparison!.comparedAt));

  return {
    aktiveLeihsiebe: trays.filter((t) => t.active && matchesSupplier(t.supplierId, filter.supplierId)).length,
    eingaenge: eingaengeCases.length,
    ausgaenge: ausgaengeCases.length,
    offeneFaelle: supplierCases.filter((c) => c.status === 'outtake_pending').length,
    einsaetze: new Set(eingaengeCases.map((c) => c.trayId)).size,
    durchschnittlicheVerweildauerStunden: average(verweildauern),
  };
}

export function computeFaelleKpis(
  cases: LoanCase[],
  filter: Pick<AnalyticsFilter, 'supplierId'>,
  now: Date,
): FaelleKpis {
  const supplierCases = cases.filter((c) => matchesSupplier(c.supplierId, filter.supplierId));
  const today = resolveDateRange({ preset: 'today', customRange: { start: null, end: null } }, now);
  const last7 = resolveDateRange({ preset: '7d', customRange: { start: null, end: null } }, now);
  const last30 = resolveDateRange({ preset: '30d', customRange: { start: null, end: null } }, now);

  return {
    faelleHeute: supplierCases.filter((c) => isWithinRange(c.createdAt, today)).length,
    faelle7Tage: supplierCases.filter((c) => isWithinRange(c.createdAt, last7)).length,
    faelle30Tage: supplierCases.filter((c) => isWithinRange(c.createdAt, last30)).length,
    offeneFaelle: supplierCases.filter((c) => c.status === 'outtake_pending').length,
    abgeschlosseneFaelle: supplierCases.filter((c) => c.status === 'compared').length,
  };
}

function deviationCounts(comparison: CaseComparison) {
  const fehlende = comparison.instrumentDeltas.filter((d) => d.delta < 0 && d.outtakeQuantity === 0).length;
  const mengenabweichungen = comparison.instrumentDeltas.filter(
    (d) => d.delta !== 0 && d.outtakeQuantity > 0,
  ).length;
  const zusaetzliche = comparison.extraDeltas.filter((d) => d.outtakeQuantity > d.intakeQuantity).length;
  const falsche = comparison.substitutionSuggestions.length;
  return { fehlende, mengenabweichungen, zusaetzliche, falsche };
}

export function computeAbweichungenKpis(
  cases: LoanCase[],
  scans: ScanRecord[],
  filter: AnalyticsFilter,
  now: Date,
): AbweichungenKpis {
  const range = resolveDateRange(filter, now);
  const comparedInRange = cases.filter(
    (c) => matchesSupplier(c.supplierId, filter.supplierId) && c.comparison && isWithinRange(c.comparison.comparedAt, range),
  );

  let fehlendeInstrumente = 0;
  let mengenabweichungen = 0;
  let zusaetzlicheInstrumente = 0;
  let falscheInstrumente = 0;
  let gesamt = 0;

  for (const c of comparedInRange) {
    const counts = deviationCounts(c.comparison!);
    fehlendeInstrumente += counts.fehlende;
    mengenabweichungen += counts.mengenabweichungen;
    zusaetzlicheInstrumente += counts.zusaetzliche;
    falscheInstrumente += counts.falsche;
    if (c.comparison!.hasDeviations) gesamt += 1;
  }

  const nichtErkannt = scans.filter(
    (s) => s.status === 'unmatched' && matchesSupplier(s.supplierId, filter.supplierId) && isWithinRange(s.createdAt, range),
  ).length;

  return { gesamt, fehlendeInstrumente, zusaetzlicheInstrumente, falscheInstrumente, mengenabweichungen, nichtErkannt };
}

export function computeReparaturKpis(repairs: RepairCase[], filter: AnalyticsFilter, now: Date): ReparaturKpis {
  const range = resolveDateRange(filter, now);
  const supplierRepairs = repairs.filter((r) => matchesSupplier(r.supplierId, filter.supplierId));

  return {
    reparaturfaelle: supplierRepairs.filter((r) => isWithinRange(r.createdAt, range)).length,
    offeneReparaturen: supplierRepairs.filter((r) => r.status === 'open').length,
    abgeschlosseneReparaturen: supplierRepairs.filter((r) => r.status === 'closed' && isWithinRange(r.closedAt, range))
      .length,
    wiederholungsreparaturen: countRepeatRepairInstruments(supplierRepairs, now),
  };
}

export function countRepeatRepairInstruments(
  repairs: RepairCase[],
  now: Date,
  windowMonths: number = REPEAT_REPAIR_WINDOW_MONTHS,
): number {
  const windowStart = new Date(now);
  windowStart.setMonth(windowStart.getMonth() - windowMonths);
  const range: DateRange = { start: windowStart.toISOString(), end: now.toISOString() };

  const byKey = new Map<string, RepairCase[]>();
  for (const r of repairs) {
    if (!isWithinRange(r.createdAt, range)) continue;
    const key = (r.refNumber?.trim().toLowerCase() || r.instrumentName.trim().toLowerCase());
    const group = byKey.get(key) ?? [];
    group.push(r);
    byKey.set(key, group);
  }

  let repeatGroups = 0;
  for (const group of byKey.values()) {
    if (group.length >= 2) repeatGroups += 1;
  }
  return repeatGroups;
}

export function computeDefektarten(repairs: RepairCase[], filter: AnalyticsFilter, now: Date): DefektartEntry[] {
  const range = resolveDateRange(filter, now);
  const tally = new Map<string, number>();

  for (const r of repairs) {
    if (!matchesSupplier(r.supplierId, filter.supplierId)) continue;
    if (!isWithinRange(r.createdAt, range)) continue;
    if (r.aiConfirmation !== 'accepted' || !r.aiSuggestion) continue;
    for (const defekt of r.aiSuggestion.defectCandidates) {
      tally.set(defekt, (tally.get(defekt) ?? 0) + 1);
    }
  }

  return [...tally.entries()]
    .map(([defekt, anzahl]) => ({ defekt, anzahl }))
    .sort((a, b) => b.anzahl - a.anzahl);
}

export function computeSupplierAnalytics(
  suppliers: Supplier[],
  cases: LoanCase[],
  trays: Tray[],
  filter: AnalyticsFilter,
  now: Date,
): SupplierAnalyticsRow[] {
  const range = resolveDateRange(filter, now);
  const relevantSuppliers = filter.supplierId ? suppliers.filter((s) => s.id === filter.supplierId) : suppliers;

  return relevantSuppliers.map((s) => {
    const supplierCases = cases.filter((c) => c.supplierId === s.id);
    const casesInRange = supplierCases.filter((c) => isWithinRange(c.createdAt, range));
    const comparedInRange = supplierCases.filter((c) => c.comparison && isWithinRange(c.comparison.comparedAt, range));

    let fehlendeInstrumente = 0;
    let zusaetzlicheInstrumente = 0;
    let abweichungenAnzahl = 0;
    for (const c of comparedInRange) {
      const counts = deviationCounts(c.comparison!);
      fehlendeInstrumente += counts.fehlende;
      zusaetzlicheInstrumente += counts.zusaetzliche;
      if (c.comparison!.hasDeviations) abweichungenAnzahl += 1;
    }

    const verweildauern = comparedInRange.map((c) => hoursBetween(c.createdAt, c.comparison!.comparedAt));

    return {
      supplierId: s.id,
      supplierName: s.name,
      siebeAnzahl: trays.filter((t) => t.supplierId === s.id).length,
      faelleAnzahl: casesInRange.length,
      abweichungenAnzahl,
      fehlendeInstrumente,
      zusaetzlicheInstrumente,
      durchschnittlicheFalldauerStunden: average(verweildauern),
      offeneFaelle: supplierCases.filter((c) => c.status === 'outtake_pending').length,
    };
  });
}

function normalizeInstrumentName(name: string): string {
  return name.trim().toLowerCase();
}

function hasRepeatRepairsWithinWindow(
  repairs: RepairCase[],
  now: Date,
  windowMonths: number = REPEAT_REPAIR_WINDOW_MONTHS,
): boolean {
  const windowStart = new Date(now);
  windowStart.setMonth(windowStart.getMonth() - windowMonths);
  const range: DateRange = { start: windowStart.toISOString(), end: now.toISOString() };
  return repairs.filter((r) => isWithinRange(r.createdAt, range)).length >= 2;
}

export function computeInstrumentAnalytics(
  trays: Tray[],
  trayInstrumentsByTrayId: Map<string, TrayInstrument[]>,
  cases: LoanCase[],
  repairs: RepairCase[],
  filter: AnalyticsFilter,
  now: Date,
): InstrumentAnalyticsRow[] {
  const range = resolveDateRange(filter, now);
  const relevantTrays = trays.filter((t) => matchesSupplier(t.supplierId, filter.supplierId));

  const byKey = new Map<string, { name: string; vorkommen: number; trayIds: Set<string> }>();

  for (const tray of relevantTrays) {
    for (const instrument of trayInstrumentsByTrayId.get(tray.id) ?? []) {
      const key = normalizeInstrumentName(instrument.name);
      const acc = byKey.get(key) ?? { name: instrument.name, vorkommen: 0, trayIds: new Set<string>() };
      acc.vorkommen += instrument.quantity;
      acc.trayIds.add(tray.id);
      byKey.set(key, acc);
    }
  }

  const supplierRepairs = repairs.filter((r) => matchesSupplier(r.supplierId, filter.supplierId));
  for (const r of supplierRepairs) {
    const key = normalizeInstrumentName(r.instrumentName);
    if (!byKey.has(key)) byKey.set(key, { name: r.instrumentName, vorkommen: 0, trayIds: new Set<string>() });
  }

  const casesInRange = cases.filter(
    (c) => matchesSupplier(c.supplierId, filter.supplierId) && isWithinRange(c.createdAt, range),
  );
  const comparedInRange = cases.filter(
    (c) => matchesSupplier(c.supplierId, filter.supplierId) && c.comparison && isWithinRange(c.comparison.comparedAt, range),
  );

  const rows: InstrumentAnalyticsRow[] = [];
  for (const [key, acc] of byKey) {
    const faelleAnzahl = casesInRange.filter((c) => acc.trayIds.has(c.trayId)).length;

    let abweichungenAnzahl = 0;
    for (const c of comparedInRange) {
      abweichungenAnzahl += c.comparison!.instrumentDeltas.filter((d) => normalizeInstrumentName(d.name) === key).length;
      abweichungenAnzahl += c.comparison!.extraDeltas.filter((d) => normalizeInstrumentName(d.name) === key).length;
    }

    const instrumentRepairs = supplierRepairs.filter((r) => normalizeInstrumentName(r.instrumentName) === key);
    const reparaturenAnzahl = instrumentRepairs.filter((r) => isWithinRange(r.createdAt, range)).length;

    rows.push({
      key,
      name: acc.name,
      vorkommen: acc.vorkommen,
      faelleAnzahl,
      abweichungenAnzahl,
      reparaturenAnzahl,
      wiederholungsreparatur: hasRepeatRepairsWithinWindow(instrumentRepairs, now),
    });
  }

  return rows.sort((a, b) => b.vorkommen - a.vorkommen || a.name.localeCompare(b.name));
}

export function computeLifecycleTimes(cases: LoanCase[], filter: AnalyticsFilter, now: Date): LifecycleTimes {
  const range = resolveDateRange(filter, now);
  const comparedInRange = cases.filter(
    (c) => matchesSupplier(c.supplierId, filter.supplierId) && c.comparison && isWithinRange(c.comparison.comparedAt, range),
  );

  const eingangZuAusgang = comparedInRange.map((c) => hoursBetween(c.createdAt, c.comparison!.comparedAt));

  // Eingang->OP and OP->Ausgang need a plausible OP-Datum between Eingang and Ausgang -
  // never invented, and a mis-ordered timestamp is excluded rather than shown as a
  // misleading negative duration.
  const withPlausibleOp = comparedInRange.filter(
    (c) =>
      c.operationDate &&
      new Date(c.operationDate).getTime() >= new Date(c.createdAt).getTime() &&
      new Date(c.operationDate).getTime() <= new Date(c.comparison!.comparedAt).getTime(),
  );
  const eingangZuOp = withPlausibleOp.map((c) => hoursBetween(c.createdAt, c.operationDate!));
  const opZuAusgang = withPlausibleOp.map((c) => hoursBetween(c.operationDate!, c.comparison!.comparedAt));

  return {
    eingangZuOpStunden: average(eingangZuOp),
    opZuAusgangStunden: average(opZuAusgang),
    eingangZuAusgangStunden: average(eingangZuAusgang),
  };
}
