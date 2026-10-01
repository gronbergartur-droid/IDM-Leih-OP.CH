import { dataProvider } from '@/services';
import type { LoanCase, RepairCase, ScanRecord, Supplier, Tray } from '@/types/database';

export interface AnalyticsData {
  suppliers: Supplier[];
  trays: Tray[];
  cases: LoanCase[];
  scans: ScanRecord[];
  repairCases: RepairCase[];
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
  const [suppliers, trays, cases, scans, repairCases] = await Promise.all([
    dataProvider.getSuppliers(),
    dataProvider.getTrays(),
    dataProvider.getCases(),
    dataProvider.getScanHistory(),
    dataProvider.getRepairCases(),
  ]);
  return { suppliers, trays, cases, scans, repairCases };
}
