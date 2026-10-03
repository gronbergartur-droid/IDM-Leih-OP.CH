import type { AnalyticsAnswer, AnalyticsSnapshot } from '@/features/analytics/types/analytics';
import type {
  AiConfirmationAction,
  AuditLogEntry,
  CaseComparison,
  LoanCase,
  Physician,
  PhysicianInput,
  RepairCase,
  RepairCaseInput,
  ScanRecord,
  Supplier,
  SupplierInput,
  Tray,
  TrayInput,
  TrayInstrument,
  UserProfile,
  UserProfileUpdateInput,
} from '@/types/database';

/**
 * Storage/backend-agnostic contract used by every screen. Two implementations
 * exist: `LocalDataProvider` (in-memory + localStorage, used until a Supabase
 * project is provisioned) and `SupabaseDataProvider` (see supabaseProvider.ts,
 * mirrors the same methods 1:1 against Postgres tables + RLS).
 *
 * Screens must depend on this interface, never on a concrete provider, so the
 * swap in `services/index.ts` is the only place that needs to change.
 */
export interface DataProvider {
  getSuppliers(): Promise<Supplier[]>;
  getSupplier(id: string): Promise<Supplier | null>;
  createSupplier(input: SupplierInput): Promise<Supplier>;
  updateSupplier(id: string, input: SupplierInput): Promise<Supplier>;
  setSupplierActive(id: string, active: boolean): Promise<Supplier>;
  /** Rejects if the supplier is still referenced by any tray - deactivate instead. */
  deleteSupplier(id: string): Promise<void>;

  getPhysicians(): Promise<Physician[]>;
  createPhysician(input: PhysicianInput): Promise<Physician>;

  getTrays(): Promise<Tray[]>;
  /** Resolve a tray by its primary code or any of its known aliases (case-insensitive). */
  findTrayByIdentifier(identifier: string): Promise<Tray | null>;
  getTrayInstruments(trayId: string): Promise<TrayInstrument[]>;
  /** Every TrayInstrument row across every tray, in one call - for aggregations (e.g. Instrument-Analytics) that would otherwise need one request per tray. */
  getAllTrayInstruments(): Promise<TrayInstrument[]>;
  createTray(input: TrayInput): Promise<Tray>;
  updateTray(id: string, input: TrayInput): Promise<Tray>;

  saveScan(scan: ScanRecord): Promise<ScanRecord>;
  getScanHistory(): Promise<ScanRecord[]>;
  getScan(id: string): Promise<ScanRecord | null>;

  appendAuditEntry(entry: AuditLogEntry): Promise<AuditLogEntry>;
  getAuditLog(): Promise<AuditLogEntry[]>;

  /** Opens a new loaner case from a confirmed intake scan (already saved via saveScan). */
  createCase(input: {
    trayId: string;
    supplierId: string;
    intakeScanId: string;
    operationNote: string | null;
    operationDate: string | null;
    operateurId: string | null;
    performedBy: string;
  }): Promise<LoanCase>;
  getCases(): Promise<LoanCase[]>;
  getCase(id: string): Promise<LoanCase | null>;
  getCasesBySupplier(supplierId: string): Promise<LoanCase[]>;
  /** Attaches a confirmed outtake scan (already saved via saveScan) and its comparison to a case. */
  completeOuttake(caseId: string, outtakeScanId: string, comparison: CaseComparison): Promise<LoanCase>;
  /**
   * Attaches a freshly-photographed hygiene passport (sterilization batch
   * proof) and e-mails the supplier that the Sieb is ready for pickup. Only
   * meaningful once the case is 'compared' (after the outtake scan).
   */
  notifySupplierReady(caseId: string, hygienePassportPhotoUrl: string): Promise<LoanCase>;

  /** Reports a defective/damaged instrument - photo storage + UI only (v2.2 Phase 2). */
  createRepairCase(input: RepairCaseInput): Promise<RepairCase>;
  getRepairCases(): Promise<RepairCase[]>;
  getRepairCase(id: string): Promise<RepairCase | null>;
  closeRepairCase(id: string, closedBy: string): Promise<RepairCase>;
  /**
   * Runs the Cloud Agent (v2.2 Phase 3) over an already-reported repair
   * case's photos and stores its proposal on `aiSuggestion` - always
   * assistive, never applied automatically. Idempotent: if analysis has
   * already run for this case, returns the existing stored result rather
   * than calling the model again. Not available in local/demo mode (throws)
   * - the app must not pretend AI ran without a real backend.
   */
  analyzeRepairCase(id: string): Promise<RepairCase>;
  /**
   * Records a human's decision on a pending `aiSuggestion` and updates the
   * case's confirmed instrumentName/refNumber accordingly (see
   * resolveAiConfirmation.ts). The original aiSuggestion is never modified.
   */
  confirmRepairAiSuggestion(
    id: string,
    action: AiConfirmationAction,
    override: { instrumentName?: string; refNumber?: string } | null,
    confirmedBy: string,
  ): Promise<RepairCase>;

  /**
   * Cloud Agent Analytics (v2.2 Phase 7): answers a natural-language
   * question using ONLY the already-computed, already-aggregated KPI
   * numbers in `snapshot` (never raw case/scan/repair records - see
   * AnalyticsSnapshot). Not available in local/demo mode (throws) - the
   * app must not pretend a Cloud Agent answer exists without a real
   * backend.
   */
  askAnalyticsQuestion(question: string, snapshot: AnalyticsSnapshot): Promise<AnalyticsAnswer>;

  /** The authenticated caller's own profile (role, active status), or null if not signed in / not provisioned yet. */
  getCurrentProfile(): Promise<UserProfile | null>;
  /** All user accounts, for the admin-only Benutzerverwaltung screen. */
  listProfiles(): Promise<UserProfile[]>;
  /** Admin-only in practice (enforced by RLS): change a user's role/active/supplier assignment. */
  updateProfile(id: string, input: UserProfileUpdateInput): Promise<UserProfile>;
}
