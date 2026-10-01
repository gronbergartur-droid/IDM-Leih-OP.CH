import type { AnalyticsAnswer, AnalyticsSnapshot } from '@/features/analytics/types/analytics';
import { resolveAiConfirmation } from '@/features/repair/resolveAiConfirmation';
import { supabase } from '@/lib/supabase/client';
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

/**
 * Backend for a provisioned Supabase project. Table/column names match
 * supabase/migrations/*.sql. Row <-> domain-type mapping is kept explicit
 * (snake_case <-> camelCase) rather than relying on generated types, so
 * this file stays the single place that needs updating if the schema
 * evolves.
 *
 * Not wired up by default (see services/index.ts) - activates once
 * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set and the migrations
 * have been applied.
 */
export class SupabaseDataProvider implements DataProvider {
  private get client() {
    if (!supabase) {
      throw new Error(
        'Supabase ist nicht konfiguriert. VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY setzen.',
      );
    }
    return supabase;
  }

  // ---------------------------------------------------------------------
  // Suppliers
  // ---------------------------------------------------------------------

  async getSuppliers(): Promise<Supplier[]> {
    const { data, error } = await this.client.from('suppliers').select('*').order('name');
    if (error) throw error;
    return (data ?? []).map(mapSupplierRow);
  }

  async getSupplier(id: string): Promise<Supplier | null> {
    const { data, error } = await this.client.from('suppliers').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? mapSupplierRow(data) : null;
  }

  async createSupplier(input: SupplierInput): Promise<Supplier> {
    const { data, error } = await this.client
      .from('suppliers')
      .insert(mapSupplierInputToRow(input))
      .select('*')
      .single();
    if (error) throw error;
    return mapSupplierRow(data);
  }

  async updateSupplier(id: string, input: SupplierInput): Promise<Supplier> {
    const { data, error } = await this.client
      .from('suppliers')
      .update(mapSupplierInputToRow(input))
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return mapSupplierRow(data);
  }

  async setSupplierActive(id: string, active: boolean): Promise<Supplier> {
    const { data, error } = await this.client
      .from('suppliers')
      .update({ active })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return mapSupplierRow(data);
  }

  async deleteSupplier(id: string): Promise<void> {
    const { count } = await this.client
      .from('trays')
      .select('id', { count: 'exact', head: true })
      .eq('supplier_id', id);
    if (count && count > 0) {
      throw new Error(
        'Lieferant wird noch von mindestens einem Sieb verwendet und kann nicht gelöscht werden. Stattdessen deaktivieren.',
      );
    }
    const { error } = await this.client.from('suppliers').delete().eq('id', id);
    if (error) throw error;
  }

  // ---------------------------------------------------------------------
  // Physicians (Belegärzte/Operateure)
  // ---------------------------------------------------------------------

  async getPhysicians(): Promise<Physician[]> {
    const { data, error } = await this.client.from('physicians').select('*').order('name');
    if (error) throw error;
    return (data ?? []).map(mapPhysicianRow);
  }

  async createPhysician(input: PhysicianInput): Promise<Physician> {
    const { data, error } = await this.client
      .from('physicians')
      .insert(mapPhysicianInputToRow(input))
      .select('*')
      .single();
    if (error) throw error;
    return mapPhysicianRow(data);
  }

  // ---------------------------------------------------------------------
  // Trays
  // ---------------------------------------------------------------------

  async getTrays(): Promise<Tray[]> {
    const { data, error } = await this.client.from('trays').select('*').order('code');
    if (error) throw error;
    return (data ?? []).map(mapTrayRow);
  }

