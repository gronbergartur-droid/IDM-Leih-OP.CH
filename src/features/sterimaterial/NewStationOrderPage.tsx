import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CameraCapture } from '@/features/scanner/CameraCapture';
import { useAuth } from '@/lib/auth/AuthContext';
import { dataProvider } from '@/services';
import {
  AUFBEREITUNG_PRIORITAET_LABELS,
  type AufbereitungsPrioritaet,
  type Station,
  type StationMaterialItem,
} from '@/types/database';
import { Minus, Plus, RotateCcw, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const PRIORITIES: AufbereitungsPrioritaet[] = ['express', '24h', '48h'];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Digital checklist matching a station's paper Bestellformular (quantity
 * stepper instead of tally marks), plus an Aufbereitung priority the paper
 * form doesn't capture digitally on its own. Only lines with quantity > 0
 * end up on the order. Also documents the "send" leg of the round trip to
 * AEMP - the paper form's "Datum" field, plus a photo of the material
 * being sent (same evidentiary pattern as the "Ausgang aus AEMP"
 * confirmation on the detail page). The paper form's "Name" field is
 * covered by the logged-in account's identity (orderedBy) instead of a
 * separate manual field.
 */
export function NewStationOrderPage() {
  const navigate = useNavigate();
  const { performedBy } = useAuth();
  const [stations, setStations] = useState<Station[]>([]);
  const [stationId, setStationId] = useState('');
  const [items, setItems] = useState<StationMaterialItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [priority, setPriority] = useState<AufbereitungsPrioritaet>('48h');
  const [note, setNote] = useState('');
  const [orderDate, setOrderDate] = useState(today());
  const [sendPhoto, setSendPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dataProvider.getStations().then((list) => {
      setStations(list);
      setStationId((current) => current || list[0]?.id || '');
    });
  }, []);

  useEffect(() => {
    if (!stationId) {
      setItems([]);
      return;
    }
    setQuantities({});
    dataProvider.getStationMaterialItems(stationId).then(setItems);
  }, [stationId]);

  const categories = useMemo(() => {
    const byCategory = new Map<string, StationMaterialItem[]>();
    for (const item of items) {
      const list = byCategory.get(item.category) ?? [];
      list.push(item);
      byCategory.set(item.category, list);
    }
    return Array.from(byCategory.entries());
  }, [items]);

  const selectedCount = Object.values(quantities).reduce((sum, q) => sum + q, 0);
  const canSubmit = selectedCount > 0 && stationId && orderDate && sendPhoto && !saving;

  const adjustQuantity = (itemId: string, delta: number) => {
    setQuantities((prev) => {
      const next = Math.max(0, (prev[itemId] ?? 0) + delta);
      return { ...prev, [itemId]: next };
    });
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setSaving(true);
    try {
      const lines = items
        .filter((item) => (quantities[item.id] ?? 0) > 0)
        .map((item) => ({
          materialItemId: item.id,
          category: item.category,
          name: item.name,
          quantity: quantities[item.id],
        }));
      const order = await dataProvider.createStationOrder({
        stationId,
        priority,
        lines,
        note: note.trim() || null,
        orderDate,
        sendPhotoUrl: sendPhoto!,
        orderedBy: performedBy,
      });
      await dataProvider.appendAuditEntry({
        id: crypto.randomUUID(),
        entityType: 'station_order',
        entityId: order.id,
        action: 'station_order_created',
        performedBy,
        details: { stationId, itemCount: selectedCount, priority },
        createdAt: new Date().toISOString(),
      });
      navigate(`/sterimaterial/${order.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bestellung fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <TopBar title="Neue Bestellung" showBack />
      <div className="px-4 py-4">
        {stations.length > 1 && (
          <label className="mb-4 block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Station</span>
            <select
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="mb-4 block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Datum</span>
          <input
            type="date"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Aufbereitung</p>
        <div className="mb-4 flex rounded-xl bg-ink-100 p-1 text-sm font-medium">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={[
                'flex-1 rounded-lg py-2 transition-colors',
                priority === p ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500',
              ].join(' ')}
            >
              {AUFBEREITUNG_PRIORITAET_LABELS[p]}
            </button>
          ))}
        </div>

        {categories.map(([category, categoryItems]) => (
          <div key={category} className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{category}</p>
            <Card className="divide-y divide-ink-100">
              {categoryItems.map((item) => {
                const qty = quantities[item.id] ?? 0;
                return (
                  <div key={item.id} className="flex items-center gap-3 px-3.5 py-3">
                    <p className="min-w-0 flex-1 truncate text-sm text-ink-900">{item.name}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => adjustQuantity(item.id, -1)}
                        disabled={qty === 0}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-ink-200 text-ink-600 active:bg-ink-50 disabled:opacity-40"
                        aria-label={`${item.name} weniger`}
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-5 text-center text-sm font-semibold text-ink-900">{qty}</span>
                      <button
                        type="button"
                        onClick={() => adjustQuantity(item.id, 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-200 bg-brand-50 text-brand-700 active:bg-brand-100"
                        aria-label={`${item.name} mehr`}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>
        ))}

        <label className="mb-4 block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
            Bemerkung (optional)
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="z. B. dringend für Schockraum"
            className="w-full rounded-xl border border-ink-200 px-3.5 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
          Foto des Materials vor dem Versand
        </p>
        {!sendPhoto && (
          <div className="mb-4">
            <CameraCapture onCapture={setSendPhoto} />
          </div>
        )}
        {sendPhoto && (
          <div className="mb-4">
            <div className="overflow-hidden rounded-2xl bg-ink-900">
              <img src={sendPhoto} alt="Material vor dem Versand" className="w-full object-contain" />
            </div>
            <Button
              variant="secondary"
              size="md"
              icon={<RotateCcw size={16} />}
              className="mt-2"
              onClick={() => setSendPhoto(null)}
            >
              Neu fotografieren
            </Button>
          </div>
        )}

        {error && <p className="mb-3 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">{error}</p>}

        <Button size="lg" fullWidth icon={<Send size={18} />} disabled={!canSubmit} onClick={handleSubmit}>
          {saving ? 'Wird gesendet …' : `Bestellen${selectedCount > 0 ? ` (${selectedCount} Artikel)` : ''}`}
        </Button>
      </div>
    </div>
  );
}
