import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ACTION_META } from '@/features/audit/AuditLogPage';
import { useAuth } from '@/lib/auth/AuthContext';
import { dataProvider } from '@/services';
import {
  AUFBEREITUNG_PRIORITAET_LABELS,
  type AuditLogEntry,
  type LoanCase,
  type Physician,
  type ScanRecord,
  type Station,
  type StationOrder,
  type Supplier,
  type Tray,
} from '@/types/database';
import { Archive, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { buildMonthlyArchive, formatMonthLabel, listAvailableMonths, selectMonthlyLeihRecords, statsForMonth } from './generateMonthlyArchive';
import {
  buildMonthlyStationArchive,
  listAvailableStationMonths,
  selectMonthlyStationRecords,
  statsForStationMonth,
} from './generateMonthlyStationArchive';

type Tab = 'leih' | 'station';

/**
 * Monthly compliance archive for Swiss 10-year retention, split into the
 * two workflows that produce the underlying data: "Leih System" (Lieferanten,
 * Siebe, Sieb-Fälle, Scans, Sterilisation/Hygiene-Pass photos, Audit-Log -
 * see generateMonthlyArchive.ts) and "Station" (Sterimaterial-Bestellung
 * orders + their own Audit-Log entries - see generateMonthlyStationArchive.ts).
 * Each month can be previewed in-app (record list, no download) or exported
 * as a ZIP. Neither section ever deletes anything - this page only reads
 * and exports whatever the DataProvider already has.
 */
export function ArchivPage() {
  const { profile: me, performedBy } = useAuth();
  const [tab, setTab] = useState<Tab>('leih');
  const [leihData, setLeihData] = useState<{
    suppliers: Supplier[];
    trays: Tray[];
    cases: LoanCase[];
    scans: ScanRecord[];
    auditLog: AuditLogEntry[];
    physicians: Physician[];
  } | null>(null);
  const [stationData, setStationData] = useState<{ orders: StationOrder[]; stations: Station[]; auditLog: AuditLogEntry[] } | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Audit-Log is shared by both sections - fetched once here instead of
    // once per section, so two concurrent requests for the same data can't
    // race (seen in practice as the Station section hanging on "Wird
    // geladen" while Leih System loaded fine).
    Promise.all([
      dataProvider.getSuppliers(),
      dataProvider.getTrays(),
      dataProvider.getCases(),
      dataProvider.getScanHistory(),
      dataProvider.getAuditLog(),
      dataProvider.getPhysicians(),
      dataProvider.getStationOrders(),
      dataProvider.getStations(),
    ])
      .then(([suppliers, trays, cases, scans, auditLog, physicians, orders, stations]) => {
        setLeihData({ suppliers, trays, cases, scans, auditLog, physicians });
        setStationData({ orders, stations, auditLog });
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Archiv konnte nicht geladen werden.'));
  }, []);

  const allowed = !me || me.role === 'admin' || me.role === 'op_leitung';

  if (!allowed) {
    return (
      <div>
        <TopBar title="Archiv" showBack />
        <p className="px-4 py-10 text-center text-sm text-ink-400">
          Nur Admins und OP-Leitung können das Archiv öffnen.
        </p>
      </div>
    );
  }

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleDownloadLeih = async (month: string) => {
    if (!leihData) return;
    setDownloadingMonth(month);
    setError(null);
    try {
      const blob = await buildMonthlyArchive(leihData, month, performedBy);
      downloadBlob(blob, `IDM_LEIH_SIEB_ARCHIV_${month}.zip`);
      await dataProvider.appendAuditEntry({
        id: crypto.randomUUID(),
        entityType: 'archive',
        entityId: crypto.randomUUID(),
        action: 'archive_downloaded',
        performedBy,
        details: { month, section: 'leih' },
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archiv konnte nicht erstellt werden.');
    } finally {
      setDownloadingMonth(null);
    }
  };

  const handleDownloadStation = async (month: string) => {
    if (!stationData) return;
    setDownloadingMonth(month);
    setError(null);
    try {
      const blob = await buildMonthlyStationArchive(stationData, month, performedBy);
      downloadBlob(blob, `IDM_LEIH_SIEB_ARCHIV_STATION_${month}.zip`);
      await dataProvider.appendAuditEntry({
        id: crypto.randomUUID(),
        entityType: 'archive',
        entityId: crypto.randomUUID(),
        action: 'archive_downloaded',
        performedBy,
        details: { month, section: 'station' },
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archiv konnte nicht erstellt werden.');
    } finally {
      setDownloadingMonth(null);
    }
  };

  const leihMonths = leihData ? listAvailableMonths(leihData) : [];
  const stationMonths = stationData ? listAvailableStationMonths(stationData) : [];

  return (
    <div>
      <TopBar title="Archiv" subtitle="Monatliches Backup - 10 Jahre Aufbewahrung" />
      <div className="px-4 py-4">
        <div className="mb-4 flex rounded-xl bg-ink-100 p-1">
          <button
            type="button"
            onClick={() => setTab('leih')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              tab === 'leih' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'
            }`}
          >
            Leih System
          </button>
          <button
            type="button"
            onClick={() => setTab('station')}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              tab === 'station' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'
            }`}
          >
            Station
          </button>
        </div>

        {tab === 'leih' && (
          <p className="mb-4 text-sm text-ink-600">
            Jeder Monat lässt sich direkt ansehen oder als ZIP-Datei herunterladen (Lieferanten, Siebe, Sieb-Fälle,
            Scans, Sterilisationsfotos, Audit-Log) - als zusätzliche lokale Kopie neben den Daten in Supabase.
          </p>
        )}
        {tab === 'station' && (
          <p className="mb-4 text-sm text-ink-600">
            Jeder Monat lässt sich direkt ansehen oder als ZIP-Datei herunterladen (Sterimaterial-Bestellungen mit
            Versand-/Ausgangs-Fotos, Audit-Log) - als zusätzliche lokale Kopie neben den Daten in Supabase.
          </p>
        )}

        {error && <p className="mb-3 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">{error}</p>}

        {tab === 'leih' && (
          <LeihTab
            data={leihData}
            months={leihMonths}
            expandedMonths={expandedMonths}
            onToggleMonth={toggleMonth}
            onDownload={handleDownloadLeih}
            downloadingMonth={downloadingMonth}
          />
        )}
        {tab === 'station' && (
          <StationTab
            data={stationData}
            months={stationMonths}
            expandedMonths={expandedMonths}
            onToggleMonth={toggleMonth}
            onDownload={handleDownloadStation}
            downloadingMonth={downloadingMonth}
          />
        )}
      </div>
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------
// Leih System tab
// ---------------------------------------------------------------------

interface LeihTabProps {
  data: {
    suppliers: Supplier[];
    trays: Tray[];
    cases: LoanCase[];
    scans: ScanRecord[];
    auditLog: AuditLogEntry[];
    physicians: Physician[];
  } | null;
  months: string[];
  expandedMonths: Set<string>;
  onToggleMonth: (key: string) => void;
  onDownload: (month: string) => void;
  downloadingMonth: string | null;
}

function LeihTab({ data, months, expandedMonths, onToggleMonth, onDownload, downloadingMonth }: LeihTabProps) {
  if (!data) return <p className="py-10 text-center text-sm text-ink-400">Wird geladen …</p>;

  if (months.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
          <Archive size={26} />
        </div>
        <p className="text-sm font-medium text-ink-700">Noch keine Daten</p>
        <p className="max-w-[220px] text-xs text-ink-500">
          Sobald Scans, Fälle oder Audit-Einträge vorliegen, erscheinen hier monatliche Archive.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {months.map((month) => {
        const key = `leih:${month}`;
        const stats = statsForMonth(data, month);
        const expanded = expandedMonths.has(key);
        return (
          <Card key={month} className="p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold capitalize text-ink-900">{formatMonthLabel(month)}</p>
                <p className="text-xs text-ink-500">
                  {stats.caseCount} Fälle · {stats.scanCount} Scans · {stats.supplierCount} Lieferanten ·{' '}
                  {stats.auditCount} Audit-Einträge
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button variant="secondary" size="md" icon={expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />} onClick={() => onToggleMonth(key)}>
                  Ansehen
                </Button>
                <Button
                  size="md"
                  icon={<Download size={16} />}
                  onClick={() => onDownload(month)}
                  disabled={downloadingMonth !== null}
                  aria-label={downloadingMonth === month ? 'Wird erstellt' : 'Herunterladen'}
                />
              </div>
            </div>

            {expanded && <LeihMonthDetail data={data} month={month} />}
          </Card>
        );
      })}
    </div>
  );
}

function LeihMonthDetail({ data, month }: { data: NonNullable<LeihTabProps['data']>; month: string }) {
  const records = selectMonthlyLeihRecords(data, month);
  return (
    <div className="mt-3 space-y-3 border-t border-ink-100 pt-3">
      <RecordSection title={`Lieferanten (${records.involvedSuppliers.length})`}>
        {records.involvedSuppliers.map((s) => (
          <RecordRow key={s.id} primary={s.name} secondary={s.shortCode} />
        ))}
      </RecordSection>

      <RecordSection title={`Siebe (${records.involvedTrays.length})`}>
        {records.involvedTrays.map((t) => (
          <RecordRow key={t.id} primary={t.code} secondary={t.name} />
        ))}
      </RecordSection>

      <RecordSection title={`Sieb-Fälle (${records.cases.length})`}>
        {records.cases.map((c) => (
          <RecordRow
            key={c.id}
            primary={records.trayById.get(c.trayId)?.code ?? c.id}
            secondary={`${c.status === 'compared' ? 'Abgeschlossen' : 'Offen'} · ${formatShortDate(c.createdAt)}`}
          />
        ))}
      </RecordSection>

      {(['eingang', 'ausgang', 'kontrolle'] as const).map((bucket) => {
        const label = bucket === 'eingang' ? 'Scans Eingang' : bucket === 'ausgang' ? 'Scans Ausgang' : 'Scans Kontrolle';
        const list = records.scanBuckets[bucket];
        return (
          <RecordSection key={bucket} title={`${label} (${list.length})`}>
            {list.map((s) => (
              <RecordRow
                key={s.id}
                primary={(s.trayId && records.trayById.get(s.trayId)?.code) ?? s.matchedIdentifier ?? s.id}
                secondary={`${s.status} · ${formatShortDate(s.createdAt)}`}
              />
            ))}
          </RecordSection>
        );
      })}

      <RecordSection title={`Audit-Log (${records.auditLog.length})`}>
        {records.auditLog.map((a) => (
          <RecordRow key={a.id} primary={ACTION_META[a.action]?.label ?? a.action} secondary={`${a.performedBy} · ${formatShortDate(a.createdAt)}`} />
        ))}
      </RecordSection>
    </div>
  );
}

// ---------------------------------------------------------------------
// Station tab
// ---------------------------------------------------------------------

interface StationTabProps {
  data: { orders: StationOrder[]; stations: Station[]; auditLog: AuditLogEntry[] } | null;
  months: string[];
  expandedMonths: Set<string>;
  onToggleMonth: (key: string) => void;
  onDownload: (month: string) => void;
  downloadingMonth: string | null;
}

function StationTab({ data, months, expandedMonths, onToggleMonth, onDownload, downloadingMonth }: StationTabProps) {
  if (!data) return <p className="py-10 text-center text-sm text-ink-400">Wird geladen …</p>;

  if (months.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
          <Archive size={26} />
        </div>
        <p className="text-sm font-medium text-ink-700">Noch keine Daten</p>
        <p className="max-w-[220px] text-xs text-ink-500">
          Sobald Sterimaterial-Bestellungen vorliegen, erscheinen hier monatliche Archive.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {months.map((month) => {
        const key = `station:${month}`;
        const stats = statsForStationMonth(data, month);
        const expanded = expandedMonths.has(key);
        return (
          <Card key={month} className="p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold capitalize text-ink-900">{formatMonthLabel(month)}</p>
                <p className="text-xs text-ink-500">
                  {stats.orderCount} Bestellungen · {stats.openCount} offen · {stats.fulfilledCount} abgeschlossen ·{' '}
                  {stats.auditCount} Audit-Einträge
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button variant="secondary" size="md" icon={expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />} onClick={() => onToggleMonth(key)}>
                  Ansehen
                </Button>
                <Button
                  size="md"
                  icon={<Download size={16} />}
                  onClick={() => onDownload(month)}
                  disabled={downloadingMonth !== null}
                  aria-label={downloadingMonth === month ? 'Wird erstellt' : 'Herunterladen'}
                />
              </div>
            </div>

            {expanded && <StationMonthDetail data={data} month={month} />}
          </Card>
        );
      })}
    </div>
  );
}

function StationMonthDetail({ data, month }: { data: NonNullable<StationTabProps['data']>; month: string }) {
  const records = selectMonthlyStationRecords(data, month);
  return (
    <div className="mt-3 space-y-3 border-t border-ink-100 pt-3">
      <RecordSection title={`Bestellungen (${records.orders.length})`}>
        {records.orders.map((o) => {
          const itemCount = o.lines.reduce((sum, l) => sum + l.quantity, 0);
          return (
            <RecordRow
              key={o.id}
              primary={records.stationById.get(o.stationId)?.name ?? 'Station'}
              secondary={`${itemCount} Artikel · ${AUFBEREITUNG_PRIORITAET_LABELS[o.priority]} · ${
                o.status === 'open' ? 'Offen' : 'Abgeschlossen'
              } · ${formatShortDate(o.orderedAt)}`}
            />
          );
        })}
      </RecordSection>

      <RecordSection title={`Audit-Log (${records.auditLog.length})`}>
        {records.auditLog.map((a) => (
          <RecordRow key={a.id} primary={ACTION_META[a.action]?.label ?? a.action} secondary={`${a.performedBy} · ${formatShortDate(a.createdAt)}`} />
        ))}
      </RecordSection>
    </div>
  );
}

// ---------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------

function RecordSection({ title, children }: { title: string; children: ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  const isEmpty = items.flat().length === 0;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">{title}</p>
      {isEmpty ? (
        <p className="text-xs text-ink-400">Keine Einträge</p>
      ) : (
        <div className="space-y-1 rounded-lg bg-ink-50 p-2">{children}</div>
      )}
    </div>
  );
}

function RecordRow({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="truncate font-medium text-ink-800">{primary}</span>
      <span className="shrink-0 text-ink-500">{secondary}</span>
    </div>
  );
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
