import type {
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

  /** Reports a defective/damaged instrument - photo storage + UI only, no AI recognition yet (v2.2 Phase 2). */
  createRepairCase(input: RepairCaseInput): Promise<RepairCase>;
  getRepairCases(): Promise<RepairCase[]>;
  getRepairCase(id: string): Promise<RepairCase | null>;
  closeRepairCase(id: string, closedBy: string): Promise<RepairCase>;

  /** The authenticated caller's own profile (role, active status), or null if not signed in / not provisioned yet. */
  getCurrentProfile(): Promise<UserProfile | null>;
  /** All user accounts, for the admin-only Benutzerverwaltung screen. */
  listProfiles(): Promise<UserProfile[]>;
  /** Admin-only in practice (enforced by RLS): change a user's role/active/supplier assignment. */
  updateProfile(id: string, input: UserProfileUpdateInput): Promise<UserProfile>;
}
