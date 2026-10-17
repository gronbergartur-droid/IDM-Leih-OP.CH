import { TopBar } from '@/components/layout/TopBar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { dataProvider } from '@/services';
import { AUFBEREITUNG_PRIORITAET_LABELS, type Station, type StationOrder } from '@/types/database';
import { Package, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * Digital version of the AEMP paper "Bestellung Sterimaterial" form - the
 * stations' own view: order sterile material by checking quantities off
 * their own reference list (see NewStationOrderPage) and track every order
 * they've placed, open or fulfilled. AEMP's own queue of open orders to
 * process lives separately (see AempAusgabePage); both link into the same
 * StationOrderDetailPage, where the "Ausgang aus AEMP" photo confirmation
 * happens - never just a status flip on word alone.
 */
export function StationOrdersPage() {
  const [orders, setOrders] = useState<StationOrder[] | null>(null);
  const [stations, setStations] = useState<Station[]>([]);

  useEffect(() => {
    Promise.all([dataProvider.getStationOrders(), dataProvider.getStations()]).then(([orderList, stationList]) => {
      setOrders(orderList);
      setStations(stationList);
    });
  }, []);

  const openCount = orders?.filter((o) => o.status === 'open').length ?? 0;

  return (
    <div>
      <TopBar title="Sterimaterial-Bestellung" subtitle={orders ? `${openCount} offen` : undefined} />

      <div className="px-4 py-4">
        <Link to="/sterimaterial/bestellen" className="block">
          <Button size="lg" fullWidth icon={<Plus size={18} />}>
            Neue Bestellung
          </Button>
        </Link>

        {orders === null && <p className="py-10 text-center text-sm text-ink-400">Wird geladen …</p>}

        {orders !== null && orders.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
              <Package size={26} />
            </div>
            <p className="text-sm font-medium text-ink-700">Noch keine Bestellungen</p>
          </div>
        )}

        <div className="mt-4 space-y-2.5">
          {orders?.map((order) => {
            const station = stations.find((s) => s.id === order.stationId);
            const itemCount = order.lines.reduce((sum, l) => sum + l.quantity, 0);
            return (
              <Link key={order.id} to={`/sterimaterial/${order.id}`} className="block">
                <Card className="flex items-center gap-3 p-3.5 active:bg-ink-50">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Package size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{station?.name ?? 'Station'}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {itemCount} Artikel · {AUFBEREITUNG_PRIORITAET_LABELS[order.priority]} · {formatDate(order.orderedAt)}
                    </p>
                  </div>
                  <Badge tone={order.status === 'open' ? 'warning' : 'success'}>
                    {order.status === 'open' ? 'Offen' : 'Abgeschlossen'}
                  </Badge>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
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
