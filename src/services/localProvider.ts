import { physicians, suppliers, trayInstruments, trays } from '@/data/referenceData';
import { getCurrentUser, setCurrentUser } from '@/lib/currentUser';
import { resolveAiConfirmation } from '@/features/repair/resolveAiConfirmation';
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
import type { DataProvider } from './dataProvider';

const LOCAL_USER_ID = 'local-device-user';

const SCAN_HISTORY_KEY = 'idm-mobile.scan-history.v1';
const AUDIT_LOG_KEY = 'idm-mobile.audit-log.v1';
const SUPPLIERS_KEY = 'idm-mobile.suppliers.v1';
const PHYSICIANS_KEY = 'idm-mobile.physicians.v1';
const TRAYS_KEY = 'idm-mobile.trays.v1';
const TRAY_INSTRUMENTS_KEY = 'idm-mobile.tray-instruments.v1';
const CASES_KEY = 'idm-mobile.cases.v1';
const REPAIR_CASES_KEY = 'idm-mobile.repair-cases.v1';

function readFromStorage<T>(key: string, fallback: T[]): T[] {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function writeToStorage<T>(key: string, value: T[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (e.g. private browsing quota) - fail silently,
    // the in-memory session state still works for the current visit.
  }
}

function normalizeIdentifier(value: string): string {
  return value.trim().toUpperCase().replace(/[\s_]+/g, '-');
}

/**
 * Default provider for local development and demo use, and the fallback
 * whenever Supabase credentials are not configured. Persists to
 * localStorage so edits, new suppliers/trays and case data survive a reload
 * during a shift. Suppliers/trays/instruments start from the seed data in
 * data/referenceData.ts on first run, then evolve independently.
 */
export class LocalDataProvider implements DataProvider {
  private scanHistory: ScanRecord[] = readFromStorage<ScanRecord>(SCAN_HISTORY_KEY, []);
  private auditLog: AuditLogEntry[] = readFromStorage<AuditLogEntry>(AUDIT_LOG_KEY, []);
  private suppliers: Supplier[] = readFromStorage<Supplier>(SUPPLIERS_KEY, suppliers);
  private physicians: Physician[] = readFromStorage<Physician>(PHYSICIANS_KEY, physicians);
  private trays: Tray[] = readFromStorage<Tray>(TRAYS_KEY, trays);
  private trayInstruments: TrayInstrument[] = readFromStorage<TrayInstrument>(
    TRAY_INSTRUMENTS_KEY,
    trayInstruments,
  );
  private cases: LoanCase[] = readFromStorage<LoanCase>(CASES_KEY, []);
  private repairCases: RepairCase[] = readFromStorage<RepairCase>(REPAIR_CASES_KEY, []);

  // ---------------------------------------------------------------------
  // Suppliers
  // ---------------------------------------------------------------------

  async getSuppliers(): Promise<Supplier[]> {
    return [...this.suppliers].sort((a, b) => a.name.localeCompare(b.name));
  }

  async getSupplier(id: string): Promise<Supplier | null> {
    return this.suppliers.find((s) => s.id === id) ?? null;
  }

  async createSupplier(input: SupplierInput): Promise<Supplier> {
    if (this.suppliers.some((s) => s.shortCode.toUpperCase() === input.shortCode.toUpperCase())) {
      throw new Error(`Kürzel „${input.shortCode}" wird bereits verwendet.`);
    }
    const supplier: Supplier = {
      id: crypto.randomUUID(),
      ...input,
      active: true,
      createdAt: new Date().toISOString(),
    };
    this.suppliers = [...this.suppliers, supplier];
    writeToStorage(SUPPLIERS_KEY, this.suppliers);
    return supplier;
  }

  async updateSupplier(id: string, input: SupplierInput): Promise<Supplier> {
    const existing = this.suppliers.find((s) => s.id === id);
    if (!existing) throw new Error('Lieferant nicht gefunden.');
    if (
      this.suppliers.some(
        (s) => s.id !== id && s.shortCode.toUpperCase() === input.shortCode.toUpperCase(),
      )
    ) {
      throw new Error(`Kürzel „${input.shortCode}" wird bereits verwendet.`);
    }
    const updated: Supplier = { ...existing, ...input };
    this.suppliers = this.suppliers.map((s) => (s.id === id ? updated : s));
    writeToStorage(SUPPLIERS_KEY, this.suppliers);
    return updated;
  }

  async setSupplierActive(id: string, active: boolean): Promise<Supplier> {
    const existing = this.suppliers.find((s) => s.id === id);
    if (!existing) throw new Error('Lieferant nicht gefunden.');
    const updated: Supplier = { ...existing, active };
    this.suppliers = this.suppliers.map((s) => (s.id === id ? updated : s));
    writeToStorage(SUPPLIERS_KEY, this.suppliers);
    return updated;
  }

  async deleteSupplier(id: string): Promise<void> {
    if (this.trays.some((t) => t.supplierId === id)) {
      throw new Error(
        'Lieferant wird noch von mindestens einem Sieb verwendet und kann nicht gelöscht werden. Stattdessen deaktivieren.',
      );
    }
    this.suppliers = this.suppliers.filter((s) => s.id !== id);
    writeToStorage(SUPPLIERS_KEY, this.suppliers);
  }

  // ---------------------------------------------------------------------
  // Physicians (Belegärzte/Operateure)
  // ---------------------------------------------------------------------

  async getPhysicians(): Promise<Physician[]> {
    return [...this.physicians].sort((a, b) => a.name.localeCompare(b.name));
  }

  async createPhysician(input: PhysicianInput): Promise<Physician> {
    const physician: Physician = {
      id: crypto.randomUUID(),
      ...input,
      createdAt: new Date().toISOString(),
    };
    this.physicians = [...this.physicians, physician];
    writeToStorage(PHYSICIANS_KEY, this.physicians);
    return physician;
  }

  // ---------------------------------------------------------------------
  // Trays
  // ---------------------------------------------------------------------

  async getTrays(): Promise<Tray[]> {
    return [...this.trays].sort((a, b) => a.code.localeCompare(b.code));
  }

  async findTrayByIdentifier(identifier: string): Promise<Tray | null> {
    const normalized = normalizeIdentifier(identifier);
    return (
      this.trays.find((tray) => {
        if (normalizeIdentifier(tray.code) === normalized) return true;
        return tray.aliases.some((alias) => normalizeIdentifier(alias) === normalized);
      }) ?? null
    );
  }

  async getTrayInstruments(trayId: string): Promise<TrayInstrument[]> {
    return this.trayInstruments
      .filter((instrument) => instrument.trayId === trayId)
      .sort((a, b) => a.position - b.position);
  }

  async createTray(input: TrayInput): Promise<Tray> {
    if (this.trays.some((t) => normalizeIdentifier(t.code) === normalizeIdentifier(input.code))) {
      throw new Error(`Sieb-Code „${input.code}" existiert bereits.`);
    }
    const now = new Date().toISOString();
    const tray: Tray = {
      id: crypto.randomUUID(),
      code: input.code,
      aliases: input.aliases,
      name: input.name,
      supplierId: input.supplierId,
      referencePhotoUrl: input.referencePhotoUrl,
      expectedInstrumentCount: sumQuantities(input.instruments),
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    this.trays = [...this.trays, tray];
    writeToStorage(TRAYS_KEY, this.trays);

    const instruments = buildInstrumentRows(tray.id, input.instruments);
    this.trayInstruments = [...this.trayInstruments, ...instruments];
    writeToStorage(TRAY_INSTRUMENTS_KEY, this.trayInstruments);

    return tray;
  }

  async updateTray(id: string, input: TrayInput): Promise<Tray> {
    const existing = this.trays.find((t) => t.id === id);
    if (!existing) throw new Error('Sieb nicht gefunden.');
    if (
      this.trays.some(
        (t) => t.id !== id && normalizeIdentifier(t.code) === normalizeIdentifier(input.code),
      )
    ) {
      throw new Error(`Sieb-Code „${input.code}" existiert bereits.`);
    }
    const updated: Tray = {
      ...existing,
      code: input.code,
      aliases: input.aliases,
      name: input.name,
      supplierId: input.supplierId,
      referencePhotoUrl: input.referencePhotoUrl,
      expectedInstrumentCount: sumQuantities(input.instruments),
      updatedAt: new Date().toISOString(),
    };
    this.trays = this.trays.map((t) => (t.id === id ? updated : t));
    writeToStorage(TRAYS_KEY, this.trays);

    this.trayInstruments = [
      ...this.trayInstruments.filter((i) => i.trayId !== id),
      ...buildInstrumentRows(id, input.instruments),
    ];
    writeToStorage(TRAY_INSTRUMENTS_KEY, this.trayInstruments);

    return updated;
  }

  // ---------------------------------------------------------------------
  // Scans
  // ---------------------------------------------------------------------

  async saveScan(scan: ScanRecord): Promise<ScanRecord> {
    const existingIndex = this.scanHistory.findIndex((s) => s.id === scan.id);
    if (existingIndex >= 0) {
      this.scanHistory[existingIndex] = scan;
    } else {
      this.scanHistory = [scan, ...this.scanHistory];
    }
    writeToStorage(SCAN_HISTORY_KEY, this.scanHistory);
    return scan;
  }

  async getScanHistory(): Promise<ScanRecord[]> {
    return [...this.scanHistory].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async getScan(id: string): Promise<ScanRecord | null> {
    return this.scanHistory.find((s) => s.id === id) ?? null;
  }

  // ---------------------------------------------------------------------
  // Audit log
  // ---------------------------------------------------------------------

  async appendAuditEntry(entry: AuditLogEntry): Promise<AuditLogEntry> {
    this.auditLog = [entry, ...this.auditLog];
    writeToStorage(AUDIT_LOG_KEY, this.auditLog);
    return entry;
  }

  async getAuditLog(): Promise<AuditLogEntry[]> {
    return [...this.auditLog].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  // ---------------------------------------------------------------------
  // Loaner cases (Vorher/Nachher-Vergleich)
  // ---------------------------------------------------------------------

  async createCase(input: {
    trayId: string;
    supplierId: string;
    intakeScanId: string;
    operationNote: string | null;
    operationDate: string | null;
    operateurId: string | null;
    performedBy: string;
  }): Promise<LoanCase> {
    const now = new Date().toISOString();
    const loanCase: LoanCase = {
      id: crypto.randomUUID(),
      trayId: input.trayId,
      supplierId: input.supplierId,
      status: 'outtake_pending',
      operationNote: input.operationNote,
      operationDate: input.operationDate,
      operateurId: input.operateurId,
      intakeScanId: input.intakeScanId,
      outtakeScanId: null,
      comparison: null,
      performedByIntake: input.performedBy,
      performedByOuttake: null,
      hygienePassportPhotoUrl: null,
      readinessNotifiedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.cases = [loanCase, ...this.cases];
    writeToStorage(CASES_KEY, this.cases);
    return loanCase;
  }

  async getCases(): Promise<LoanCase[]> {
    return [...this.cases].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async getCase(id: string): Promise<LoanCase | null> {
    return this.cases.find((c) => c.id === id) ?? null;
  }

  async getCasesBySupplier(supplierId: string): Promise<LoanCase[]> {
    return this.cases
      .filter((c) => c.supplierId === supplierId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async completeOuttake(caseId: string, outtakeScanId: string, comparison: CaseComparison): Promise<LoanCase> {
    const existing = this.cases.find((c) => c.id === caseId);
    if (!existing) throw new Error('Fall nicht gefunden.');
    const updated: LoanCase = {
      ...existing,
      status: 'compared',
      outtakeScanId,
      comparison,
      performedByOuttake: comparison.comparedBy,
      updatedAt: new Date().toISOString(),
    };
    this.cases = this.cases.map((c) => (c.id === caseId ? updated : c));
    writeToStorage(CASES_KEY, this.cases);
    return updated;
  }

  async notifySupplierReady(caseId: string, hygienePassportPhotoUrl: string): Promise<LoanCase> {
    const existing = this.cases.find((c) => c.id === caseId);
    if (!existing) throw new Error('Fall nicht gefunden.');
    // No real backend in local/mock mode - simulate the notification without
    // actually sending an e-mail (there is no Edge Function/Resend here).
    const updated: LoanCase = {
      ...existing,
      hygienePassportPhotoUrl,
      readinessNotifiedAt: new Date().toISOString(),
    };
    this.cases = this.cases.map((c) => (c.id === caseId ? updated : c));
    writeToStorage(CASES_KEY, this.cases);
    return updated;
  }

  // ---------------------------------------------------------------------
  // Reparatur (v2.2 Phase 2 - Repair Photo Foundation)
  // ---------------------------------------------------------------------

  async createRepairCase(input: RepairCaseInput): Promise<RepairCase> {
    const repairCase: RepairCase = {
      id: crypto.randomUUID(),
      trayId: input.trayId,
      supplierId: input.supplierId,
      instrumentName: input.instrumentName,
      refNumber: null,
      overviewPhotoUrl: input.overviewPhotoUrl,
      defectPhotoUrl: input.defectPhotoUrl,
      refPhotoUrl: input.refPhotoUrl,
      photoHash: input.photoHash,
      defectNote: input.defectNote,
      status: 'open',
      performedBy: input.performedBy,
      closedBy: null,
      createdAt: new Date().toISOString(),
      closedAt: null,
      aiSuggestion: null,
      aiConfirmation: null,
      confirmedBy: null,
      confirmedAt: null,
    };
    this.repairCases = [repairCase, ...this.repairCases];
    writeToStorage(REPAIR_CASES_KEY, this.repairCases);
    return repairCase;
  }

  async getRepairCases(): Promise<RepairCase[]> {
    return [...this.repairCases].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async getRepairCase(id: string): Promise<RepairCase | null> {
    return this.repairCases.find((r) => r.id === id) ?? null;
  }

  async closeRepairCase(id: string, closedBy: string): Promise<RepairCase> {
    const existing = this.repairCases.find((r) => r.id === id);
    if (!existing) throw new Error('Reparatur nicht gefunden.');
    const updated: RepairCase = { ...existing, status: 'closed', closedBy, closedAt: new Date().toISOString() };
    this.repairCases = this.repairCases.map((r) => (r.id === id ? updated : r));
    writeToStorage(REPAIR_CASES_KEY, this.repairCases);
    return updated;
  }

  async analyzeRepairCase(_id: string): Promise<RepairCase> {
    // No server/model to call in local/demo mode - never pretend a Cloud
    // Agent result exists without a real backend (see docs/roadmap/v2.2).
    throw new Error('KI-Analyse ist nur mit verbundenem Supabase-Projekt verfügbar.');
  }

  async confirmRepairAiSuggestion(
    id: string,
    action: AiConfirmationAction,
    override: { instrumentName?: string; refNumber?: string } | null,
    confirmedBy: string,
  ): Promise<RepairCase> {
    const existing = this.repairCases.find((r) => r.id === id);
    if (!existing) throw new Error('Reparatur nicht gefunden.');
    const resolved = resolveAiConfirmation(existing, existing.aiSuggestion, action, override);
    const updated: RepairCase = {
      ...existing,
      instrumentName: resolved.instrumentName,
      refNumber: resolved.refNumber,
      aiConfirmation: action,
      confirmedBy,
      confirmedAt: new Date().toISOString(),
    };
    this.repairCases = this.repairCases.map((r) => (r.id === id ? updated : r));
    writeToStorage(REPAIR_CASES_KEY, this.repairCases);
    return updated;
  }

  // ---------------------------------------------------------------------
  // Users / roles
  //
  // No real auth in local/mock mode - there is exactly one synthetic,
  // always-active admin account backed by the lightweight device identity
  // in lib/currentUser.ts, so every screen keeps working without a login.
  // ---------------------------------------------------------------------

  async getCurrentProfile(): Promise<UserProfile | null> {
    return this.syntheticProfile();
  }

  async listProfiles(): Promise<UserProfile[]> {
    return [this.syntheticProfile()];
  }

  async updateProfile(_id: string, input: UserProfileUpdateInput): Promise<UserProfile> {
    if (input.displayName !== undefined) setCurrentUser(input.displayName);
    return this.syntheticProfile();
  }

  private syntheticProfile(): UserProfile {
    return {
      id: LOCAL_USER_ID,
      email: 'lokal@idm-mobile.local',
      displayName: getCurrentUser(),
      role: 'admin',
      supplierId: null,
      active: true,
      createdAt: new Date(0).toISOString(),
    };
  }
}

function sumQuantities(instruments: { quantity: number }[]): number {
  return instruments.reduce((sum, i) => sum + i.quantity, 0);
}

function buildInstrumentRows(
  trayId: string,
  instruments: { name: string; quantity: number; critical: boolean }[],
): TrayInstrument[] {
  return instruments.map((instrument, index) => ({
    id: crypto.randomUUID(),
    trayId,
    name: instrument.name,
    quantity: instrument.quantity,
    position: index + 1,
    critical: instrument.critical,
    referenceImageUrl: null,
  }));
}
