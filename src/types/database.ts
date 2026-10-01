/**
 * Domain types shared by the whole app. Field names and shapes intentionally
 * mirror the planned Supabase schema (see supabase/migrations/) so that
 * swapping the mock data provider for a real SupabaseDataProvider later is a
 * mechanical change, not a redesign.
 */

export type UUID = string;
export type ISODateString = string;

export interface Supplier {
  id: UUID;
  name: string;
  shortCode: string;
  /** Swiss site, e.g. "Biberist, SO". */
  location: string | null;
  /** Fachgebiete / typische Sets, e.g. "Hüfte", "Traumatologie". */
  specialties: string[];
  /** Whether a loaner/rental instrument service was confirmed for this supplier. */
  loanServiceConfirmed: boolean;
  /** Free-text description of the loan service, e.g. "ELSA European Loan Service". */
  loanServiceNote: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  /** Address or other free-text contact hint that doesn't fit phone/email. */
  contactNote: string | null;
  /** Where this supplier's data was sourced from, for traceability. */
  source: string | null;
  logoUrl: string | null;
  active: boolean;
  createdAt: ISODateString;
}

/** A single instrument line that belongs to a reference tray composition. */
export interface TrayInstrument {
  id: UUID;
  trayId: UUID;
  name: string;
  quantity: number;
  /** Position within the tray layout, used for ordered checklists. */
  position: number;
  /** Critical instruments require an explicit manual confirmation, cannot be "assumed present". */
  critical: boolean;
  referenceImageUrl: string | null;
}

/** A Belegarzt/Operateur who can be assigned to a Sieb-Fall as the operating surgeon. */
export interface Physician {
  id: UUID;
  name: string;
  /** Fachbereich, e.g. "Orthopädie", "Gynäkologie" - free text so new departments don't need a schema change. */
  department: string;
  mobilePhone: string | null;
  practicePhone: string | null;
  email: string | null;
  createdAt: ISODateString;
}

