import { TopBar } from '@/components/layout/TopBar';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth/AuthContext';
import { useEffect, useMemo, useState } from 'react';
import { loadAnalyticsData, type AnalyticsData } from '../services/analyticsService';
import type { AnalyticsFilter, DateRangePreset } from '../types/analytics';
import { computeInstrumentAnalytics } from '../utils/analyticsCalculations';

const PRESET_LABEL: Record<DateRangePreset, string> = {
  today: 'Heute',
  '7d': '7 Tage',
  '30d': '30 Tage',
  '90d': '90 Tage',
  year: 'Dieses Jahr',
  custom: 'Benutzerdefiniert',
};

const PRESETS: DateRangePreset[] = ['today', '7d', '30d', '90d', 'year'];

/**
 * Per-instrument breakdown (v2.2 Phase 6 - Advanced Analytics, docs
 * section 10), reached from the main Analytics dashboard. Same read-only /
 * admin+op_leitung gating as AnalyticsPage - see computeInstrumentAnalytics
 * for every grouping/scoping decision.
 */
export function InstrumentAnalyticsPage() {
  const { profile: me } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AnalyticsFilter>({
    preset: '30d',
    customRange: { start: null, end: null },
    supplierId: null,
  });

  const allowed = !me || me.role === 'admin' || me.role === 'op_leitung';

  useEffect(() => {
    if (!allowed) return;
    loadAnalyticsData()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Daten konnten nicht geladen werden.'));
  }, [allowed]);

  const [now] = useState(() => new Date());

  const rows = useMemo(
    () =>
      data
        ? computeInstrumentAnalytics(data.trays, data.trayInstrumentsByTrayId, data.cases, data.repairCases, filter, now)
        : [],
    [data, filter, now],
  );

  if (!allowed) {
    return (
      <div>
        <TopBar title="Instrument-Analytics" showBack />
        <p className="px-4 py-10 text-center text-sm text-ink-400">
          Nur Admins und OP-Leitung können Analytics einsehen.
        </p>
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Instrument-Analytics" subtitle="Read-only" showBack />

      <div className="px-4 py-4">
        {error && <p className="mb-3 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">{error}</p>}

        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setFilter((f) => ({ ...f, preset }))}
              className={[
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                filter.preset === preset ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600',
              ].join(' ')}
            >
              {PRESET_LABEL[preset]}
            </button>
          ))}
        </div>

        <select
          value={filter.supplierId ?? ''}
          onChange={(e) => setFilter((f) => ({ ...f, supplierId: e.target.value || null }))}
          className="mt-2 w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Alle Lieferanten</option>
          {data?.suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {!data ? (
          <p className="mt-10 text-center text-sm text-ink-400">Wird geladen …</p>
        ) : rows.length === 0 ? (
          <p className="mt-10 text-center text-sm text-ink-400">Keine Instrumente.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {rows.map((row) => (
              <Card key={row.key} className="p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-ink-900">{row.name}</p>
                  {row.wiederholungsreparatur && <Badge tone="warning">Wiederholungsreparatur</Badge>}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-2.5 text-center text-xs text-ink-500">
                  <div>
                    <p className="text-sm font-bold text-ink-900">{row.vorkommen}</p>
                    <p>Vorkommen</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-ink-900">{row.faelleAnzahl}</p>
                    <p>Fälle</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-ink-900">{row.abweichungenAnzahl}</p>
                    <p>Abweichungen</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-ink-900">{row.reparaturenAnzahl}</p>
                    <p>Reparaturen</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
