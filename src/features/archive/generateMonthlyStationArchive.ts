import type { AuditLogEntry, Station, StationOrder } from '@/types/database';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { dataUrlToBlob, extensionFor, formatDateTime, formatMonthLabel, monthKey, safeFilePart } from './generateMonthlyArchive';

/**
 * Monthly compliance archive for the Station side of Sterimaterial-Bestellung
 * (station_orders + their own audit entries) - kept as its own section/ZIP,
 * separate from the Leih-System archive in generateMonthlyArchive.ts, since
 * the two track different workflows for different people. Same export
 * conventions (ZIP of Excel sheets + photos, 00_Index overview, never
 * deletes anything).
 */

export interface MonthlyStationArchiveSource {
  orders: StationOrder[];
  stations: Station[];
  auditLog: AuditLogEntry[];
}

export interface MonthlyStationArchiveStats {
  month: string;
  orderCount: number;
  openCount: number;
  fulfilledCount: number;
  auditCount: number;
}

function stationAuditLog(auditLog: AuditLogEntry[]): AuditLogEntry[] {
  return auditLog.filter((a) => a.entityType === 'station_order');
}

export function listAvailableStationMonths(source: MonthlyStationArchiveSource): string[] {
  const months = new Set<string>();
  for (const o of source.orders) months.add(monthKey(o.orderedAt));
  for (const a of stationAuditLog(source.auditLog)) months.add(monthKey(a.createdAt));
  return Array.from(months).sort((a, b) => (a < b ? 1 : -1));
}

export function statsForStationMonth(source: MonthlyStationArchiveSource, month: string): MonthlyStationArchiveStats {
  const orders = source.orders.filter((o) => monthKey(o.orderedAt) === month);
  const auditLog = stationAuditLog(source.auditLog).filter((a) => monthKey(a.createdAt) === month);
  return {
    month,
    orderCount: orders.length,
    openCount: orders.filter((o) => o.status === 'open').length,
    fulfilledCount: orders.filter((o) => o.status === 'fulfilled').length,
    auditCount: auditLog.length,
  };
}

export interface MonthlyStationRecords {
  orders: StationOrder[];
  auditLog: AuditLogEntry[];
  stationById: Map<string, Station>;
}

/** Shared by the ZIP builder and the in-app month preview, so both read the same records. */
export function selectMonthlyStationRecords(source: MonthlyStationArchiveSource, month: string): MonthlyStationRecords {
  return {
    orders: source.orders.filter((o) => monthKey(o.orderedAt) === month),
    auditLog: stationAuditLog(source.auditLog).filter((a) => monthKey(a.createdAt) === month),
    stationById: new Map(source.stations.map((s) => [s.id, s])),
  };
}

export async function buildMonthlyStationArchive(
  source: MonthlyStationArchiveSource,
  month: string,
  generatedBy: string,
): Promise<Blob> {
  const { orders, auditLog, stationById } = selectMonthlyStationRecords(source, month);

  const zip = new JSZip();

  zip.file('01_Bestellungen/Bestellungen.xlsx', await buildOrderSheet(orders, stationById));

  for (const order of orders) {
    const station = stationById.get(order.stationId);
    const baseName = `${safeFilePart(station?.shortCode ?? order.stationId)}_${safeFilePart(order.orderedAt)}`;

    const sendBlob = await dataUrlToBlob(order.sendPhotoUrl);
    if (sendBlob) zip.file(`02_Fotos/Versand/${baseName}${extensionFor(sendBlob.type)}`, sendBlob);

    if (order.exitPhotoUrl) {
      const exitBlob = await dataUrlToBlob(order.exitPhotoUrl);
      if (exitBlob) zip.file(`02_Fotos/Ausgang/${baseName}${extensionFor(exitBlob.type)}`, exitBlob);
    }
  }

  zip.file('03_Audit_Log/Audit_Log.xlsx', await buildStationAuditSheet(auditLog));
  zip.file(
    '00_Index.xlsx',
    await buildStationIndexSheet(month, generatedBy, {
      orders: orders.length,
      open: orders.filter((o) => o.status === 'open').length,
      fulfilled: orders.filter((o) => o.status === 'fulfilled').length,
      auditEntries: auditLog.length,
    }),
  );

  return zip.generateAsync({ type: 'blob' });
}

async function buildOrderSheet(orders: StationOrder[], stationById: Map<string, Station>): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Bestellungen');
  sheet.columns = [
    { header: 'Station', key: 'station', width: 22 },
    { header: 'Priorität', key: 'priority', width: 12 },
    { header: 'Artikel', key: 'itemCount', width: 10 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Bestellt von', key: 'orderedBy', width: 20 },
    { header: 'Bestellt am', key: 'orderedAt', width: 20 },
    { header: 'Ausgang durch', key: 'fulfilledBy', width: 20 },
    { header: 'Ausgang am', key: 'fulfilledAt', width: 20 },
  ];
  orders.forEach((o) =>
    sheet.addRow({
      station: stationById.get(o.stationId)?.name ?? '',
      priority: o.priority,
      itemCount: o.lines.reduce((sum, l) => sum + l.quantity, 0),
      status: o.status === 'open' ? 'Offen' : 'Abgeschlossen',
      orderedBy: o.orderedBy,
      orderedAt: formatDateTime(o.orderedAt),
      fulfilledBy: o.fulfilledBy ?? '',
      fulfilledAt: o.fulfilledAt ? formatDateTime(o.fulfilledAt) : '',
    }),
  );
  return wb.xlsx.writeBuffer();
}

async function buildStationAuditSheet(entries: AuditLogEntry[]): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Audit-Log');
  sheet.columns = [
    { header: 'Datum/Zeit', key: 'createdAt', width: 20 },
    { header: 'Aktion', key: 'action', width: 24 },
    { header: 'Durchgeführt von', key: 'performedBy', width: 20 },
    { header: 'Details', key: 'details', width: 40 },
  ];
  entries.forEach((e) =>
    sheet.addRow({
      createdAt: formatDateTime(e.createdAt),
      action: e.action,
      performedBy: e.performedBy,
      details: Object.entries(e.details)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · '),
    }),
  );
  return wb.xlsx.writeBuffer();
}

async function buildStationIndexSheet(
  month: string,
  generatedBy: string,
  counts: { orders: number; open: number; fulfilled: number; auditEntries: number },
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Übersicht');
  sheet.columns = [
    { header: 'Feld', key: 'field', width: 32 },
    { header: 'Wert', key: 'value', width: 32 },
  ];
  sheet.addRows([
    { field: 'Archiv', value: `IDM Mobile Station - ${formatMonthLabel(month)}` },
    { field: 'Erstellt am', value: formatDateTime(new Date().toISOString()) },
    { field: 'Erstellt von', value: generatedBy },
    { field: '', value: '' },
    { field: 'Bestellungen (01_Bestellungen)', value: counts.orders },
    { field: 'davon offen', value: counts.open },
    { field: 'davon abgeschlossen', value: counts.fulfilled },
    { field: 'Audit-Log-Einträge (03_Audit_Log)', value: counts.auditEntries },
  ]);
  sheet.getRow(1).font = { bold: true };
  return wb.xlsx.writeBuffer();
}
