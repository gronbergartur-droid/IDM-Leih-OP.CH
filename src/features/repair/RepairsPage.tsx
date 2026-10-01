import { TopBar } from '@/components/layout/TopBar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { dataProvider } from '@/services';
import type { RepairCase, Tray } from '@/types/database';
import { Plus, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export function RepairsPage() {
  const [repairs, setRepairs] = useState<RepairCase[] | null>(null);
  const [trays, setTrays] = useState<Tray[]>([]);

  useEffect(() => {
    Promise.all([dataProvider.getRepairCases(), dataProvider.getTrays()]).then(([repairCases, trayList]) => {
      setRepairs(repairCases);
      setTrays(trayList);
    });
  }, []);

  const openCount = repairs?.filter((r) => r.status === 'open').length ?? 0;

  return (
    <div>
      <TopBar title="Reparaturen" subtitle={repairs ? `${openCount} offen` : undefined} />

      <div className="px-4 py-4">
        <Link to="/reparaturen/melden" className="block">
          <Button size="lg" fullWidth icon={<Plus size={18} />}>
            Reparatur melden
          </Button>
        </Link>

        {repairs === null && <p className="py-10 text-center text-sm text-ink-400">Wird geladen …</p>}

        {repairs !== null && repairs.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
              <Wrench size={26} />
            </div>
            <p className="text-sm font-medium text-ink-700">Noch keine Reparaturen gemeldet</p>
          </div>
        )}

        <div className="mt-4 space-y-2.5">
          {repairs?.map((repair) => {
            const tray = trays.find((t) => t.id === repair.trayId);
            return (
              <Link key={repair.id} to={`/reparaturen/${repair.id}`} className="block">
                <Card className="flex items-center gap-3 p-3.5 active:bg-ink-50">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-ink-100">
                    <img src={repair.overviewPhotoUrl} alt={repair.instrumentName} className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{repair.instrumentName}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {tray ? `${tray.code} · ` : ''}
                      {formatDate(repair.createdAt)}
                    </p>
                  </div>
                  <Badge tone={repair.status === 'open' ? 'warning' : 'success'}>
                    {repair.status === 'open' ? 'Offen' : 'Abgeschlossen'}
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
