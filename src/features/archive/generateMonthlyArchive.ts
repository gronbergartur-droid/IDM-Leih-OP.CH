import type { AuditLogEntry, LoanCase, Physician, ScanRecord, Supplier, Tray } from '@/types/database';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

/**
 * Builds the downloadable monthly compliance archive (Swiss AEMP
 * retention: 10 Jahre) as a single ZIP with a fixed folder layout, agreed
 * with the customer:
 *
 * IDM_LEIH_SIEB_ARCHIV_<YYYY-MM>.zip
 *   01_Lieferanten/Lieferanten.xlsx
 *   02_Siebe/Siebe.xlsx
 *   03_Sieb_Faelle/Sieb_Faelle.xlsx
 *   04_Scans/{Eingang,Ausgang,Kontrolle}/*.xlsx
 *   05_Sterilisation/{Sterilisationsnachweise,Hygienepass}/...
 *   06_Fotos/{Eingang,Ausgang,Kontrolle}/*.jpg
 *   07_Audit_Log/Audit_Log.xlsx
 *   00_Index.xlsx
 *
 * "Kontrolle" (under 04_Scans and 06_Fotos) holds standalone LEIH-SIEB
 * SCANNER checks that are not part of a Sieb-Fall - not in the original
 * spec for 04_Scans, added for symmetry with 06_Fotos so no data is
 * silently dropped.
 *
 * Runs entirely client-side against whatever the DataProvider already
 * returns (no new backend query surface) - fine at hospital-department
 * scale; would need server-side date-range queries if record volumes grew
 * much larger.
 */

export interface MonthlyArchiveSource {
  suppliers: Supplier[];
  trays: Tray[];
  cases: LoanCase[];
  scans: ScanRecord[];
  auditLog: AuditLogEntry[];
  physicians: Physician[];
}

export interface MonthlyArchiveStats {
  month: string; // "YYYY-MM"
  caseCount: number;
  scanCount: number;
  auditCount: number;
  supplierCount: number;
}

/**
 * The Leih-System audit log excludes `station_order` entries - those
 * belong to the separate Station section (see generateMonthlyStationArchive.ts)
 * now that the Archiv page is split into two sections, so they aren't
 * listed (or exported) twice.
 */
function leihAuditLog(auditLog: AuditLogEntry[]): AuditLogEntry[] {
  return auditLog.filter((a) => a.entityType !== 'station_order');
}

/** All "YYYY-MM" months that have at least one record, newest first. */
export function listAvailableMonths(source: MonthlyArchiveSource): string[] {
  const months = new Set<string>();
  for (const c of source.cases) months.add(monthKey(c.createdAt));
  for (const s of source.scans) months.add(monthKey(s.createdAt));
  for (const a of leihAuditLog(source.auditLog)) months.add(monthKey(a.createdAt));
  return Array.from(months).sort((a, b) => (a < b ? 1 : -1));
}

export function statsForMonth(source: MonthlyArchiveSource, month: string): MonthlyArchiveStats {
  const cases = source.cases.filter((c) => monthKey(c.createdAt) === month);
  const scans = source.scans.filter((s) => monthKey(s.createdAt) === month);
  const auditLog = leihAuditLog(source.auditLog).filter((a) => monthKey(a.createdAt) === month);
  const supplierIds = new Set([...cases.map((c) => c.supplierId), ...scans.map((s) => s.supplierId).filter(isString)]);
  return { month, caseCount: cases.length, scanCount: scans.length, auditCount: auditLog.length, supplierCount: supplierIds.size };
}

export interface MonthlyLeihRecords {
  cases: LoanCase[];
  involvedSuppliers: Supplier[];
  involvedTrays: Tray[];
  scanBuckets: Record<'eingang' | 'ausgang' | 'kontrolle', ScanRecord[]>;
  hygienePassportsThisMonth: LoanCase[];
  auditLog: AuditLogEntry[];
  trayById: Map<string, Tray>;
  supplierById: Map<string, Supplier>;
  physicianById: Map<string, Physician>;
}

