/**
 * IDM Analytics (v2.2 Phase 5 - IDM Analytics MVP). Read-only reporting
 * types, computed client-side from the same dataProvider getters every
 * other screen uses (see docs/roadmap/v2.2/MASTER-PROMPT-v2.2.md section 8).
 */

export type DateRangePreset = 'today' | '7d' | '30d' | '90d' | 'year' | 'custom';

export interface DateRange {
  /** Inclusive, null = no lower bound (only possible for a malformed custom range). */
  start: string | null;
  /** Inclusive, null = no upper bound (open-ended "until now"). */
  end: string | null;
}

export interface AnalyticsFilter {
  preset: DateRangePreset;
  /** Only meaningful when preset === 'custom'. */
  customRange: DateRange;
  /** null = alle Lieferanten. */
  supplierId: string | null;
}

export interface LeihsiebeKpis {
  aktiveLeihsiebe: number;
  eingaenge: number;
  ausgaenge: number;
  offeneFaelle: number;
  einsaetze: number;
  /** Average Eingang->Ausgang duration in hours across compared cases with both timestamps - null if no data. */
  durchschnittlicheVerweildauerStunden: number | null;
}

export interface FaelleKpis {
  faelleHeute: number;
  faelle7Tage: number;
  faelle30Tage: number;
  offeneFaelle: number;
  abgeschlosseneFaelle: number;
}

export interface AbweichungenKpis {
  /** Number of cases with at least one deviation (CaseComparison.hasDeviations), within the filter. */
  gesamt: number;
  fehlendeInstrumente: number;
  zusaetzlicheInstrumente: number;
  falscheInstrumente: number;
  mengenabweichungen: number;
  nichtErkannt: number;
}

export interface ReparaturKpis {
  reparaturfaelle: number;
  offeneReparaturen: number;
  abgeschlosseneReparaturen: number;
  wiederholungsreparaturen: number;
}

export interface DefektartEntry {
  defekt: string;
  anzahl: number;
}

export interface SupplierAnalyticsRow {
  supplierId: string;
  supplierName: string;
  siebeAnzahl: number;
  faelleAnzahl: number;
  abweichungenAnzahl: number;
  fehlendeInstrumente: number;
  zusaetzlicheInstrumente: number;
  /** Hours, null if no compared case with both timestamps in this filter. */
  durchschnittlicheFalldauerStunden: number | null;
  offeneFaelle: number;
}

/**
 * Per-instrument (REF/article) analytics (v2.2 Phase 6 - Advanced
 * Analytics, docs section 10). Grouped by normalized instrument name since
 * the app has no canonical REF/instrument-master table yet - see
 * computeInstrumentAnalytics.
 */
export interface InstrumentAnalyticsRow {
  key: string;
  name: string;
  /** Total reference quantity across all tray compositions that include this instrument. */
  vorkommen: number;
  faelleAnzahl: number;
  abweichungenAnzahl: number;
  reparaturenAnzahl: number;
  /** True if this instrument had 2+ repair reports within the trailing 12 months (see docs section 11). */
  wiederholungsreparatur: boolean;
}

/** Eingang->OP->Ausgang lifecycle times (v2.2 Phase 6, docs section 8 "Durchlaufzeiten"). Hours, null = "Keine ausreichenden Daten". */
export interface LifecycleTimes {
  eingangZuOpStunden: number | null;
  opZuAusgangStunden: number | null;
  eingangZuAusgangStunden: number | null;
}

/**
 * Everything the Cloud Agent NL-query endpoint (v2.2 Phase 7, docs section
 * 13) is allowed to see and answer from - the same already-computed,
 * already-aggregated KPI results a human sees on screen, never raw
 * case/scan/repair records. This is the privacy/safety boundary: the model
 * can only quote numbers that exist in this object, never derive new ones
 * from source data it was never given.
 */
export interface AnalyticsSnapshot {
  filterLabel: string;
  leihsiebe: LeihsiebeKpis;
  faelle: FaelleKpis;
  abweichungen: AbweichungenKpis;
  reparatur: ReparaturKpis;
  lifecycle: LifecycleTimes;
  defektarten: DefektartEntry[];
  supplierRows: SupplierAnalyticsRow[];
  instrumentRows: InstrumentAnalyticsRow[];
}

/** Cloud Agent's answer to a natural-language question over an AnalyticsSnapshot - see docs section 13: "Every numeric answer must be traceable". */
export interface AnalyticsAnswer {
  answer: string;
  /** Which top-level AnalyticsSnapshot fields the answer was derived from, e.g. ["reparatur", "instrumentRows"]. */
  basis: string[];
}
