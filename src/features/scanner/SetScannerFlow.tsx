import { TopBar } from '@/components/layout/TopBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { dataProvider } from '@/services';
import type { Physician } from '@/types/database';
import JSZip from 'jszip';
import { Download, FileText, PackageCheck, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CameraCapture } from './CameraCapture';
import { readTextFromImage } from './recognition/ocrReader';
import { ScannerFlow } from './ScannerFlow';

const MIN_SIEBE = 2;
const MAX_SIEBE = 10;
const MAX_PHOTOS_PER_SIEB = 3;

/** Case-insensitive substrings in a Lieferschein/document photo that flag possibly missing instruments. */
const WARNING_KEYWORDS = ['fehlt', 'nicht verfügbar', 'nicht verfuegbar', 'achtung'];

interface SetSieb {
  id: string;
  /** photos[0] is the mandatory overview shot; further entries are optional detail/barcode close-ups. */
  photos: string[];
}

interface SetDocument {
  id: string;
  photo: string;
}

type AddTarget = { kind: 'new' } | { kind: 'existing'; siebIndex: number } | { kind: 'document' };

type SetStep = 'overview' | 'adding' | 'processing' | 'summary';

const PHOTO_LABEL = (index: number) => (index === 0 ? 'Übersicht' : `Detail ${index}`);

/**
 * A delivered "SET" is a single shipment containing several different
 * Siebe, and each Sieb is often photographed more than once (an overview
 * shot plus a barcode/detail close-up) for reliable recognition. This
 * screen collects 2-10 Siebe upfront, each with 1-3 photos, then runs the
 * existing single-Sieb ScannerFlow once per Sieb in sequence - all of a
 * Sieb's photos feed one recognition/match/instrument check together,
 * chained across Siebe with progress shown.
 */
