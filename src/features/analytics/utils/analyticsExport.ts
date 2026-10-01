import ExcelJS from 'exceljs';
import type {
  AbweichungenKpis,
  FaelleKpis,
  InstrumentAnalyticsRow,
  LeihsiebeKpis,
  LifecycleTimes,
  ReparaturKpis,
  SupplierAnalyticsRow,
} from '../types/analytics';

export interface AnalyticsExportInput {
  filterLabel: string;
  leihsiebe: LeihsiebeKpis;
  faelle: FaelleKpis;
  abweichungen: AbweichungenKpis;
  reparatur: ReparaturKpis;
  lifecycle: LifecycleTimes;
  supplierRows: SupplierAnalyticsRow[];
  instrumentRows: InstrumentAnalyticsRow[];
}

/**
 * Builds a downloadable .xlsx snapshot of the Analytics dashboard (v2.2
 * Phase 6 "exports") - runs entirely client-side against whatever
 * analyticsCalculations.ts already computed, same "no new backend query
 * surface" approach as the monthly compliance archive
 * (see features/archive/generateMonthlyArchive.ts).
 */
export async function buildAnalyticsExport(input: AnalyticsExportInput): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  buildOverviewSheet(wb, input);
  buildSupplierSheet(wb, input.supplierRows);
  buildInstrumentSheet(wb, input.instrumentRows);
  return wb.xlsx.writeBuffer();
}

function h(hours: number | null): string {
  return hours === null ? 'N/A' : hours.toFixed(1);
}

function buildOverviewSheet(wb: ExcelJS.Workbook, input: AnalyticsExportInput): void {
  const sheet = wb.addWorksheet('Übersicht');
  sheet.columns = [
    { header: 'Kennzahl', key: 'label', width: 34 },
    { header: 'Wert', key: 'value', width: 16 },
  ];
  sheet.addRows([
    { label: 'Zeitraum', value: input.filterLabel },
    { label: '', value: '' },
    { label: 'Aktive Leihsiebe', value: input.leihsiebe.aktiveLeihsiebe },
    { label: 'Eingänge', value: input.leihsiebe.eingaenge },
    { label: 'Ausgänge', value: input.leihsiebe.ausgaenge },
    { label: 'Offene Fälle', value: input.leihsiebe.offeneFaelle },
    { label: 'Einsätze', value: input.leihsiebe.einsaetze },
    { label: 'Ø Verweildauer (h)', value: h(input.leihsiebe.durchschnittlicheVerweildauerStunden) },
    { label: '', value: '' },
    { label: 'Fälle heute', value: input.faelle.faelleHeute },
    { label: 'Fälle 7 Tage', value: input.faelle.faelle7Tage },
    { label: 'Fälle 30 Tage', value: input.faelle.faelle30Tage },
    { label: 'Fälle abgeschlossen', value: input.faelle.abgeschlosseneFaelle },
    { label: '', value: '' },
    { label: 'Abweichungen gesamt', value: input.abweichungen.gesamt },
    { label: 'Fehlende Instrumente', value: input.abweichungen.fehlendeInstrumente },
    { label: 'Zusätzliche Instrumente', value: input.abweichungen.zusaetzlicheInstrumente },
    { label: 'Falsche Instrumente', value: input.abweichungen.falscheInstrumente },
    { label: 'Mengenabweichungen', value: input.abweichungen.mengenabweichungen },
    { label: 'Nicht erkannt', value: input.abweichungen.nichtErkannt },
    { label: '', value: '' },
    { label: 'Reparaturfälle', value: input.reparatur.reparaturfaelle },
    { label: 'Offene Reparaturen', value: input.reparatur.offeneReparaturen },
    { label: 'Abgeschlossene Reparaturen', value: input.reparatur.abgeschlosseneReparaturen },
    { label: 'Wiederholungsreparaturen', value: input.reparatur.wiederholungsreparaturen },
    { label: '', value: '' },
    { label: 'Durchlaufzeit Eingang→OP (h)', value: h(input.lifecycle.eingangZuOpStunden) },
    { label: 'Durchlaufzeit OP→Ausgang (h)', value: h(input.lifecycle.opZuAusgangStunden) },
    { label: 'Durchlaufzeit Eingang→Ausgang (h)', value: h(input.lifecycle.eingangZuAusgangStunden) },
  ]);
}

function buildSupplierSheet(wb: ExcelJS.Workbook, rows: SupplierAnalyticsRow[]): void {
  const sheet = wb.addWorksheet('Lieferanten-Analytics');
  sheet.columns = [
    { header: 'Lieferant', key: 'name', width: 28 },
    { header: 'Siebe', key: 'siebe', width: 10 },
    { header: 'Fälle', key: 'faelle', width: 10 },
    { header: 'Abweichungen', key: 'abweichungen', width: 14 },
    { header: 'Fehlend', key: 'fehlend', width: 10 },
    { header: 'Zusätzlich', key: 'zusaetzlich', width: 12 },
    { header: 'Ø Falldauer (h)', key: 'falldauer', width: 16 },
    { header: 'Offene Fälle', key: 'offen', width: 12 },
  ];
  rows.forEach((r) =>
    sheet.addRow({
      name: r.supplierName,
      siebe: r.siebeAnzahl,
      faelle: r.faelleAnzahl,
      abweichungen: r.abweichungenAnzahl,
      fehlend: r.fehlendeInstrumente,
      zusaetzlich: r.zusaetzlicheInstrumente,
      falldauer: h(r.durchschnittlicheFalldauerStunden),
      offen: r.offeneFaelle,
    }),
  );
}

function buildInstrumentSheet(wb: ExcelJS.Workbook, rows: InstrumentAnalyticsRow[]): void {
  const sheet = wb.addWorksheet('Instrument-Analytics');
  sheet.columns = [
    { header: 'Instrument', key: 'name', width: 32 },
    { header: 'Vorkommen', key: 'vorkommen', width: 12 },
    { header: 'Fälle', key: 'faelle', width: 10 },
    { header: 'Abweichungen', key: 'abweichungen', width: 14 },
    { header: 'Reparaturen', key: 'reparaturen', width: 12 },
    { header: 'Wiederholungsreparatur', key: 'wiederholung', width: 20 },
  ];
  rows.forEach((r) =>
    sheet.addRow({
      name: r.name,
      vorkommen: r.vorkommen,
      faelle: r.faelleAnzahl,
      abweichungen: r.abweichungenAnzahl,
      reparaturen: r.reparaturenAnzahl,
      wiederholung: r.wiederholungsreparatur ? 'Ja' : 'Nein',
    }),
  );
}