  async findTrayByIdentifier(identifier: string): Promise<Tray | null> {
    // Two safe, separately-escaped queries instead of interpolating the
    // (OCR/user-entered) identifier into a raw PostgREST filter string -
    // that string is a plausible injection/malformed-filter vector since it
    // can contain commas, braces or other filter-syntax characters.
    const normalized = identifier.trim().toUpperCase();

    const { data: byCode, error: codeError } = await this.client
      .from('trays')
      .select('*')
      .ilike('code', normalized)
      .limit(1)
      .maybeSingle();
    if (codeError) throw codeError;
    if (byCode) return mapTrayRow(byCode);

    const { data: byAlias, error: aliasError } = await this.client
      .from('trays')
      .select('*')
      .contains('aliases', [normalized])
      .limit(1)
      .maybeSingle();
    if (aliasError) throw aliasError;
    return byAlias ? mapTrayRow(byAlias) : null;
  }

  async getTrayInstruments(trayId: string): Promise<TrayInstrument[]> {
    const { data, error } = await this.client
      .from('tray_instruments')
      .select('*')
      .eq('tray_id', trayId)
      .order('position');
    if (error) throw error;
    return (data ?? []).map(mapInstrumentRow);
  }

  async createTray(input: TrayInput): Promise<Tray> {
    const { data, error } = await this.client
      .from('trays')
      .insert(mapTrayInputToRow(input))
      .select('*')
      .single();
    if (error) throw error;
    const tray = mapTrayRow(data);

    const { error: instrumentsError } = await this.client
      .from('tray_instruments')
      .insert(mapInstrumentInputsToRows(tray.id, input.instruments));
    if (instrumentsError) throw instrumentsError;

    return tray;
  }

  async updateTray(id: string, input: TrayInput): Promise<Tray> {
    const { data, error } = await this.client
      .from('trays')
      .update(mapTrayInputToRow(input))
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    const tray = mapTrayRow(data);

    const { error: deleteError } = await this.client.from('tray_instruments').delete().eq('tray_id', id);
    if (deleteError) throw deleteError;
    const { error: insertError } = await this.client
      .from('tray_instruments')
      .insert(mapInstrumentInputsToRows(id, input.instruments));
    if (insertError) throw insertError;

    return tray;
  }

  // ---------------------------------------------------------------------
  // Scans
  // ---------------------------------------------------------------------

  async saveScan(scan: ScanRecord): Promise<ScanRecord> {
    const { data, error } = await this.client
      .from('scans')
      .upsert(mapScanToRow(scan))
      .select('*')
      .single();
    if (error) throw error;
    return mapScanRow(data);
  }

