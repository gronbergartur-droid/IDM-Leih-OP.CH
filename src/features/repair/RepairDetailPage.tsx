import { TopBar } from '@/components/layout/TopBar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth/AuthContext';
import { dataProvider } from '@/services';
import type { AiConfirmationAction, RepairCase, Tray } from '@/types/database';
import { CheckCircle2, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CONFIDENCE_TIER_LABEL, confidenceTier } from './aiConfidence';

const AI_ACTION_LABEL: Record<AiConfirmationAction, string> = {
  accepted: 'übernommen',
  corrected: 'korrigiert',
  other_instrument: 'als anderes Instrument erfasst',
  rejected: 'abgelehnt',
};

export function RepairDetailPage() {
  const { repairId } = useParams<{ repairId: string }>();
  const { performedBy } = useAuth();
  const [repair, setRepair] = useState<RepairCase | null | undefined>(undefined);
  const [tray, setTray] = useState<Tray | null>(null);
  const [closing, setClosing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [correcting, setCorrecting] = useState<'corrected' | 'other_instrument' | null>(null);
  const [overrideName, setOverrideName] = useState('');
  const [overrideRef, setOverrideRef] = useState('');
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

  const handleAnalyze = async () => {
    setError(null);
    setAnalyzing(true);
    try {
      await dataProvider.analyzeRepairCase(repairId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'KI-Analyse fehlgeschlagen.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleConfirm = async (
    action: AiConfirmationAction,
    override: { instrumentName?: string; refNumber?: string } | null,
  ) => {
    setError(null);
    setConfirming(true);
    try {
      await dataProvider.confirmRepairAiSuggestion(repairId, action, override, performedBy);
      await dataProvider.appendAuditEntry({
        id: crypto.randomUUID(),
        entityType: 'repair',
        entityId: repairId,
        action: 'repair_ai_confirmed',
        performedBy,
        details: { decision: action },
        createdAt: new Date().toISOString(),
      });
      setCorrecting(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bestätigung fehlgeschlagen.');
    } finally {
      setConfirming(false);
    }
  };

  const startCorrecting = (mode: 'corrected' | 'other_instrument') => {
    setOverrideName(mode === 'corrected' ? (repair.aiSuggestion?.instrumentCandidate ?? '') : '');
    setOverrideRef(mode === 'corrected' ? (repair.aiSuggestion?.refCandidate ?? '') : '');
    setCorrecting(mode);
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
          {repair.refNumber && <p className="mt-2 font-mono text-xs text-ink-500">REF {repair.refNumber}</p>}
          <p className="mt-2 text-sm text-ink-700">{repair.defectNote}</p>
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

        {repair.status === 'open' && !repair.aiSuggestion && (
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            icon={<Sparkles size={18} />}
            className="mt-4"
            disabled={analyzing}
            onClick={handleAnalyze}
          >
            {analyzing ? 'Wird analysiert …' : 'KI-Analyse starten'}
          </Button>
        )}

        {repair.aiSuggestion && !repair.aiConfirmation && (
          <Card className="mt-4 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">KI-Vorschlag (unbestätigt)</p>
              <Badge tone={confidenceTierTone(repair.aiSuggestion.confidence)}>
                {CONFIDENCE_TIER_LABEL[confidenceTier(repair.aiSuggestion.confidence)]} · {repair.aiSuggestion.confidence}%
              </Badge>
            </div>
            <p className="mt-2 text-sm font-semibold text-ink-900">{repair.aiSuggestion.instrumentCandidate}</p>
            {repair.aiSuggestion.refCandidate && (
              <p className="font-mono text-xs text-ink-500">REF {repair.aiSuggestion.refCandidate}</p>
            )}
            {repair.aiSuggestion.defectCandidates.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {repair.aiSuggestion.defectCandidates.map((d) => (
                  <span key={d} className="rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-medium text-warning-700">
                    {d}
                  </span>
                ))}
              </div>
            )}
            {repair.aiSuggestion.evidence.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-ink-500">
                {repair.aiSuggestion.evidence.map((e, i) => (
                  <li key={i}>✓ {e}</li>
                ))}
              </ul>
            )}

            {!correcting && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button size="md" disabled={confirming} onClick={() => handleConfirm('accepted', null)}>
                  Übernehmen
                </Button>
                <Button variant="secondary" size="md" disabled={confirming} onClick={() => startCorrecting('corrected')}>
                  Korrigieren
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  disabled={confirming}
                  onClick={() => startCorrecting('other_instrument')}
                >
                  Anderes Instrument
                </Button>
                <Button variant="ghost" size="md" disabled={confirming} onClick={() => handleConfirm('rejected', null)}>
                  Ablehnen
                </Button>
              </div>
            )}

            {correcting && (
              <div className="mt-3 space-y-2">
                <input
                  value={overrideName}
                  onChange={(e) => setOverrideName(e.target.value)}
                  placeholder="Instrument"
                  className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <input
                  value={overrideRef}
                  onChange={(e) => setOverrideRef(e.target.value)}
                  placeholder="REF (optional)"
                  className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <div className="flex gap-2">
                  <Button
                    size="md"
                    fullWidth
                    disabled={!overrideName.trim() || confirming}
                    onClick={() => handleConfirm(correcting, { instrumentName: overrideName, refNumber: overrideRef })}
                  >
                    Speichern
                  </Button>
                  <Button variant="ghost" size="md" onClick={() => setCorrecting(null)}>
                    Abbrechen
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {repair.aiConfirmation && repair.aiSuggestion && (
          <Card className="mt-4 p-3.5 text-xs text-ink-500">
            <p className="font-semibold uppercase tracking-wide text-ink-400">
              KI-Vorschlag ({AI_ACTION_LABEL[repair.aiConfirmation]})
            </p>
            <p className="mt-1">
              {repair.aiSuggestion.instrumentCandidate}
              {repair.aiSuggestion.refCandidate ? ` · REF ${repair.aiSuggestion.refCandidate}` : ''} ·{' '}
              {repair.aiSuggestion.confidence}%
            </p>
            {repair.confirmedBy && repair.confirmedAt && (
              <p className="mt-1">
                Von {repair.confirmedBy} am {formatDate(repair.confirmedAt)}
              </p>
            )}
          </Card>
        )}

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

function confidenceTierTone(confidence: number): 'success' | 'warning' | 'danger' {
  const tier = confidenceTier(confidence);
  if (tier === 'strong') return 'success';
  if (tier === 'confirm') return 'warning';
  return 'danger';
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
