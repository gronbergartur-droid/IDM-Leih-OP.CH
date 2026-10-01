import { TopBar } from '@/components/layout/TopBar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth/AuthContext';
import { dataProvider } from '@/services';
import type { RepairCase, Tray } from '@/types/database';
import { CheckCircle2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export function RepairDetailPage() {
  const { repairId } = useParams<{ repairId: string }>();
  const { performedBy } = useAuth();
  const [repair, setRepair] = useState<RepairCase | null | undefined>(undefined);
  const [tray, setTray] = useState<Tray | null>(null);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!repairId) return;
    const found = await dataProvider.getRepairCase(repairId);
    setRepair(found);
    if (found?.trayId) {
      const trays = await dataProvider.getTrays();
      setTray(trays.find((t) => t.id === found.trayId) ?? null);
    }
  }, [repairId]);

  useEffect(() => {
    load();
  }, [load]);

  if (repair === undefined) {
    return (
      <div>
        <TopBar title="Reparatur" showBack />
        <p className="px-4 py-10 text-center text-sm text-ink-400">Wird geladen …</p>
      </div>
    );
  }

  if (repair === null || !repairId) {
    return (
      <div>
        <TopBar title="Reparatur" showBack />
        <p className="px-4 py-10 text-center text-sm text-ink-400">Reparatur nicht gefunden.</p>
      </div>
    );
  }

  const handleClose = async () => {
    setError(null);
    setClosing(true);
    try {
      await dataProvider.closeRepairCase(repairId, performedBy);
      await dataProvider.appendAuditEntry({
        id: crypto.randomUUID(),
        entityType: 'repair',
        entityId: repairId,
        action: 'repair_closed',
        performedBy,
        details: { instrumentName: repair.instrumentName },
        createdAt: new Date().toISOString(),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Abschliessen fehlgeschlagen.');
    } finally {
      setClosing(false);
    }
  };

  return (
    <div>
      <TopBar title={repair.instrumentName} subtitle={tray ? `${tray.code} · ${tray.name}` : undefined} showBack />

      <div className="px-4 py-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <Badge tone={repair.status === 'open' ? 'warning' : 'success'}>
              {repair.status === 'open' ? 'Offen' : 'Abgeschlossen'}
            </Badge>
            <p className="text-xs text-ink-500">{formatDate(repair.createdAt)}</p>
          </div>
          <p className="mt-3 text-sm text-ink-700">{repair.defectNote}</p>
          <p className="mt-2 text-xs text-ink-500">Gemeldet von {repair.performedBy}</p>
          {repair.status === 'closed' && repair.closedAt && (
            <p className="mt-0.5 text-xs text-ink-500">
              Abgeschlossen von {repair.closedBy} am {formatDate(repair.closedAt)}
            </p>
          )}
        </Card>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <PhotoTile label="Gesamt" url={repair.overviewPhotoUrl} />
          {repair.defectPhotoUrl && <PhotoTile label="Defekt" url={repair.defectPhotoUrl} />}
          {repair.refPhotoUrl && <PhotoTile label="REF" url={repair.refPhotoUrl} />}
        </div>

        {error && <p className="mt-3 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">{error}</p>}

        {repair.status === 'open' && (
          <Button
            size="lg"
            fullWidth
            icon={<CheckCircle2 size={18} />}
            className="mt-4"
            disabled={closing}
            onClick={handleClose}
          >
            {closing ? 'Wird gespeichert …' : 'Als abgeschlossen markieren'}
          </Button>
        )}
      </div>
    </div>
  );
}

function PhotoTile({ label, url }: { label: string; url: string }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-ink-100">
      <img src={url} alt={label} className="h-full w-full object-cover" />
      <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
        {label}
      </span>
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
