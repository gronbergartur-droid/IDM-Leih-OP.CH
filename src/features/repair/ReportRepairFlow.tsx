import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth/AuthContext';
import { dataProvider } from '@/services';
import type { Tray } from '@/types/database';
import { Camera, CheckCircle2, SkipForward, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CameraCapture } from '../scanner/CameraCapture';
import { computeDHash } from './imageHash';

type Step = 'photo-overview' | 'photo-defect' | 'photo-ref' | 'details' | 'done';

const STEP_TITLES: Record<Step, string> = {
  'photo-overview': 'Foto: Gesamtansicht',
  'photo-defect': 'Foto: Defekt',
  'photo-ref': 'Foto: REF/Artikelnummer',
  details: 'Angaben zur Reparatur',
  done: 'Reparatur gemeldet',
};

/**
 * Phase 2 (v2.2 roadmap) - Repair Photo Foundation: capture + storage + UI
 * only, no AI recognition yet. Mirrors the photo sequence the future Cloud
 * Agent flow will reuse (Gesamtansicht -> Defekt -> REF), so Phase 3 can
 * slot recognition in between capture and confirmation without reshaping
 * this screen.
 */
export function ReportRepairFlow() {
  const navigate = useNavigate();
  const { performedBy } = useAuth();
  const [step, setStep] = useState<Step>('photo-overview');
  const [overviewPhoto, setOverviewPhoto] = useState<string | null>(null);
  const [defectPhoto, setDefectPhoto] = useState<string | null>(null);
  const [refPhoto, setRefPhoto] = useState<string | null>(null);
  const [trays, setTrays] = useState<Tray[]>([]);
  const [trayId, setTrayId] = useState<string>('');
  const [instrumentName, setInstrumentName] = useState('');
  const [defectNote, setDefectNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dataProvider.getTrays().then(setTrays);
  }, []);

  const canSubmit = instrumentName.trim().length > 0 && defectNote.trim().length > 0 && overviewPhoto;

  const handleSubmit = async () => {
    if (!canSubmit || saving || !overviewPhoto) return;
    setError(null);
    setSaving(true);
    try {
      const tray = trays.find((t) => t.id === trayId) ?? null;
      const photoHash = await computeDHash(overviewPhoto).catch(() => null);
      const repairCase = await dataProvider.createRepairCase({
        trayId: tray?.id ?? null,
        supplierId: tray?.supplierId ?? null,
        instrumentName: instrumentName.trim(),
        overviewPhotoUrl: overviewPhoto,
        defectPhotoUrl: defectPhoto,
        refPhotoUrl: refPhoto,
        photoHash,
        defectNote: defectNote.trim(),
        performedBy,
      });
      await dataProvider.appendAuditEntry({
        id: crypto.randomUUID(),
        entityType: 'repair',
        entityId: repairCase.id,
        action: 'repair_reported',
        performedBy,
        details: { instrumentName: repairCase.instrumentName, trayCode: tray?.code },
        createdAt: new Date().toISOString(),
      });
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Melden fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  if (step === 'photo-overview' || step === 'photo-defect' || step === 'photo-ref') {
    const isOptional = step !== 'photo-overview';
    const handleCapture = (dataUrl: string) => {
      if (step === 'photo-overview') setOverviewPhoto(dataUrl);
      else if (step === 'photo-defect') setDefectPhoto(dataUrl);
      else setRefPhoto(dataUrl);
      setStep(step === 'photo-overview' ? 'photo-defect' : step === 'photo-defect' ? 'photo-ref' : 'details');
    };
    return (
      <div>
        <TopBar
          title={STEP_TITLES[step]}
          subtitle={isOptional ? 'Optional' : 'Pflicht'}
          showBack
          onBack={() => navigate(-1)}
        />
        <div className="px-4 py-4">
          <CameraCapture onCapture={handleCapture} />
          {isOptional && (
            <Button
              variant="ghost"
              size="md"
              fullWidth
              className="mt-3"
              icon={<SkipForward size={16} />}
              onClick={() => setStep(step === 'photo-defect' ? 'photo-ref' : 'details')}
            >
              Überspringen
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div>
        <TopBar title={STEP_TITLES.done} />
        <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-50 text-success-600">
            <CheckCircle2 size={30} />
          </div>
          <h2 className="text-lg font-semibold text-ink-900">Reparatur gemeldet</h2>
          <p className="text-sm text-ink-500">Die Meldung wurde gespeichert und im Audit-Log protokolliert.</p>
          <div className="mt-4 flex w-full flex-col gap-2">
            <Button size="lg" fullWidth onClick={() => navigate('/reparaturen')}>
              Zu den Reparaturen
            </Button>
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              onClick={() => {
                setOverviewPhoto(null);
                setDefectPhoto(null);
                setRefPhoto(null);
                setTrayId('');
                setInstrumentName('');
                setDefectNote('');
                setStep('photo-overview');
              }}
            >
              Weitere Reparatur melden
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // step === 'details'
  return (
    <div>
      <TopBar title={STEP_TITLES.details} showBack onBack={() => setStep('photo-ref')} />
      <div className="px-4 py-4">
        <Card className="space-y-4 p-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
              Instrument *
            </span>
            <input
              value={instrumentName}
              onChange={(e) => setInstrumentName(e.target.value)}
              placeholder="z. B. Chirurgische Schere, gebogen"
              className="w-full rounded-xl border border-ink-200 px-3.5 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
              Sieb (falls bekannt)
            </span>
            <select
              value={trayId}
              onChange={(e) => setTrayId(e.target.value)}
              className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">– Nicht zugeordnet –</option>
              {trays.map((tray) => (
                <option key={tray.id} value={tray.id}>
                  {tray.code} · {tray.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
              Fehlerbeschreibung *
            </span>
            <textarea
              value={defectNote}
              onChange={(e) => setDefectNote(e.target.value)}
              rows={3}
              placeholder="z. B. Spitze verbogen, schneidet nicht mehr sauber"
              className="w-full rounded-xl border border-ink-200 px-3.5 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
        </Card>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <PhotoThumb label="Gesamt" url={overviewPhoto} onRetake={() => setStep('photo-overview')} />
          <PhotoThumb label="Defekt" url={defectPhoto} onRetake={() => setStep('photo-defect')} />
          <PhotoThumb label="REF" url={refPhoto} onRetake={() => setStep('photo-ref')} />
        </div>

        {error && <p className="mt-3 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">{error}</p>}

        <Button
          size="lg"
          fullWidth
          icon={<Wrench size={18} />}
          className="mt-4"
          disabled={!canSubmit || saving}
          onClick={handleSubmit}
        >
          {saving ? 'Wird gespeichert …' : 'Reparatur melden'}
        </Button>
      </div>
    </div>
  );
}

function PhotoThumb({ label, url, onRetake }: { label: string; url: string | null; onRetake: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetake}
      className="relative aspect-square overflow-hidden rounded-xl border border-ink-200 bg-ink-50"
    >
      {url ? (
        <img src={url} alt={label} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-ink-400">
          <Camera size={18} />
        </div>
      )}
      <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
        {label}
      </span>
    </button>
  );
}