  async getScanHistory(): Promise<ScanRecord[]> {
    const { data, error } = await this.client
      .from('scans')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapScanRow);
  }

  async getScan(id: string): Promise<ScanRecord | null> {
    const { data, error } = await this.client.from('scans').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? mapScanRow(data) : null;
  }

  // ---------------------------------------------------------------------
  // Audit log
  // ---------------------------------------------------------------------

  async appendAuditEntry(entry: AuditLogEntry): Promise<AuditLogEntry> {
    const { data, error } = await this.client
      .from('audit_log')
      .insert(mapAuditToRow(entry))
      .select('*')
      .single();
    if (error) throw error;
    return mapAuditRow(data);
  }

  async getAuditLog(): Promise<AuditLogEntry[]> {
    const { data, error } = await this.client
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapAuditRow);
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
    const { data, error } = await this.client
      .from('loan_cases')
      .insert({
        tray_id: input.trayId,
        supplier_id: input.supplierId,
        status: 'outtake_pending',
        operation_note: input.operationNote,
        operation_date: input.operationDate,
        operateur_id: input.operateurId,
        intake_scan_id: input.intakeScanId,
        performed_by_intake: input.performedBy,
      })
      .select('*')
      .single();
    if (error) throw error;
    return mapCaseRow(data);
  }

  async getCases(): Promise<LoanCase[]> {
    const { data, error } = await this.client
      .from('loan_cases')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapCaseRow);
  }

  async getCase(id: string): Promise<LoanCase | null> {
    const { data, error } = await this.client.from('loan_cases').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? mapCaseRow(data) : null;
  }

  async getCasesBySupplier(supplierId: string): Promise<LoanCase[]> {
    const { data, error } = await this.client
      .from('loan_cases')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapCaseRow);
  }

  async completeOuttake(caseId: string, outtakeScanId: string, comparison: CaseComparison): Promise<LoanCase> {
    const { data, error } = await this.client
      .from('loan_cases')
      .update({
        status: 'compared',
        outtake_scan_id: outtakeScanId,
        comparison,
        performed_by_outtake: comparison.comparedBy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', caseId)
      .select('*')
      .single();
    if (error) throw error;
    return mapCaseRow(data);
  }

  async notifySupplierReady(caseId: string, hygienePassportPhotoUrl: string): Promise<LoanCase> {
    const { data, error } = await this.client.functions.invoke('send-sieb-ready-email', {
      body: { caseId, hygienePassportPhotoDataUrl: hygienePassportPhotoUrl },
    });
    if (error) {
      // Edge Function errors carry the JSON body (incl. our German message) on error.context.
      const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
      throw new Error(detail?.error ?? error.message);
    }
    return mapCaseRow(data);
  }

  // ---------------------------------------------------------------------
  // Reparatur (v2.2 Phase 2 - Repair Photo Foundation)
  // ---------------------------------------------------------------------

  async createRepairCase(input: RepairCaseInput): Promise<RepairCase> {
    const { data, error } = await this.client
      .from('repair_cases')
      .insert({
        tray_id: input.trayId,
        supplier_id: input.supplierId,
        instrument_name: input.instrumentName,
        overview_photo_url: input.overviewPhotoUrl,
        defect_photo_url: input.defectPhotoUrl,
        ref_photo_url: input.refPhotoUrl,
        photo_hash: input.photoHash,
        defect_note: input.defectNote,
        performed_by: input.performedBy,
      })
      .select('*')
      .single();
    if (error) throw error;
    return mapRepairCaseRow(data);
  }

  async getRepairCases(): Promise<RepairCase[]> {
    const { data, error } = await this.client
      .from('repair_cases')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRepairCaseRow);
  }

  async getRepairCase(id: string): Promise<RepairCase | null> {
    const { data, error } = await this.client.from('repair_cases').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? mapRepairCaseRow(data) : null;
  }

  async closeRepairCase(id: string, closedBy: string): Promise<RepairCase> {
    const { data, error } = await this.client
      .from('repair_cases')
      .update({ status: 'closed', closed_by: closedBy, closed_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return mapRepairCaseRow(data);
  }

  async analyzeRepairCase(id: string): Promise<RepairCase> {
    const { data, error } = await this.client.functions.invoke('analyze-repair-photo', {
      body: { repairCaseId: id },
    });
    if (error) {
      // Edge Function errors carry the JSON body (incl. our German message) on error.context.
      const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
      throw new Error(detail?.error ?? error.message);
    }
    return mapRepairCaseRow(data);
  }

  async confirmRepairAiSuggestion(
    id: string,
    action: AiConfirmationAction,
    override: { instrumentName?: string; refNumber?: string } | null,
    confirmedBy: string,
  ): Promise<RepairCase> {
    const existing = await this.getRepairCase(id);
    if (!existing) throw new Error('Reparatur nicht gefunden.');
    const resolved = resolveAiConfirmation(existing, existing.aiSuggestion, action, override ?? null);
    const { data, error } = await this.client
      .from('repair_cases')
      .update({
        instrument_name: resolved.instrumentName,
        ref_number: resolved.refNumber,
        ai_confirmation: action,
        confirmed_by: confirmedBy,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return mapRepairCaseRow(data);
  }

  async askAnalyticsQuestion(question: string, snapshot: AnalyticsSnapshot): Promise<AnalyticsAnswer> {
    const { data, error } = await this.client.functions.invoke('analytics-query', {
      body: { question, snapshot },
    });
    if (error) {
      const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
      throw new Error(detail?.error ?? error.message);
    }
    return data;
  }

  // ---------------------------------------------------------------------
  // Users / roles
  // ---------------------------------------------------------------------

  async getCurrentProfile(): Promise<UserProfile | null> {
    const {
      data: { user },
    } = await this.client.auth.getUser();
    if (!user) return null;
    const { data, error } = await this.client.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    return data ? mapProfileRow(data) : null;
  }

  async listProfiles(): Promise<UserProfile[]> {
    const { data, error } = await this.client.from('profiles').select('*').order('created_at');
    if (error) throw error;
    return (data ?? []).map(mapProfileRow);
  }

  async updateProfile(id: string, input: UserProfileUpdateInput): Promise<UserProfile> {
    const patch: Record<string, unknown> = {};
    if (input.displayName !== undefined) patch.display_name = input.displayName;
    if (input.role !== undefined) patch.role = input.role;
    if (input.supplierId !== undefined) patch.supplier_id = input.supplierId;
    if (input.active !== undefined) patch.active = input.active;

    const { data, error } = await this.client.from('profiles').update(patch).eq('id', id).select('*').single();
    if (error) throw error;
    return mapProfileRow(data);
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase row shapes come from the DB, not TS */

function mapSupplierRow(row: any): Supplier {
  return {
    id: row.id,
    name: row.name,
    shortCode: row.short_code,
    location: row.location,
    specialties: row.specialties ?? [],
    loanServiceConfirmed: row.loan_service_confirmed,
    loanServiceNote: row.loan_service_note,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    contactNote: row.contact_note,
    source: row.source,
    logoUrl: row.logo_url,
    active: row.active,
    createdAt: row.created_at,
  };
}

function mapSupplierInputToRow(input: SupplierInput) {
  return {
    name: input.name,
    short_code: input.shortCode,
    location: input.location,
    specialties: input.specialties,
    loan_service_confirmed: input.loanServiceConfirmed,
    loan_service_note: input.loanServiceNote,
    contact_phone: input.contactPhone,
    contact_email: input.contactEmail,
    contact_note: input.contactNote,
    source: input.source,
    logo_url: input.logoUrl,
  };
}

function mapPhysicianRow(row: any): Physician {
  return {
    id: row.id,
    name: row.name,
    department: row.department,
    mobilePhone: row.mobile_phone,
    practicePhone: row.practice_phone,
    email: row.email,
    createdAt: row.created_at,
  };
}

function mapPhysicianInputToRow(input: PhysicianInput) {
  return {
    name: input.name,
    department: input.department,
    mobile_phone: input.mobilePhone,
    practice_phone: input.practicePhone,
    email: input.email,
  };
}

function mapTrayRow(row: any): Tray {
  return {
    id: row.id,
    code: row.code,
    aliases: row.aliases ?? [],
    name: row.name,
    supplierId: row.supplier_id,
    referencePhotoUrl: row.reference_photo_url,
    expectedInstrumentCount: row.expected_instrument_count,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTrayInputToRow(input: TrayInput) {
  return {
    code: input.code,
    aliases: input.aliases,
    name: input.name,
    supplier_id: input.supplierId,
    reference_photo_url: input.referencePhotoUrl,
    expected_instrument_count: input.instruments.reduce((sum, i) => sum + i.quantity, 0),
  };
}

function mapInstrumentInputsToRows(trayId: string, instruments: TrayInput['instruments']) {
  return instruments.map((instrument, index) => ({
    tray_id: trayId,
    name: instrument.name,
    quantity: instrument.quantity,
    position: index + 1,
    critical: instrument.critical,
  }));
}

function mapInstrumentRow(row: any): TrayInstrument {
  return {
    id: row.id,
    trayId: row.tray_id,
    name: row.name,
    quantity: row.quantity,
    position: row.position,
    critical: row.critical,
    referenceImageUrl: row.reference_image_url,
  };
}

function mapScanRow(row: any): ScanRecord {
  return {
    id: row.id,
    trayId: row.tray_id,
    supplierId: row.supplier_id,
    caseId: row.case_id,
    capturedImageDataUrl: row.captured_image_url,
    additionalImageDataUrls: row.additional_image_urls ?? [],
    recognition: row.recognition,
    matchedIdentifier: row.matched_identifier,
    status: row.status,
    expectedCount: row.expected_count,
    detectedCount: row.detected_count,
    instrumentChecks: row.instrument_checks ?? [],
    extraInstruments: row.extra_instruments ?? [],
    missingInstrumentIds: row.missing_instrument_ids ?? [],
    notes: row.notes,
    operationDate: row.operation_date,
    operateurId: row.operateur_id,
    performedBy: row.performed_by,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
  };
}

function mapScanToRow(scan: ScanRecord) {
  return {
    id: scan.id,
    tray_id: scan.trayId,
    supplier_id: scan.supplierId,
    case_id: scan.caseId,
    // Large captured images belong in Supabase Storage in production; this
    // column is a placeholder for a storage object path/URL, not a base64 blob.
    captured_image_url: scan.capturedImageDataUrl,
    additional_image_urls: scan.additionalImageDataUrls,
    recognition: scan.recognition,
    matched_identifier: scan.matchedIdentifier,
    status: scan.status,
    expected_count: scan.expectedCount,
    detected_count: scan.detectedCount,
    instrument_checks: scan.instrumentChecks,
    extra_instruments: scan.extraInstruments,
    missing_instrument_ids: scan.missingInstrumentIds,
    notes: scan.notes,
    operation_date: scan.operationDate,
    operateur_id: scan.operateurId,
    performed_by: scan.performedBy,
    created_at: scan.createdAt,
    confirmed_at: scan.confirmedAt,
  };
}

function mapAuditRow(row: any): AuditLogEntry {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    performedBy: row.performed_by,
    details: row.details ?? {},
    createdAt: row.created_at,
  };
}

function mapAuditToRow(entry: AuditLogEntry) {
  return {
    id: entry.id,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    action: entry.action,
    performed_by: entry.performedBy,
    details: entry.details,
    created_at: entry.createdAt,
  };
}

function mapProfileRow(row: any): UserProfile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    supplierId: row.supplier_id,
    active: row.active,
    createdAt: row.created_at,
  };
}

function mapCaseRow(row: any): LoanCase {
  return {
    id: row.id,
    trayId: row.tray_id,
    supplierId: row.supplier_id,
    status: row.status,
    operationNote: row.operation_note,
    operationDate: row.operation_date,
    operateurId: row.operateur_id,
    intakeScanId: row.intake_scan_id,
    outtakeScanId: row.outtake_scan_id,
    comparison: row.comparison,
    performedByIntake: row.performed_by_intake,
    performedByOuttake: row.performed_by_outtake,
    hygienePassportPhotoUrl: row.hygiene_passport_photo_url,
    readinessNotifiedAt: row.readiness_notified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRepairCaseRow(row: any): RepairCase {
  return {
    id: row.id,
    trayId: row.tray_id,
    supplierId: row.supplier_id,
    instrumentName: row.instrument_name,
    refNumber: row.ref_number,
    overviewPhotoUrl: row.overview_photo_url,
    defectPhotoUrl: row.defect_photo_url,
    refPhotoUrl: row.ref_photo_url,
    photoHash: row.photo_hash,
    defectNote: row.defect_note,
    status: row.status,
    performedBy: row.performed_by,
    closedBy: row.closed_by,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    // Stored as a single jsonb column with the same camelCase shape as
    // RepairAiSuggestion (same convention as loan_cases.comparison).
    aiSuggestion: row.ai_suggestion,
    aiConfirmation: row.ai_confirmation,
    confirmedBy: row.confirmed_by,
    confirmedAt: row.confirmed_at,
  };
}
