import { TopBar } from '@/components/layout/TopBar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth/AuthContext';
import { dataProvider } from '@/services';
import { Download, Sparkles, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { loadAnalyticsData, type AnalyticsData } from '../services/analyticsService';
import type { AnalyticsAnswer, AnalyticsFilter, AnalyticsSnapshot, DateRangePreset } from '../types/analytics';
import {
  computeAbweichungenKpis,
  computeDefektarten,
  computeFaelleKpis,
  computeInstrumentAnalytics,
  computeLeihsiebeKpis,
  computeLifecycleTimes,
  computeReparaturKpis,
  computeSupplierAnalytics,
} from '../utils/analyticsCalculations';

const PRESET_LABEL: Record<DateRangePreset, string> = {
  today: 'Heute',
  '7d': '7 Tage',
  '30d': '30 Tage',
  '90d': '90 Tage',
  year: 'Dieses Jahr',
  custom: 'Benutzerdefiniert',
};

const PRESETS: DateRangePreset[] = ['today', '7d', '30d', '90d', 'year', 'custom'];

const EXAMPLE_QUESTIONS = [
  'Wie viele Fälle hatten Abweichungen?',
  'Welches Instrument hat am meisten Reparaturen?',
  'Wie lange dauerte die durchschnittliche Bearbeitung?',
];

/**
 * IDM Analytics MVP (v2.2 Phase 5) - read-only KPI dashboard computed
 * client-side from the same dataProvider getters every other screen uses
 * (see analyticsService.ts / analyticsCalculations.ts for the data flow and
 * every scoping decision). Never mutates operational data.
 */
export function AnalyticsPage() {
  const { profile: me, performedBy } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<AnalyticsAnswer | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
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

  // Stable per page visit, so memoized KPI calculations below don't recompute every render.
  const [now] = useState(() => new Date());

  const leihsiebe = useMemo(
    () => (data ? computeLeihsiebeKpis(data.cases, data.trays, filter, now) : null),
    [data, filter, now],
  );
  const faelle = useMemo(() => (data ? computeFaelleKpis(data.cases, filter, now) : null), [data, filter, now]);
  const abweichungen = useMemo(
    () => (data ? computeAbweichungenKpis(data.cases, data.scans, filter, now) : null),
    [data, filter, now],
  );
  const reparatur = useMemo(
    () => (data ? computeReparaturKpis(data.repairCases, filter, now) : null),
    [data, filter, now],
  );
  const defektarten = useMemo(
    () => (data ? computeDefektarten(data.repairCases, filter, now) : []),
    [data, filter, now],
  );
  const supplierRows = useMemo(
    () => (data ? computeSupplierAnalytics(data.suppliers, data.cases, data.trays, filter, now) : []),
    [data, filter, now],
  );
  const lifecycle = useMemo(() => (data ? computeLifecycleTimes(data.cases, filter, now) : null), [data, filter, now]);
  const instrumentRows = useMemo(
    () =>
      data
        ? computeInstrumentAnalytics(data.trays, data.trayInstrumentsByTrayId, data.cases, data.repairCases, filter, now)
        : [],
    [data, filter, now],
  );

  const filterLabel =
    filter.preset === 'custom'
      ? `Benutzerdefiniert (${filter.customRange.start?.slice(0, 10) ?? '…'} – ${filter.customRange.end?.slice(0, 10) ?? '…'})`
      : PRESET_LABEL[filter.preset];

  const snapshot: AnalyticsSnapshot | null =
    leihsiebe && faelle && abweichungen && reparatur && lifecycle
      ? { filterLabel, leihsiebe, faelle, abweichungen, reparatur, lifecycle, defektarten, supplierRows, instrumentRows }
      : null;

  const handleExport = async () => {
    if (!data || !leihsiebe || !faelle || !abweichungen || !reparatur || !lifecycle) return;
    setError(null);
    setExporting(true);
    try {
      // Dynamically imported so the (large) exceljs dependency only loads
      // when a user actually exports, not on every /analytics page view.
      const { buildAnalyticsExport } = await import('../utils/analyticsExport');
      const buffer = await buildAnalyticsExport({
        filterLabel,
        leihsiebe,
        faelle,
        abweichungen,
        reparatur,
        lifecycle,
        supplierRows,
        instrumentRows,
      });
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `IDM_Analytics_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      await dataProvider.appendAuditEntry({
        id: crypto.randomUUID(),
        entityType: 'analytics',
        entityId: crypto.randomUUID(),
        action: 'analytics_exported',
        performedBy,
        details: { filter: filterLabel, supplierId: filter.supplierId },
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export fehlgeschlagen.');
    } finally {
      setExporting(false);
    }
  };

  const handleAsk = async (q: string) => {
    if (!snapshot || !q.trim() || asking) return;
    setAskError(null);
    setAnswer(null);
    setAsking(true);
    try {
      const result = await dataProvider.askAnalyticsQuestion(q.trim(), snapshot);
      setAnswer(result);
    } catch (err) {
      setAskError(err instanceof Error ? err.message : 'Abfrage fehlgeschlagen.');
    } finally {
      setAsking(false);
    }
  };

  if (!allowed) {
    return (
      <div>
        <TopBar title="Analytics" showBack />
        <p className="px-4 py-10 text-center text-sm text-ink-400">
          Nur Admins und OP-Leitung können Analytics einsehen.
        </p>
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Analytics" subtitle="Read-only · basiert auf bestätigten Daten" showBack />

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

        {filter.preset === 'custom' && (
          <div className="mt-2 flex gap-2">
            <input
              type="date"
              value={filter.customRange.start?.slice(0, 10) ?? ''}
              onChange={(e) =>
                setFilter((f) => ({
                  ...f,
                  customRange: { ...f.customRange, start: e.target.value ? new Date(e.target.value).toISOString() : null },
                }))
              }
              className="flex-1 rounded-xl border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <input
              type="date"
              value={filter.customRange.end?.slice(0, 10) ?? ''}
              onChange={(e) =>
                setFilter((f) => ({
                  ...f,
                  customRange: {
                    ...f.customRange,
                    end: e.target.value ? new Date(e.target.value + 'T23:59:59.999Z').toISOString() : null,
                  },
                }))
              }
              className="flex-1 rounded-xl border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
        )}

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

        <Card className="mt-4 p-3.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
            <Sparkles size={14} className="text-brand-500" />
            <span>Frage an die Daten (Cloud Agent)</span>
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAsk(question)}
              placeholder="z. B. Welches Instrument hat am meisten Reparaturen?"
              className="flex-1 rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <Button size="md" disabled={!snapshot || !question.trim() || asking} onClick={() => handleAsk(question)}>
              {asking ? '…' : 'Fragen'}
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={!snapshot || asking}
                onClick={() => {
                  setQuestion(q);
                  handleAsk(q);
                }}
                className="rounded-full bg-ink-100 px-2.5 py-1 text-[11px] text-ink-600 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
          {askError && <p className="mt-2 rounded-xl bg-danger-50 p-2.5 text-xs text-danger-600">{askError}</p>}
          {answer && (
            <div className="mt-3 rounded-xl bg-brand-50 p-3">
              <p className="text-sm text-ink-900">{answer.answer}</p>
              {answer.basis.length > 0 && (
                <p className="mt-1.5 text-[11px] text-ink-400">Basis: {answer.basis.join(', ')}</p>
              )}
            </div>
          )}
        </Card>

        {!data ? (
          <p className="mt-10 text-center text-sm text-ink-400">Wird geladen …</p>
        ) : (
          <>
            <KpiGroup title="Leihsiebe">
              <Kpi label="Aktive Leihsiebe" value={leihsiebe!.aktiveLeihsiebe} />
              <Kpi label="Eingänge" value={leihsiebe!.eingaenge} />
              <Kpi label="Ausgänge" value={leihsiebe!.ausgaenge} />
              <Kpi label="Offene Fälle" value={leihsiebe!.offeneFaelle} />
              <Kpi label="Einsätze" value={leihsiebe!.einsaetze} />
              <Kpi label="Ø Verweildauer" value={formatHours(leihsiebe!.durchschnittlicheVerweildauerStunden)} />
            </KpiGroup>

            <KpiGroup title="Fälle">
              <Kpi label="Heute" value={faelle!.faelleHeute} />
              <Kpi label="7 Tage" value={faelle!.faelle7Tage} />
              <Kpi label="30 Tage" value={faelle!.faelle30Tage} />
              <Kpi label="Offen" value={faelle!.offeneFaelle} />
              <Kpi label="Abgeschlossen" value={faelle!.abgeschlosseneFaelle} />
            </KpiGroup>

            <KpiGroup title="Abweichungen">
              <Kpi label="Gesamt" value={abweichungen!.gesamt} tone={abweichungen!.gesamt > 0 ? 'warning' : 'neutral'} />
              <Kpi label="Fehlend" value={abweichungen!.fehlendeInstrumente} />
              <Kpi label="Zusätzlich" value={abweichungen!.zusaetzlicheInstrumente} />
              <Kpi label="Falsch" value={abweichungen!.falscheInstrumente} />
              <Kpi label="Mengenabweichung" value={abweichungen!.mengenabweichungen} />
              <Kpi label="Nicht erkannt" value={abweichungen!.nichtErkannt} />
            </KpiGroup>

            <KpiGroup title="Reparatur">
              <Kpi label="Reparaturfälle" value={reparatur!.reparaturfaelle} />
              <Kpi label="Offen" value={reparatur!.offeneReparaturen} />
              <Kpi label="Abgeschlossen" value={reparatur!.abgeschlosseneReparaturen} />
              <Kpi label="Wiederholungen" value={reparatur!.wiederholungsreparaturen} />
            </KpiGroup>

            <KpiGroup title="Durchlaufzeiten">
              <Kpi label="Eingang → OP" value={formatHours(lifecycle!.eingangZuOpStunden)} />
              <Kpi label="OP → Ausgang" value={formatHours(lifecycle!.opZuAusgangStunden)} />
              <Kpi label="Eingang → Ausgang" value={formatHours(lifecycle!.eingangZuAusgangStunden)} />
            </KpiGroup>

            <Link to="/analytics/instrumente" className="mt-4 block">
              <Card className="flex items-center gap-3 p-3.5 active:bg-ink-50">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Wrench size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900">Instrument-Analytics</p>
                  <p className="text-xs text-ink-500">Vorkommen, Fälle, Abweichungen und Reparaturen je Instrument</p>
                </div>
              </Card>
            </Link>

            <h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-ink-500">
              Lieferanten-Analytics
            </h3>
            <Card className="overflow-hidden p-0">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-ink-100 bg-ink-50 text-left text-ink-500">
                    <th className="px-3 py-2 font-medium">Lieferant</th>
                    <th className="px-2 py-2 font-medium">Siebe</th>
                    <th className="px-2 py-2 font-medium">Fälle</th>
                    <th className="px-2 py-2 font-medium">Abw.</th>
                    <th className="px-2 py-2 font-medium">Offen</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierRows.map((row) => (
                    <tr key={row.supplierId} className="border-b border-ink-50 last:border-0">
                      <td className="px-3 py-2 font-medium text-ink-900">{row.supplierName}</td>
                      <td className="px-2 py-2 text-ink-600">{row.siebeAnzahl}</td>
                      <td className="px-2 py-2 text-ink-600">{row.faelleAnzahl}</td>
                      <td className="px-2 py-2 text-ink-600">{row.abweichungenAnzahl}</td>
                      <td className="px-2 py-2 text-ink-600">{row.offeneFaelle}</td>
                    </tr>
                  ))}
                  {supplierRows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-ink-400">
                        Keine Lieferanten.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>

            <h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-ink-500">
              Defektarten (bestätigte KI-Vorschläge)
            </h3>
            <Card className="p-3.5">
              {defektarten.length === 0 ? (
                <p className="text-xs text-ink-400">Keine ausreichenden Daten.</p>
              ) : (
                <ul className="space-y-1.5">
                  {defektarten.map((d) => (
                    <li key={d.defekt} className="flex items-center justify-between text-sm">
                      <span className="text-ink-700">{d.defekt}</span>
                      <Badge tone="neutral">{d.anzahl}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Button
              variant="secondary"
              size="lg"
              fullWidth
              icon={<Download size={18} />}
              className="mt-6"
              disabled={exporting}
              onClick={handleExport}
            >
              {exporting ? 'Export wird erstellt …' : 'Als Excel exportieren'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function KpiGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h3 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-ink-500">{title}</h3>
      <div className="grid grid-cols-3 gap-2">{children}</div>
    </>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: 'warning' | 'neutral' }) {
  return (
    <Card className="p-3">
      <p className={['text-lg font-bold', tone === 'warning' ? 'text-warning-600' : 'text-ink-900'].join(' ')}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-tight text-ink-500">{label}</p>
    </Card>
  );
}

function formatHours(hours: number | null): string {
  if (hours === null) return 'N/A';
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} T`;
}
