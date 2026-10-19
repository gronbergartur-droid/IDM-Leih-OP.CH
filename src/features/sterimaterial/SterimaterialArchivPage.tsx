import { TopBar } from '@/components/layout/TopBar';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { PhotoLightbox, PhotoThumbnail, type LightboxPhoto } from '@/components/ui/PhotoThumbnail';
import { dataProvider } from '@/services';
import { AUFBEREITUNG_PRIORITAET_LABELS, type Station, type StationOrder } from '@/types/database';
import { Archive, Package } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isArchived } from './StationOrdersPage';

/**
 * Fulfilled orders past the midnight archival cutoff (see isArchived in
 * StationOrdersPage), grouped by month and optionally filtered to one
 * station - keeps the active Sterimaterial-Bestellung list from growing
 * forever while still letting a station look up what it ordered in a
 * given month.
 */
export function SterimaterialArchivPage() {
  const [orders, setOrders] = useState<StationOrder[] | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [stationFilter, setStationFilter] = useState('');
  const [lightboxPhoto, setLightboxPhoto] = useState<LightboxPhoto | null>(null);

  useEffect(() => {
    Promise.all([dataProvider.getStationOrders(), dataProvider.getStations()]).then(([orderList, stationList]) => {
      setOrders(orderList.filter(isArchived));
      setStations(stationList);
    });
  }, []);

  const filtered = useMemo(() => {
    if (!orders) return [];
    return stationFilter ? orders.filter((o) => o.stationId === stationFilter) : orders;
  }, [orders, stationFilter]);

  const months = useMemo(() => {
    const byMonth = new Map<string, StationOrder[]>();
    for (const order of filtered) {
      const key = monthKey(order.orderedAt);
      const list = byMonth.get(key) ?? [];
      list.push(order);
      byMonth.set(key, list);
    }
    return Array.from(byMonth.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered]);

  return (
    <div>
      <TopBar title="Archiv" subtitle="Abgeschlossene Bestellungen" showBack />

      <div className="px-4 py-4">
        {stations.length > 1 && (
          <label className="mb-4 block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Station</span>
            <select
              value={stationFilter}
              onChange={(e) => setStationFilter(e.target.value)}
              className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">Alle Stationen</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {orders === null && <p className="py-10 text-center text-sm text-ink-400">Wird geladen …</p>}

        {orders !== null && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
              <Archive size={26} />
            </div>
            <p className="text-sm font-medium text-ink-700">Noch nichts im Archiv</p>
            <p className="max-w-[220px] text-xs text-ink-500">
              Abgeschlossene Bestellungen erscheinen hier ab Mitternacht nach dem Tag der Ausgabe.
            </p>
          </div>
        )}

        {months.map(([key, monthOrders]) => (
          <div key={key} className="mb-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{formatMonth(key)}</p>
            <div className="space-y-2.5">
              {monthOrders.map((order) => {
                const station = stations.find((s) => s.id === order.stationId);
                const itemCount = order.lines.reduce((sum, l) => sum + l.quantity, 0);
                return (
                  <Card key={order.id} className="p-3.5">
                    <Link to={`/sterimaterial/${order.id}`} className="flex items-center gap-3 active:opacity-70">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-500">
                        <Package size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink-900">{station?.name ?? 'Station'}</p>
                        <p className="mt-0.5 truncate text-xs text-ink-500">
                          {itemCount} Artikel · {AUFBEREITUNG_PRIORITAET_LABELS[order.priority]} · {formatDate(order.orderedAt)}
                        </p>
                      </div>
                      <Badge tone="success">Abgeschlossen</Badge>
                    </Link>

                    {(order.sendPhotoUrl || order.exitPhotoUrl) && (
                      <div className="mt-3 flex gap-2 border-t border-ink-100 pt-3">
                        {order.sendPhotoUrl && (
                          <PhotoThumbnail
                            url={order.sendPhotoUrl}
                            label="Material vor dem Versand"
                            onOpen={setLightboxPhoto}
                          />
                        )}
                        {order.exitPhotoUrl && (
                          <PhotoThumbnail url={order.exitPhotoUrl} label="Ausgang aus AEMP" onOpen={setLightboxPhoto} />
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <PhotoLightbox photo={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />
    </div>
  );
}

function monthKey(iso: string): string {
  return iso.slice(0, 7); // "2026-10"
}

function formatMonth(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('de-CH', { month: 'long', year: 'numeric' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
