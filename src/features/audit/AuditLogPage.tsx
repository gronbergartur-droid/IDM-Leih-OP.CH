import { TopBar } from '@/components/layout/TopBar';
import { Card } from '@/components/ui/Card';
import { PhotoLightbox, PhotoThumbnail, type LightboxPhoto } from '@/components/ui/PhotoThumbnail';
import { dataProvider } from '@/services';
import type { AuditAction, AuditLogEntry, StationOrder } from '@/types/database';
import {
  Archive,
  BarChart3,
  CircleCheck,
  FileSearch,
  GitCompareArrows,
  Mail,
  Package,
  PackageCheck,
  PackagePlus,
  ScanSearch,
  ShieldCheck,
  ShieldX,
  SlidersHorizontal,
  Sparkles,
  Stethoscope,
  Trash2,
  Truck,
  UserPlus,
  Wrench,
} from 'lucide-react';
import { useEffect, useState } from 'react';

const ACTION_META: Record<AuditAction, { label: string; icon: typeof ShieldCheck; tone: string }> = {
  scan_started: { label: 'Scan gestartet', icon: ScanSearch, tone: 'text-ink-500 bg-ink-100' },
  scan_matched: { label: 'Sieb zugeordnet', icon: CircleCheck, tone: 'text-brand-600 bg-brand-50' },
  scan_unmatched: { label: 'Kein Treffer', icon: ShieldX, tone: 'text-warning-600 bg-warning-50' },
  scan_confirmed: { label: 'Kontrolle bestätigt', icon: ShieldCheck, tone: 'text-success-600 bg-success-50' },
  scan_cancelled: { label: 'Scan abgebrochen', icon: ShieldX, tone: 'text-danger-600 bg-danger-50' },
  instrument_manually_adjusted: { label: 'Manuell angepasst', icon: SlidersHorizontal, tone: 'text-warning-600 bg-warning-50' },
  supplier_created: { label: 'Lieferant angelegt', icon: UserPlus, tone: 'text-brand-600 bg-brand-50' },
  supplier_updated: { label: 'Lieferant bearbeitet', icon: Truck, tone: 'text-brand-600 bg-brand-50' },
  supplier_activated: { label: 'Lieferant aktiviert', icon: Truck, tone: 'text-success-600 bg-success-50' },
  supplier_deactivated: { label: 'Lieferant deaktiviert', icon: Truck, tone: 'text-ink-500 bg-ink-100' },
  supplier_deleted: { label: 'Lieferant gelöscht', icon: Trash2, tone: 'text-danger-600 bg-danger-50' },
  tray_created: { label: 'Sieb angelegt', icon: PackagePlus, tone: 'text-brand-600 bg-brand-50' },
  tray_updated: { label: 'Sieb bearbeitet', icon: PackagePlus, tone: 'text-brand-600 bg-brand-50' },
  case_intake: { label: 'Fall eröffnet (Eingang)', icon: ScanSearch, tone: 'text-brand-600 bg-brand-50' },
  case_outtake: { label: 'Ausgang erfasst', icon: ScanSearch, tone: 'text-brand-600 bg-brand-50' },
  case_compared: { label: 'Vergleich abgeschlossen', icon: GitCompareArrows, tone: 'text-success-600 bg-success-50' },
  case_readiness_notified: { label: 'Lieferant benachrichtigt', icon: Mail, tone: 'text-success-600 bg-success-50' },
  archive_downloaded: { label: 'Archiv heruntergeladen', icon: Archive, tone: 'text-brand-600 bg-brand-50' },
  physician_created: { label: 'Arzt angelegt', icon: Stethoscope, tone: 'text-brand-600 bg-brand-50' },
  repair_reported: { label: 'Reparatur gemeldet', icon: Wrench, tone: 'text-warning-600 bg-warning-50' },
  repair_closed: { label: 'Reparatur abgeschlossen', icon: Wrench, tone: 'text-success-600 bg-success-50' },
  repair_ai_analyzed: { label: 'KI-Analyse (Reparatur)', icon: Sparkles, tone: 'text-brand-600 bg-brand-50' },
  repair_ai_confirmed: { label: 'KI-Vorschlag bestätigt', icon: Sparkles, tone: 'text-success-600 bg-success-50' },
  analytics_exported: { label: 'Analytics exportiert', icon: BarChart3, tone: 'text-brand-600 bg-brand-50' },
  station_order_created: { label: 'Sterimaterial bestellt', icon: Package, tone: 'text-brand-600 bg-brand-50' },
  station_order_fulfilled: { label: 'Ausgang aus AEMP bestätigt', icon: PackageCheck, tone: 'text-success-600 bg-success-50' },
};

/** Audit actions whose entity carries a confirmation photo worth showing inline. */
const PHOTO_FIELD: Partial<Record<AuditAction, keyof StationOrder>> = {
  station_order_created: 'sendPhotoUrl',
  station_order_fulfilled: 'exitPhotoUrl',
};

export function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [stationOrders, setStationOrders] = useState<Map<string, StationOrder>>(new Map());
  const [lightboxPhoto, setLightboxPhoto] = useState<LightboxPhoto | null>(null);

  useEffect(() => {
    dataProvider.getAuditLog().then(setEntries);
    dataProvider.getStationOrders().then((orders) => setStationOrders(new Map(orders.map((o) => [o.id, o]))));
  }, []);

  return (
    <div>
      <TopBar title="Audit-Log" subtitle="Lückenlose Nachverfolgung" />

      <div className="px-4 py-4">
        {entries === null && <p className="py-10 text-center text-sm text-ink-400">Wird geladen …</p>}

        {entries !== null && entries.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
              <FileSearch size={26} />
            </div>
            <p className="text-sm font-medium text-ink-700">Noch keine Einträge</p>
            <p className="max-w-[220px] text-xs text-ink-500">
              Jede Sieb-Kontrolle wird hier automatisch und unveränderbar protokolliert.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {entries?.map((entry) => {
            const meta = ACTION_META[entry.action];
            const Icon = meta.icon;
            const photoField = PHOTO_FIELD[entry.action];
            const photoUrl = photoField ? (stationOrders.get(entry.entityId)?.[photoField] as string | null | undefined) : null;
            return (
              <Card key={entry.id} className="flex items-start gap-3 p-3.5">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.tone}`}>
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink-900">{meta.label}</p>
                    <span className="shrink-0 text-[11px] text-ink-400">{formatDate(entry.createdAt)}</span>
                  </div>
                  <p className="text-xs text-ink-500">{entry.performedBy}</p>
                  {Object.keys(entry.details).length > 0 && (
                    <p className="mt-1 truncate text-xs text-ink-400">{formatDetails(entry.details)}</p>
                  )}
                </div>
                {photoUrl && <PhotoThumbnail url={photoUrl} label={meta.label} onOpen={setLightboxPhoto} />}
              </Card>
            );
          })}
        </div>
      </div>

      <PhotoLightbox photo={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />
    </div>
  );
}

function formatDetails(details: Record<string, unknown>): string {
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