/** Shared by the ZIP builder and the in-app month preview, so both read the same records. */
export function selectMonthlyLeihRecords(source: MonthlyArchiveSource, month: string): MonthlyLeihRecords {
  const cases = source.cases.filter((c) => monthKey(c.createdAt) === month);
  const scans = source.scans.filter((s) => monthKey(s.createdAt) === month);
  const auditLog = leihAuditLog(source.auditLog).filter((a) => monthKey(a.createdAt) === month);
  const trayById = new Map(source.trays.map((t) => [t.id, t]));
  const supplierById = new Map(source.suppliers.map((s) => [s.id, s]));
  const physicianById = new Map(source.physicians.map((p) => [p.id, p]));

  const involvedSupplierIds = new Set<string>();
  const involvedTrayIds = new Set<string>();
  for (const c of cases) {
    involvedSupplierIds.add(c.supplierId);
    involvedTrayIds.add(c.trayId);
  }
  for (const s of scans) {
    if (s.supplierId) involvedSupplierIds.add(s.supplierId);
    if (s.trayId) involvedTrayIds.add(s.trayId);
  }
  const involvedSuppliers = source.suppliers.filter((s) => involvedSupplierIds.has(s.id));
  const involvedTrays = source.trays.filter((t) => involvedTrayIds.has(t.id));

  const caseById = new Map(source.cases.map((c) => [c.id, c]));
  const scanBuckets: Record<'eingang' | 'ausgang' | 'kontrolle', ScanRecord[]> = {
    eingang: [],
    ausgang: [],
    kontrolle: [],
  };
  for (const scan of scans) {
    scanBuckets[categorizeScan(scan, caseById)].push(scan);
  }

  const hygienePassportsThisMonth = source.cases.filter(
    (c) => c.readinessNotifiedAt && monthKey(c.readinessNotifiedAt) === month && c.hygienePassportPhotoUrl,
  );

  return { cases, involvedSuppliers, involvedTrays, scanBuckets, hygienePassportsThisMonth, auditLog, trayById, supplierById, physicianById };
}

export function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString('de-CH', { month: 'long', year: 'numeric' });
}

export async function buildMonthlyArchive(
  source: MonthlyArchiveSource,
  month: string,
  generatedBy: string,
): Promise<Blob> {
  const { cases, involvedSuppliers, involvedTrays, scanBuckets, hygienePassportsThisMonth, auditLog, trayById, supplierById, physicianById } =
    selectMonthlyLeihRecords(source, month);

  const zip = new JSZip();

  zip.file('01_Lieferanten/Lieferanten.xlsx', await buildSupplierSheet(involvedSuppliers));
  zip.file('02_Siebe/Siebe.xlsx', await buildTraySheet(involvedTrays, supplierById));
  zip.file('03_Sieb_Faelle/Sieb_Faelle.xlsx', await buildCaseSheet(cases, trayById, supplierById, physicianById));

  zip.file('04_Scans/Eingang/Eingang_Scans.xlsx', await buildScanSheet(scanBuckets.eingang, trayById, 'Eingang'));
  zip.file('04_Scans/Ausgang/Ausgang_Scans.xlsx', await buildScanSheet(scanBuckets.ausgang, trayById, 'Ausgang'));
  zip.file('04_Scans/Kontrolle/Kontrolle_Scans.xlsx', await buildScanSheet(scanBuckets.kontrolle, trayById, 'Kontrolle'));

  zip.file(
    '05_Sterilisation/Sterilisationsnachweise/Hinweis.txt',
    'Reserviert fuer separate Sterilisationsnachweise, sobald dieses Datenfeld ' +
      'eingefuehrt wird. Aktuell dient der Hygiene-Pass (siehe Ordner Hygienepass) ' +
      'als Nachweis der abgeschlossenen Sterilisation.',
  );
  for (const c of hygienePassportsThisMonth) {
    const tray = trayById.get(c.trayId);
    const blob = await dataUrlToBlob(c.hygienePassportPhotoUrl!);
    if (blob) {
      const filename = `${safeFilePart(tray?.code ?? c.id)}_${safeFilePart(c.readinessNotifiedAt ?? c.id)}${extensionFor(blob.type)}`;
      zip.file(`05_Sterilisation/Hygienepass/${filename}`, blob);
    }
  }

  for (const [bucket, list] of Object.entries(scanBuckets) as [keyof typeof scanBuckets, ScanRecord[]][]) {
    const folder = bucket === 'eingang' ? 'Eingang' : bucket === 'ausgang' ? 'Ausgang' : 'Kontrolle';
    for (const scan of list) {
      if (!scan.capturedImageDataUrl) continue;
      const tray = scan.trayId ? trayById.get(scan.trayId) : undefined;
      const baseName = `${safeFilePart(tray?.code ?? scan.matchedIdentifier ?? scan.id)}_${safeFilePart(scan.createdAt)}`;

      const blob = await dataUrlToBlob(scan.capturedImageDataUrl);
      if (blob) zip.file(`06_Fotos/${folder}/${baseName}${extensionFor(blob.type)}`, blob);

      for (const [index, additionalUrl] of scan.additionalImageDataUrls.entries()) {
        const additionalBlob = await dataUrlToBlob(additionalUrl);
        if (additionalBlob) {
          zip.file(`06_Fotos/${folder}/${baseName}_${index + 2}${extensionFor(additionalBlob.type)}`, additionalBlob);
        }
      }
    }
  }

  zip.file('07_Audit_Log/Audit_Log.xlsx', await buildAuditSheet(auditLog));
  zip.file('00_Index.xlsx', await buildIndexSheet(month, generatedBy, {
    suppliers: involvedSuppliers.length,
    trays: involvedTrays.length,
    cases: cases.length,
    scansEingang: scanBuckets.eingang.length,
    scansAusgang: scanBuckets.ausgang.length,
    scansKontrolle: scanBuckets.kontrolle.length,
    hygienePassports: hygienePassportsThisMonth.length,
    auditEntries: auditLog.length,
  }));

  return zip.generateAsync({ type: 'blob' });
}

