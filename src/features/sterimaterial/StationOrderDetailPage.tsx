import { TopBar } from '@/components/layout/TopBar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CameraCapture } from '@/features/scanner/CameraCapture';
import { useAuth } from '@/lib/auth/AuthContext';
import { dataProvider } from '@/services';
import { AUFBEREITUNG_PRIORITAET_LABELS, type Station, type StationOrder } from '@/types/database';
import { Check, PackageCheck, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

/**
 * "Ausgang aus AEMP" is confirmed with a photo, not a status flip on word
 * alone - same evidentiary pattern as HygienePassPage's hygiene-passport
 * photo for loaner Siebe.
 */
export function StationOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { performedBy } = useAuth();
  const [order, setOrder] = useState<StationOrder | null | undefined>(undefined);
  const [station, setStation] = useState<Station | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [exitPhoto, setExitPhoto] = useState<string | null>(null);
  const [confirmerName, setConfirmerName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setConfirmerName((current) => current || performedBy);
  }, [performedBy]);

  useEffect(() => {
    if (!orderId) return;
    dataProvider.getStationOrder(orderId).then(async (found) => {
      setOrder(found);
      if (found) {
        const stations = await dataProvider.getStations();
        setStation(stations.find((s) => s.id === found.stationId) ?? null);
      }
    });
  }, [orderId]);

  const categories = useMemo(() => {
    if (!order) return [];
    const byCategory = new Map<string, typeof order.lines>();
    for (const line of order.lines) {
      const list = byCategory.get(line.category) ?? [];
      list.push(line);
      byCategory.set(line.category, list);
    }
    return Array.from(byCategory.entries());
  }, [order]);

  const handleConfirmExit = async () => {
    if (!orderId || !exitPhoto || !confirmerName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await dataProvider.fulfillStationOrder(orderId, exitPhoto, confirmerName.trim(), performedBy);
      await dataProvider.appendAuditEntry({
        id: crypto.randomUUID(),
        entityType: 'station_order',
        entityId: orderId,
        action: 'station_order_fulfilled',
        performedBy,
        details: {},
        createdAt: new Date().toISOString(),
      });
      setOrder(updated);
      setConfirming(false);
      setExitPhoto(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bestätigung fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  if (order === undefined) {
    return (
      <div>
        <TopBar title="Bestellung" showBack />
        <p className="px-4 py-10 text-center text-sm text-ink-400">Wird geladen …</p>
      </div>
    );
  }

  if (order === null) {
    return (
      <div>
        <TopBar title="Bestellung" showBack />
        <p className="px-4 py-10 text-center text-sm text-ink-400">Bestellung nicht gefunden.</p>
      </div>
    );
  }

  return (
    <div>
      <TopBar title={station?.name ?? 'Bestellung'} subtitle={formatDate(order.orderedAt)} showBack />
      <div className="px-4 py-4">
        <div className="mb-4 flex items-center gap-2">
          <Badge tone={order.status === 'open' ? 'warning' : 'success'}>
            {order.status === 'open' ? 'Offen' : 'Abgeschlossen'}
          </Badge>
          <Badge tone="brand">{AUFBEREITUNG_PRIORITAET_LABELS[order.priority]}</Badge>
          <span className="text-xs text-ink-500">bestellt von {order.orderedBy}</span>
        </div>

        <Card className="mb-4 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">An AEMP gesendet</p>
          <p className="mt-1 text-sm text-ink-700">
            {order.senderName} · {formatDateOnly(order.orderDate)}
          </p>
          {order.sendPhotoUrl && (
            <div className="mt-3 overflow-hidden rounded-xl bg-ink-900">
              <img src={order.sendPhotoUrl} alt="Material vor dem Versand" className="w-full object-contain" />
            </div>
          )}
        </Card>

        {order.note && (
          <Card className="mb-4 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Bemerkung</p>
            <p className="mt-1 text-sm text-ink-700">{order.note}</p>
          </Card>
        )}

        {categories.map(([category, lines]) => (
          <div key={category} className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{category}</p>
            <Card className="divide-y divide-ink-100">
              {lines.map((line) => (
                <div key={line.materialItemId} className="flex items-center justify-between px-3.5 py-2.5">
                  <p className="text-sm text-ink-900">{line.name}</p>
                  <span className="text-sm font-semibold text-ink-700">×{line.quantity}</span>
                </div>
              ))}
            </Card>
          </div>
        ))}

        {order.status === 'fulfilled' && (
          <Card className="mt-2 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Ausgang aus AEMP bestätigt</p>
            <p className="mt-1 text-sm text-ink-700">
              {order.fulfilledByName} · {order.fulfilledAt && formatDate(order.fulfilledAt)}
            </p>
            {order.exitPhotoUrl && (
              <div className="mt-3 overflow-hidden rounded-xl bg-ink-900">
                <img src={order.exitPhotoUrl} alt="Ausgang aus AEMP" className="w-full object-contain" />
              </div>
            )}
          </Card>
        )}

        {order.status === 'open' && !confirming && (
          <Button size="lg" fullWidth icon={<PackageCheck size={18} />} className="mt-2" onClick={() => setConfirming(true)}>
            Ausgang aus AEMP bestätigen
          </Button>
        )}

        {order.status === 'open' && confirming && (
          <div className="mt-2">
            <p className="mb-3 text-sm text-ink-600">
              Foto des ausgegebenen Materials aufnehmen, bevor es die AEMP verlässt.
            </p>
            <label className="mb-3 block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
                Name (bitte leserlich)
              </span>
              <input
                type="text"
                value={confirmerName}
                onChange={(e) => setConfirmerName(e.target.value)}
                placeholder="Vorname Nachname"
                className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </label>
            {!exitPhoto && <CameraCapture onCapture={setExitPhoto} />}
            {exitPhoto && (
              <>
                <div className="overflow-hidden rounded-2xl bg-ink-900">
                  <img src={exitPhoto} alt="Ausgang aus AEMP" className="w-full object-contain" />
                </div>
                {error && <p className="mt-3 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">{error}</p>}
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="secondary"
                    size="lg"
                    icon={<RotateCcw size={18} />}
                    onClick={() => setExitPhoto(null)}
                    disabled={saving}
                  >
                    Neu fotografieren
                  </Button>
                  <Button
                    size="lg"
                    fullWidth
                    icon={<Check size={18} />}
                    onClick={handleConfirmExit}
                    disabled={saving || !confirmerName.trim()}
                  >
                    {saving ? 'Wird gespeichert …' : 'Bestätigen'}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
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

function formatDateOnly(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}
