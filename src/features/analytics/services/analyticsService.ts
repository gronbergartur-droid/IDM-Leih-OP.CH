import { dataProvider } from '@/services';
import type { LoanCase, RepairCase, ScanRecord, Supplier, Tray, TrayInstrument } from '@/types/database';

export interface AnalyticsData {
  suppliers: Supplier[];
  trays: Tray[];
  cases: LoanCase[];
  scans: ScanRecord[];
  repairCases: RepairCase[];
  /** All TrayInstrument rows, keyed by trayId - needed for Instrument Analytics (v2.2 Phase 6). */
  trayInstrumentsByTrayId: Map<string, TrayInstrument[]>;
}

/**
 * Loads every source table the analytics calculations need, via the same
 * `dataProvider` every other screen uses (see
 * docs/roadmap/v2.2/MASTER-PROMPT-v2.2.md section 15: "Do not bypass
 * dataProvider.ts from UI components"). All filtering/aggregation happens
 * afterwards in analyticsCalculations.ts, kept pure and independently
 * testable.
 */
export async function loadAnalyticsData(): Promise<AnalyticsData> {
  const [suppliers, trays, cases, scans, repairCases, allTrayInstruments] = await Promise.all([
    dataProvider.getSuppliers(),
    dataProvider.getTrays(),
    dataProvider.getCases(),
    dataProvider.getScanHistory(),
    dataProvider.getRepairCases(),
    // One request for every tray's instruments, instead of one request per
    // tray (getAllTrayInstruments) - avoids an N+1 fan-out that would scale
    // with the number of trays on every /analytics page view.
    dataProvider.getAllTrayInstruments(),
  ]);

  const trayInstrumentsByTrayId = new Map<string, TrayInstrument[]>();
  for (const instrument of allTrayInstruments) {
    const list = trayInstrumentsByTrayId.get(instrument.trayId) ?? [];
    list.push(instrument);
    trayInstrumentsByTrayId.set(instrument.trayId, list);
  }

  return { suppliers, trays, cases, scans, repairCases, trayInstrumentsByTrayId };
}