// ---------------------------------------------------------------------
// Sheet builders
// ---------------------------------------------------------------------

async function buildSupplierSheet(suppliers: Supplier[]): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Lieferanten');
  sheet.columns = [
    { header: 'Name', key: 'name', width: 28 },
    { header: 'Kürzel', key: 'shortCode', width: 12 },
    { header: 'Standort', key: 'location', width: 20 },
    { header: 'Kontakt-Telefon', key: 'contactPhone', width: 16 },
    { header: 'Kontakt-E-Mail', key: 'contactEmail', width: 28 },
    { header: 'Aktiv', key: 'active', width: 8 },
  ];
  suppliers.forEach((s) =>
    sheet.addRow({
      name: s.name,
      shortCode: s.shortCode,
      location: s.location ?? '',
      contactPhone: s.contactPhone ?? '',
      contactEmail: s.contactEmail ?? '',
      active: s.active ? 'Ja' : 'Nein',
    }),
  );
  return wb.xlsx.writeBuffer();
}

async function buildTraySheet(trays: Tray[], supplierById: Map<string, Supplier>): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Siebe');
  sheet.columns = [
    { header: 'Sieb-Code', key: 'code', width: 20 },
    { header: 'Bezeichnung', key: 'name', width: 28 },
    { header: 'Lieferant', key: 'supplier', width: 24 },
    { header: 'Erwartete Instrumente', key: 'expected', width: 20 },
    { header: 'Aktiv', key: 'active', width: 8 },
  ];
  trays.forEach((t) =>
    sheet.addRow({
      code: t.code,
      name: t.name,
      supplier: supplierById.get(t.supplierId)?.name ?? '',
      expected: t.expectedInstrumentCount,
      active: t.active ? 'Ja' : 'Nein',
    }),
  );
  return wb.xlsx.writeBuffer();
}