/** A reference (master) tray definition against which scans are matched. */
export interface Tray {
  id: UUID;
  /** Primary human-readable code, e.g. "SSW-LEIH-04-02". */
  code: string;
  /** Alternate identifiers / aliases that should also resolve to this tray, e.g. "LEIH 04". */
  aliases: string[];
  name: string;
  supplierId: UUID;
  referencePhotoUrl: string | null;
  expectedInstrumentCount: number;
  active: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export type ScanStatus =
  | 'processing'
  | 'awaiting_match'
  | 'matched'
  | 'unmatched'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'cancelled';

/** Raw output of the on-device recognition pipeline (barcode/QR + OCR), before any DB lookup. */
export interface RecognitionResult {
  barcodeValues: string[];
  qrValues: string[];
  ocrText: string;
  /** Candidate identifiers extracted from barcode/QR/OCR via pattern matching, most likely first. */
  candidateIdentifiers: RecognitionCandidate[];
  ocrConfidence: number | null;
  processingTimeMs: number;
  /** GS1/UDI fields (GTIN, manufacturer REF, lot, serial, expiry) parsed from the label, if present - see recognition/gs1.ts. */
  gs1: Gs1Fields | null;
}

export interface Gs1Fields {
  gtin?: string;
  ref?: string;
  lot?: string;
  serial?: string;
  expiryDate?: string;
}

export interface RecognitionCandidate {
  value: string;
  source: 'barcode' | 'qr' | 'ocr' | 'gs1';
  confidence: number;
}

/** A confirmed/rejected checklist entry for one expected instrument during review. */
export interface InstrumentCheckEntry {
  instrumentId: UUID;
  name: string;
  quantityExpected: number;
  quantityConfirmed: number;
  critical: boolean;
  /** True once the user has explicitly reviewed this line (assistive AI never sets this alone). */
  userConfirmed: boolean;
}

/** An instrument found in the tray but not part of the reference composition. */
export interface ExtraInstrumentEntry {
  id: string;
  name: string;
  quantity: number;
  note: string | null;
}

export interface ScanRecord {
  id: UUID;
  trayId: UUID | null;
  supplierId: UUID | null;
  /** Set when this scan is the intake or outtake scan of a LoanCase, null for a standalone check. */
  caseId: UUID | null;
  capturedImageDataUrl: string | null;
  /** Extra photos beyond the primary one (e.g. a barcode/detail close-up) - same scan, same Sieb. */
  additionalImageDataUrls: string[];
  recognition: RecognitionResult | null;
  matchedIdentifier: string | null;
  status: ScanStatus;
  expectedCount: number;
  detectedCount: number;
  instrumentChecks: InstrumentCheckEntry[];
  extraInstruments: ExtraInstrumentEntry[];
  missingInstrumentIds: UUID[];
  notes: string | null;
  /** OP-Datum, set when known at capture time (e.g. from a Sieb-SET's shared Angaben zur Operation). */
  operationDate: ISODateString | null;
  /** The operating surgeon/Belegarzt, if known at capture time. */
  operateurId: UUID | null;
  performedBy: string;
  createdAt: ISODateString;
  confirmedAt: ISODateString | null;
}

export type AuditAction =
  | 'scan_started'
  | 'scan_matched'
  | 'scan_unmatched'
  | 'scan_confirmed'
  | 'scan_cancelled'
  | 'instrument_manually_adjusted'
  | 'supplier_created'
  | 'supplier_updated'
  | 'supplier_activated'
  | 'supplier_deactivated'
  | 'supplier_deleted'
  | 'tray_created'
  | 'tray_updated'
  | 'case_intake'
  | 'case_outtake'
  | 'case_compared'
  | 'case_readiness_notified'
  | 'archive_downloaded'
  | 'physician_created'
  | 'repair_reported'
  | 'repair_closed'
  | 'repair_ai_analyzed'
  | 'repair_ai_confirmed';

export interface AuditLogEntry {
  id: UUID;
  entityType: 'scan' | 'tray' | 'supplier' | 'case' | 'archive' | 'physician' | 'repair';
  entityId: UUID;
  action: AuditAction;
  performedBy: string;
  details: Record<string, unknown>;
  createdAt: ISODateString;
}

// ---------------------------------------------------------------------------
// Vorher/Nachher-Vergleich (loaner case lifecycle: intake -> operation -> outtake)
// ---------------------------------------------------------------------------

export type CaseStatus = 'outtake_pending' | 'compared';

/** One instrument whose confirmed quantity differs between intake and outtake. */
export interface CaseInstrumentDelta {
  instrumentId: UUID;
  name: string;
  intakeQuantity: number;
  outtakeQuantity: number;
  /** outtakeQuantity - intakeQuantity; negative = missing, positive = surplus of a known instrument. */
  delta: number;
  critical: boolean;
}

/** An extra (non-reference) instrument whose presence differs between intake and outtake. */
export interface CaseExtraDelta {
  name: string;
  /** Quantity of this named extra instrument at intake (0 if new at outtake). */
  intakeQuantity: number;
  /** Quantity of this named extra instrument at outtake (0 if resolved/removed by outtake). */
  outtakeQuantity: number;
}

/**
 * Heuristic suggestion that a missing reference instrument may have been
 * swapped for an unexpected extra instrument ("falsches Instrument"). Based
 * on name-similarity only - always assistive, never auto-confirmed.
 */
export interface CaseSubstitutionSuggestion {
  missingInstrumentId: UUID | null;
  missingName: string;
  extraName: string;
  /** 0..1 name-similarity score used to rank/threshold suggestions. */
  similarity: number;
}

/**
 * Result of comparing a case's confirmed intake checklist against its
 * confirmed outtake checklist. Deliberately a deterministic diff of two
 * human-confirmed records, not an automated image/vision analysis - see
 * README "KI-Vergleich" for the reasoning.
 */
export interface CaseComparison {
  instrumentDeltas: CaseInstrumentDelta[];
  extraDeltas: CaseExtraDelta[];
  substitutionSuggestions: CaseSubstitutionSuggestion[];
  hasDeviations: boolean;
  comparedAt: ISODateString;
  comparedBy: string;
}

/**
 * One physical loaner-tray-in-use lifecycle: an intake scan when the tray
 * arrives, an optional outtake scan after the operation, and the comparison
 * between them. Both scans are also persisted as ordinary ScanRecords (see
 * ScanRecord.caseId), so Sieb-Historie keeps showing every scan regardless.
 */
export interface LoanCase {
  id: UUID;
  trayId: UUID;
  supplierId: UUID;
  status: CaseStatus;
  /** Free-text reference to the operation this loaner tray was used for. */
  operationNote: string | null;
  operationDate: ISODateString | null;
  /** The operating surgeon/Belegarzt for this case, if known at intake. */
  operateurId: UUID | null;
  intakeScanId: UUID;
  outtakeScanId: UUID | null;
  comparison: CaseComparison | null;
  performedByIntake: string;
  performedByOuttake: string | null;
  /** Photo of the sterilization batch's hygiene passport, taken after the outtake scan - a new one each cycle. */
  hygienePassportPhotoUrl: string | null;
  /** When the supplier was e-mailed that this Sieb is ready for pickup/return - null until sent. */
  readinessNotifiedAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

// ---------------------------------------------------------------------------
// Reparatur (v2.2 Phase 2 - Repair Photo Foundation - storage + UI; Phase 3
// - IDM Intelligence Pilot adds assistive Cloud Agent recognition on top,
// see docs/roadmap/v2.2/MASTER-PROMPT-v2.2.md section 4/5/21).
// ---------------------------------------------------------------------------

export type RepairStatus = 'open' | 'closed';

/**
 * Raw Cloud Agent output for a repair case's photos - always a proposal,
 * never an authoritative value. Written once and never overwritten/deleted,
 * so the original AI result stays auditable even after a human correction
 * (see RepairCase.aiConfirmation / confirmedBy / confirmedAt).
 */
export interface RepairAiSuggestion {
  instrumentCandidate: string;
  /** REF/Artikelnummer read off the label, if visible - still just a candidate. */
  refCandidate: string | null;
  /** Cautiously-worded visible findings only (e.g. "sichtbare Deformation") - never a fitness-for-use verdict. */
  defectCandidates: string[];
  /** 0-100. UX-only thresholds (see confidenceTier) - never a medical/operational certainty. */
  confidence: number;
  evidence: string[];
  model: string;
  analyzedAt: ISODateString;
}

/** What the human did with the AI's suggestion - see RepairAiSuggestion. */
export type AiConfirmationAction = 'accepted' | 'corrected' | 'other_instrument' | 'rejected';

/**
 * A reported defective/damaged instrument: up to three photos (overview
 * mandatory, defect/REF close-ups optional) plus a free-text description.
 * Deliberately not tied to a specific TrayInstrument row yet.
 */
export interface RepairCase {
  id: UUID;
  /** The Sieb this instrument normally belongs to, if known. */
  trayId: UUID | null;
  supplierId: UUID | null;
  instrumentName: string;
  /** REF/Artikelnummer, once known - set manually or via a confirmed AI suggestion. */
  refNumber: string | null;
  overviewPhotoUrl: string;
  defectPhotoUrl: string | null;
  refPhotoUrl: string | null;
  defectNote: string;
  status: RepairStatus;
  performedBy: string;
  closedBy: string | null;
  createdAt: ISODateString;
  closedAt: ISODateString | null;
  /** The Cloud Agent's raw proposal for this case, if analysis has run - immutable once set. */
  aiSuggestion: RepairAiSuggestion | null;
  /** Set once a human has acted on aiSuggestion - null while a suggestion is pending review. */
  aiConfirmation: AiConfirmationAction | null;
  confirmedBy: string | null;
  confirmedAt: ISODateString | null;
}

export interface RepairCaseInput {
  trayId: UUID | null;
  supplierId: UUID | null;
  instrumentName: string;
  overviewPhotoUrl: string;
  defectPhotoUrl: string | null;
  refPhotoUrl: string | null;
  defectNote: string;
  performedBy: string;
}

// ---------------------------------------------------------------------------
// Create/update input shapes for the management (CRUD) screens
// ---------------------------------------------------------------------------

export interface SupplierInput {
  name: string;
  shortCode: string;
  location: string | null;
  specialties: string[];
  loanServiceConfirmed: boolean;
  loanServiceNote: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  contactNote: string | null;
  source: string | null;
  logoUrl: string | null;
}

export interface PhysicianInput {
  name: string;
  department: string;
  mobilePhone: string | null;
  practicePhone: string | null;
  email: string | null;
}

export interface TrayInstrumentInput {
  name: string;
  quantity: number;
  critical: boolean;
}

export interface TrayInput {
  code: string;
  aliases: string[];
  name: string;
  supplierId: UUID;
  referencePhotoUrl: string | null;
  instruments: TrayInstrumentInput[];
}

// ---------------------------------------------------------------------------
// Users / roles (real Supabase Auth - see supabase/migrations/0002_auth_roles.sql)
// ---------------------------------------------------------------------------

export type UserRole = 'admin' | 'op_leitung' | 'mitarbeiter' | 'lieferant';

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  op_leitung: 'OP-Leitung',
  mitarbeiter: 'Mitarbeiter:in',
  lieferant: 'Lieferant',
};

/** One authenticated account. Newly registered accounts start with active=false until an admin approves them. */
export interface UserProfile {
  id: UUID;
  email: string;
  displayName: string;
  role: UserRole;
  /** Set for role = 'lieferant' accounts, linking them to their own supplier. */
  supplierId: UUID | null;
  active: boolean;
  createdAt: ISODateString;
}

export interface UserProfileUpdateInput {
  displayName?: string;
  role?: UserRole;
  supplierId?: UUID | null;
  active?: boolean;
}