export function SetScannerFlow() {
  const navigate = useNavigate();
  const [step, setStep] = useState<SetStep>('overview');
  const [siebe, setSiebe] = useState<SetSieb[]>([]);
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [physicians, setPhysicians] = useState<Physician[]>([]);
  const [operateurId, setOperateurId] = useState<string | null>(null);
  const [operationDate, setOperationDate] = useState('');
  const [documents, setDocuments] = useState<SetDocument[]>([]);
  const [documentWarnings, setDocumentWarnings] = useState<string[] | null>(null);
  const [zipping, setZipping] = useState(false);
  const checkingDocuments = step === 'summary' && documents.length > 0 && documentWarnings === null;

  useEffect(() => {
    dataProvider.getPhysicians().then(setPhysicians);
  }, []);

  const physiciansByDepartment = useMemo(() => {
    const groups = new Map<string, Physician[]>();
    for (const p of physicians) {
      const list = groups.get(p.department) ?? [];
      list.push(p);
      groups.set(p.department, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [physicians]);

  const handleCapture = (dataUrl: string) => {
    if (!addTarget) return;
    if (addTarget.kind === 'new') {
      setSiebe((prev) => [...prev, { id: crypto.randomUUID(), photos: [dataUrl] }]);
    } else if (addTarget.kind === 'existing') {
      const { siebIndex } = addTarget;
      setSiebe((prev) =>
        prev.map((sieb, index) => (index === siebIndex ? { ...sieb, photos: [...sieb.photos, dataUrl] } : sieb)),
      );
    } else {
      setDocuments((prev) => [...prev, { id: crypto.randomUUID(), photo: dataUrl }]);
    }
    setAddTarget(null);
    setStep('overview');
  };

  const handleRemoveSieb = (index: number) => {
    setSiebe((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveDocument = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const handleRemovePhoto = (siebIndex: number, photoIndex: number) => {
    setSiebe((prev) =>
      prev.map((sieb, index) =>
        index === siebIndex ? { ...sieb, photos: sieb.photos.filter((_, pi) => pi !== photoIndex) } : sieb,
      ),
    );
  };

  const handleStartProcessing = () => {
    setCurrentIndex(0);
    setStep('processing');
  };

  const handleSetItemDone = () => {
    if (currentIndex + 1 < siebe.length) {
      setCurrentIndex((i) => i + 1);
    } else {
      setStep('summary');
    }
  };

  useEffect(() => {
    if (step !== 'summary' || documents.length === 0 || documentWarnings !== null) return;
    let cancelled = false;
    (async () => {
      const matches = new Set<string>();
      for (const doc of documents) {
        const { text } = await readTextFromImage(doc.photo);
        const lower = text.toLowerCase();
        for (const keyword of WARNING_KEYWORDS) {
          if (lower.includes(keyword)) matches.add(keyword);
        }
      }
      if (!cancelled) {
        setDocumentWarnings([...matches]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, documents, documentWarnings]);

  const handleDownloadDocumentsZip = async () => {
    if (documents.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      for (const [index, doc] of documents.entries()) {
        const response = await fetch(doc.photo);
        const blob = await response.blob();
        const extension = blob.type.includes('png') ? '.png' : '.jpg';
        zip.file(`Dokument_${index + 1}${extension}`, blob);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Sieb-SET_Dokumente_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  };

  if (step === 'adding') {
    const isNew = addTarget?.kind === 'new';
    const isDocument = addTarget?.kind === 'document';
    const title = isNew ? `Sieb ${siebe.length + 1} – Übersicht` : isDocument ? 'Dokument / Lieferschein' : 'Weiteres Foto';
    const subtitle = isNew
      ? 'Foto des ganzen Siebs'
      : isDocument
        ? 'Foto des Lieferscheins oder Begleitdokuments'
        : `Sieb ${addTarget && addTarget.kind === 'existing' ? addTarget.siebIndex + 1 : ''} – Detail/Barcode`;
    return (
      <div>
        <TopBar
          title={title}
          subtitle={subtitle}
          showBack
          onBack={() => {
            setAddTarget(null);
            setStep('overview');
          }}
        />
        <div className="px-4 py-4">
          <CameraCapture onCapture={handleCapture} />
        </div>
      </div>
    );
  }

  if (step === 'processing') {
    return (
      <ScannerFlow
        key={currentIndex}
        mode={{ kind: 'standalone' }}
        initialImageDataUrls={siebe[currentIndex].photos}
        setProgress={{ index: currentIndex + 1, total: siebe.length }}
        onSetItemDone={handleSetItemDone}
        presetOperateurId={operateurId}
        presetOperationDate={operationDate || null}
      />
    );
  }

  if (step === 'summary') {
    return (
      <div>
        <TopBar title="SET abgeschlossen" />
        <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-50 text-success-600">
            <PackageCheck size={30} />
          </div>
          <h2 className="text-lg font-semibold text-ink-900">SET erfasst</h2>
          <p className="text-sm text-ink-500">
            {siebe.length} Siebe wurden einzeln kontrolliert, gespeichert und im Audit-Log protokolliert.
          </p>

          {checkingDocuments && (
            <p className="text-xs text-ink-400">Dokumente werden geprüft …</p>
          )}

          {documentWarnings && documentWarnings.length > 0 && (
            <Button
              variant="danger"
              size="lg"
              fullWidth
              icon={<TriangleAlert size={18} />}
              onClick={() =>
                window.alert(
                  `Im Lieferschein/Dokument wurde folgender Hinweis erkannt: "${documentWarnings.join('", "')}". Bitte Instrumente prüfen.`,
                )
              }
            >
              Achtung: Fehlende Instrumente laut Dokument
            </Button>
          )}

          {documents.length > 0 && (
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              icon={<Download size={18} />}
              disabled={zipping}
              onClick={handleDownloadDocumentsZip}
            >
              {zipping ? 'Wird erstellt …' : `Dokumente als ZIP herunterladen (${documents.length})`}
            </Button>
          )}

          <div className="mt-4 flex w-full flex-col gap-2">
            <Button size="lg" fullWidth onClick={() => navigate('/historie')}>
              Zur Sieb-Historie
            </Button>
            <Button
              variant="secondary"
              size="lg"
              fullWidth
              onClick={() => {
                setSiebe([]);
                setCurrentIndex(0);
                setOperateurId(null);
                setOperationDate('');
                setDocuments([]);
                setDocumentWarnings(null);
                setStep('overview');
              }}
            >
              Neues SET erfassen
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // step === 'overview'
  return (
    <div>
      <TopBar title="Sieb-SET erfassen" subtitle={`${siebe.length} von ${MIN_SIEBE}-${MAX_SIEBE} Sieben`} showBack />
      <div className="px-4 py-4">
        <p className="mb-4 text-sm text-ink-600">
          Für ein SET (mehrere Leihsiebe in einer Lieferung) pro Sieb 1-3 Fotos aufnehmen (Übersicht Pflicht, Detail/
          Barcode optional) - danach wird jedes Sieb einzeln anhand all seiner Fotos erkannt, zugeordnet und
          kontrolliert.
        </p>

        <Card className="mb-4 space-y-4 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Angaben zur Operation</p>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Operateur</span>
            <select
              value={operateurId ?? ''}
              onChange={(e) => setOperateurId(e.target.value || null)}
              className="w-full rounded-xl border border-ink-200 px-3.5 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">– Nicht ausgewählt –</option>
              {physiciansByDepartment.map(([department, list]) => (
                <optgroup key={department} label={department}>
                  {list.map((physician) => (
                    <option key={physician.id} value={physician.id}>
                      {physician.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">OP-Datum</span>
            <input
              type="date"
              value={operationDate}
              onChange={(e) => setOperationDate(e.target.value)}
              className="w-full rounded-xl border border-ink-200 px-3.5 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
        </Card>

        <Card className="mb-4 p-3.5">
          <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
            <FileText size={13} /> Dokumente / Lieferschein
          </p>
          <div className="grid grid-cols-3 gap-2">
            {documents.map((doc) => (
              <div key={doc.id} className="relative aspect-square overflow-hidden rounded-xl bg-ink-100">
                <img src={doc.photo} alt="Dokument" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => handleRemoveDocument(doc.id)}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white active:bg-black/80"
                  aria-label="Dokument entfernen"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                setAddTarget({ kind: 'document' });
                setStep('adding');
              }}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-ink-200 text-ink-400 active:bg-ink-50"
            >
              <Plus size={18} />
              <span className="text-[10px] font-medium">Dokument</span>
            </button>
          </div>
        </Card>

        <div className="flex flex-col gap-3">
          {siebe.map((sieb, siebIndex) => (
            <Card key={sieb.id} className="p-3.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-ink-900">Sieb {siebIndex + 1}</p>
                <button
                  type="button"
                  onClick={() => handleRemoveSieb(siebIndex)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-ink-400 active:bg-ink-100"
                  aria-label={`Sieb ${siebIndex + 1} entfernen`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {sieb.photos.map((photo, photoIndex) => (
                  <div key={photoIndex} className="relative aspect-square overflow-hidden rounded-xl bg-ink-100">
                    <img src={photo} alt={`Sieb ${siebIndex + 1} – ${PHOTO_LABEL(photoIndex)}`} className="h-full w-full object-cover" />
                    {sieb.photos.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(siebIndex, photoIndex)}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white active:bg-black/80"
                        aria-label={`Foto ${PHOTO_LABEL(photoIndex)} entfernen`}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                    <span className="absolute bottom-1 left-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {PHOTO_LABEL(photoIndex)}
                    </span>
                  </div>
                ))}

                {sieb.photos.length < MAX_PHOTOS_PER_SIEB && (
                  <button
                    type="button"
                    onClick={() => {
                      setAddTarget({ kind: 'existing', siebIndex });
                      setStep('adding');
                    }}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-ink-200 text-ink-400 active:bg-ink-50"
                  >
                    <Plus size={18} />
                    <span className="text-[10px] font-medium">Detailfoto</span>
                  </button>
                )}
              </div>
            </Card>
          ))}

          {siebe.length < MAX_SIEBE && (
            <button
              type="button"
              onClick={() => {
                setAddTarget({ kind: 'new' });
                setStep('adding');
              }}
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 px-4 py-4 text-sm font-medium text-ink-500 active:bg-ink-50"
            >
              <Plus size={18} />
              Neues Sieb hinzufügen
            </button>
          )}
        </div>

        {siebe.length > 0 && siebe.length < MIN_SIEBE && (
          <p className="mt-3 text-xs text-ink-500">Mindestens {MIN_SIEBE} Siebe für ein SET nötig.</p>
        )}

        <Card className="mt-4 p-3.5">
          <Button size="lg" fullWidth disabled={siebe.length < MIN_SIEBE} onClick={handleStartProcessing}>
            {siebe.length >= MIN_SIEBE
              ? `${siebe.length} Siebe kontrollieren`
              : `Weitere Siebe hinzufügen (${siebe.length}/${MIN_SIEBE})`}
          </Button>
        </Card>
      </div>
    </div>
  );
}