async function buildCaseSheet(
  cases: LoanCase[],
  trayById: Map<string, Tray>,
  supplierById: Map<string, Supplier>,
  physicianById: Map<string, Physician>,
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Sieb-Fälle');
  sheet.columns = [
    { header: 'Sieb-Code', key: 'code', width: 20 },
    { header: 'Lieferant', key: 'supplier', width: 24 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Operation', key: 'operationNote', width: 26 },
    { header: 'OP-Datum', key: 'operationDate', width: 14 },
    { header: 'Operateur', key: 'operateur', width: 24 },
    { header: 'Eingang durch', key: 'performedByIntake', width: 20 },
    { header: 'Ausgang durch', key: 'performedByOuttake', width: 20 },
    { header: 'Abweichungen', key: 'hasDeviations', width: 14 },
    { header: 'Lieferant benachrichtigt', key: 'readinessNotifiedAt', width: 22 },
    { header: 'Erstellt am', key: 'createdAt', width: 20 },
  ];
  cases.forEach((c) =>
    sheet.addRow({
      code: trayById.get(c.trayId)?.code ?? '',
      supplier: supplierById.get(c.supplierId)?.name ?? '',
      status: c.status === 'compared' ? 'Abgeschlossen' : 'Offen',
      operationNote: c.operationNote ?? '',
      operationDate: c.operationDate ?? '',
      operateur: c.operateurId ? (physicianById.get(c.operateurId)?.name ?? '') : '',
      performedByIntake: c.performedByIntake,
      performedByOuttake: c.performedByOuttake ?? '',
      hasDeviations: c.comparison ? (c.comparison.hasDeviations ? 'Ja' : 'Nein') : '',
      readinessNotifiedAt: c.readinessNotifiedAt ? formatDateTime(c.readinessNotifiedAt) : '',
      createdAt: formatDateTime(c.createdAt),
    }),
  );
  return wb.xlsx.writeBuffer();
}

async function buildScanSheet(scans: ScanRecord[], trayById: Map<string, Tray>, title: string): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(title);
  sheet.columns = [
    { header: 'Sieb-Code', key: 'code', width: 20 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Erwartet', key: 'expected', width: 10 },
    { header: 'Erkannt', key: 'detected', width: 10 },
    { header: 'Fehlend', key: 'missing', width: 10 },
    { header: 'Zusätzlich', key: 'extra', width: 12 },
    { header: 'Durchgeführt von', key: 'performedBy', width: 20 },
    { header: 'Datum/Zeit', key: 'createdAt', width: 20 },
  ];
  scans.forEach((s) =>
    sheet.addRow({
      code: (s.trayId && trayById.get(s.trayId)?.code) ?? s.matchedIdentifier ?? '',
      status: s.status,
      expected: s.expectedCount,
      detected: s.detectedCount,
      missing: s.missingInstrumentIds.length,
      extra: s.extraInstruments.length,
      performedBy: s.performedBy,
      createdAt: formatDateTime(s.createdAt),
    }),
  );
  return wb.xlsx.writeBuffer();
}

async function buildAuditSheet(entries: AuditLogEntry[]): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Audit-Log');
  sheet.columns = [
    { header: 'Datum/Zeit', key: 'createdAt', width: 20 },
    { header: 'Aktion', key: 'action', width: 24 },
    { header: 'Bereich', key: 'entityType', width: 12 },
    { header: 'Durchgeführt von', key: 'performedBy', width: 20 },
    { header: 'Details', key: 'details', width: 40 },
  ];
  entries.forEach((e) =>
    sheet.addRow({
      createdAt: formatDateTime(e.createdAt),
      action: e.action,
      entityType: e.entityType,
      performedBy: e.performedBy,
      details: Object.entries(e.details)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · '),
    }),
  );
  return wb.xlsx.writeBuffer();
}

async function buildIndexSheet(
  month: string,
  generatedBy: string,
  counts: {
    suppliers: number;
    trays: number;
    cases: number;
    scansEingang: number;
    scansAusgang: number;
    scansKontrolle: number;
    hygienePassports: number;
    auditEntries: number;
  },
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Übersicht');
  sheet.columns = [
    { header: 'Feld', key: 'field', width: 32 },
    { header: 'Wert', key: 'value', width: 32 },
  ];
  sheet.addRows([
    { field: 'Archiv', value: `IDM Mobile LEIH-SIEB - ${formatMonthLabel(month)}` },
    { field: 'Erstellt am', value: formatDateTime(new Date().toISOString()) },
    { field: 'Erstellt von', value: generatedBy },
    { field: '', value: '' },
    { field: 'Lieferanten (01_Lieferanten)', value: counts.suppliers },
    { field: 'Siebe (02_Siebe)', value: counts.trays },
    { field: 'Sieb-Fälle (03_Sieb_Faelle)', value: counts.cases },
    { field: 'Scans Eingang (04_Scans/Eingang)', value: counts.scansEingang },
    { field: 'Scans Ausgang (04_Scans/Ausgang)', value: counts.scansAusgang },
    { field: 'Scans Kontrolle (04_Scans/Kontrolle)', value: counts.scansKontrolle },
    { field: 'Hygiene-Pässe (05_Sterilisation/Hygienepass)', value: counts.hygienePassports },
    { field: 'Audit-Log-Einträge (07_Audit_Log)', value: counts.auditEntries },
  ]);
  sheet.getRow(1).font = { bold: true };
  return wb.xlsx.writeBuffer();
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function categorizeScan(scan: ScanRecord, caseById: Map<string, LoanCase>): 'eingang' | 'ausgang' | 'kontrolle' {
  if (!scan.caseId) return 'kontrolle';
  const relatedCase = caseById.get(scan.caseId);
  if (relatedCase?.intakeScanId === scan.id) return 'eingang';
  if (relatedCase?.outtakeScanId === scan.id) return 'ausgang';
  return 'kontrolle';
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob | null> {
  try {
    const response = await fetch(dataUrl);
    return await response.blob();
  } catch {
    return null;
  }
}

export function extensionFor(mimeType: string): string {
  if (mimeType.includes('png')) return '.png';
  if (mimeType.includes('webp')) return '.webp';
  return '.jpg';
}

export function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
