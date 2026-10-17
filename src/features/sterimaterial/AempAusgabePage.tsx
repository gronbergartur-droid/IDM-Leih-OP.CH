import { TopBar } from '@/components/layout/TopBar';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { dataProvider } from '@/services';
import { AUFBEREITUNG_PRIORITAET_LABELS, type Station, type StationOrder } from '@/types/database';
import { PackageCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * AEMP's own queue: only open orders waiting for "Ausgang aus AEMP" (see
 * StationOrderDetailPage), oldest first since that's the one AEMP should
 * process next - separate from StationOrdersPage, which is the stations'
 * own view of their orders (and where new orders are placed).
 */
export function AempAusgabePage() {
  const [orders, setOrders] = useState<StationOrder[] | null>(null);
  const [stations, setStations] = useState<Station[]>([]);

  useEffect(() => {
    Promise.all([dataProvider.getStationOrders(), dataProvider.getStations()]).then(([orderList, stationList]) => {
      setOrders(orderList.filter((o) => o.status === 'open').reverse());
      setStations(stationList);
    });
  }, []);

  return (
    <div>
      <TopBar title="Ausgabe AEMP" subtitle={orders ? `${orders.length} offen` : undefined} />

      <div className="px-4 py-4">
        {orders === null && <p className="py-10 text-center text-sm text-ink-400">Wird geladen …</p>}

        {orders !== null && orders.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
              <PackageCheck size={26} />
            </div>
            <p className="text-sm font-medium text-ink-700">Keine offenen Bestellungen</p>
            <p className="max-w-[220px] text-xs text-ink-500">
              Alle Bestellungen der Stationen sind ausgegeben.
            </p>
          </div>
        )}

        <div className="space-y-2.5">
          {orders?.map((order) => {
            const station = stations.find((s) => s.id === order.stationId);
            const itemCount = order.lines.reduce((sum, l) => sum + l.quantity, 0);
            return (
              <Link key={order.id} to={`/sterimaterial/${order.id}`} className="block">
                <Card className="flex items-center gap-3 p-3.5 active:bg-ink-50">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <PackageCheck size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{station?.name ?? 'Station'}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {itemCount} Artikel · {formatDateOnly(order.orderDate)}
                    </p>
                  </div>
                  <Badge tone="brand">{AUFBEREITUNG_PRIORITAET_LABELS[order.priority]}</Badge>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatDateOnly(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}
