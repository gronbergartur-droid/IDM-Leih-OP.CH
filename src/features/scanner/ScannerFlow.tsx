import { TopBar } from '@/components/layout/TopBar';
import { CaseIntakeDetailsStep } from '@/features/cases/CaseIntakeDetailsStep';
import { compareCaseScans } from '@/features/cases/comparison';
import { CaseIntakeSummaryStep } from '@/features/cases/CaseIntakeSummaryStep';
import { CaseOuttakeSummaryStep } from '@/features/cases/CaseOuttakeSummaryStep';
import { useAuth } from '@/lib/auth/AuthContext';
import { dataProvider } from '@/services';
import type {
  AuditLogEntry,
  ExtraInstrumentEntry,
  InstrumentCheckEntry,
  Physician,
  ScanRecord,
  Supplier,
  Tray,
} from '@/types/database';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CameraCapture } from './CameraCapture';
import { StepProgress } from './components/StepProgress';
import type { RecognitionStage } from './recognition/runRecognition';
import { runRecognition } from './recognition/runRecognition';
import type { ScannerMode } from './scannerTypes';
import { createInitialScannerState, normalizeTrayIdentifier, STEP_LABELS } from './scannerTypes';
import { DoneStep } from './steps/DoneStep';
import { IdentifyStep } from './steps/IdentifyStep';
import { InstrumentCheckStep } from './steps/InstrumentCheckStep';
import { RecognizingStep } from './steps/RecognizingStep';
import { SummaryStep } from './steps/SummaryStep';
import { TrayMatchedStep } from './steps/TrayMatchedStep';
import { UnmatchedStep } from './steps/UnmatchedStep';

const MODE_SUBTITLE: Record<ScannerMode['kind'], string> = {
  standalone: 'LEIH-SIEB SCANNER',
  'case-intake': 'Eingang erfassen',
  'case-outtake': 'Ausgang erfassen',
};

interface ScannerFlowProps {
  mode?: ScannerMode;
  /**
   * Skips the capture step and feeds these photos (1-3 of the same Sieb:
   * overview plus optional detail/barcode close-ups) straight into
   * recognition - used by SetScannerFlow, which already collected 2-10
   * Siebe upfront (each with its own 1-3 photos) and runs this component
   * once per Sieb.
   */
  initialImageDataUrls?: string[];
  /** Set by SetScannerFlow so the "done" screen shows "Sieb 2/5" progress instead of the normal single-scan message. */
  setProgress?: { index: number; total: number };
  /** Called instead of resetting when the SET's current item is confirmed - SetScannerFlow advances to the next Sieb (or its own summary) by remounting this component with a new key. */
  onSetItemDone?: () => void;
  /** Operateur/OP-Datum already collected for the whole SET (standalone mode only) - carried onto each Sieb's saved scan. */
  presetOperateurId?: string | null;
  presetOperationDate?: string | null;
}

export function ScannerFlow({
  mode = { kind: 'standalone' },
  initialImageDataUrls,
  setProgress,
  onSetItemDone,
  presetOperateurId,
  presetOperationDate,
}: ScannerFlowProps) {
  const navigate = useNavigate();
  const { performedBy } = useAuth();
  const [state, setState] = useState(createInitialScannerState);
  const [recognitionStage, setRecognitionStage] = useState<RecognitionStage>('barcode');
  const [allTrays, setAllTrays] = useState<Tray[]>([]);
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);
  const [saving, setSaving] = useState(false);
  const [mismatchWarning, setMismatchWarning] = useState<string | null>(null);
  const [operationNote, setOperationNote] = useState('');
  const [operationDate, setOperationDate] = useState(presetOperationDate ?? '');
  const [operateurId, setOperateurId] = useState<string | null>(presetOperateurId ?? null);
  const [physicians, setPhysicians] = useState<Physician[]>([]);
  const [openedCaseId, setOpenedCaseId] = useState<string | null>(null);
  // Suppresses the capture-step UI only for the auto-fed photo(s) from
  // SetScannerFlow's initialImageDataUrls. If the user then retakes (via
  // IdentifyStep/UnmatchedStep "onRetake" -> resetFlow), this flips to
  // false so the live camera actually shows instead of a blank screen -
  // there's no pre-supplied photo to fall back to.
  const [skipCaptureUi, setSkipCaptureUi] = useState(Boolean(initialImageDataUrls?.length));
  // Case-intake collects Operateur/OP-Datum as its own first screen, before
  // the camera even opens - every other mode skips straight to capture.
  const [caseDetailsConfirmed, setCaseDetailsConfirmed] = useState(mode.kind !== 'case-intake');

  const patch = useCallback((p: Partial<typeof state>) => setState((prev) => ({ ...prev, ...p })), []);

  const resetFlow = useCallback(() => {
    setState(createInitialScannerState());
    setRecognitionStage('barcode');
    setMismatchWarning(null);
    setSkipCaptureUi(false);
  }, []);

  const runIdentification = useCallback(
    async (imageDataUrls: string[]) => {
      patch({
        imageDataUrl: imageDataUrls[0] ?? null,
        additionalImageDataUrls: imageDataUrls.slice(1),
        step: 'recognizing',
      });
      try {
        const recognition = await runRecognition(imageDataUrls, setRecognitionStage);
        patch({
          recognition,
          selectedIdentifier: recognition.candidateIdentifiers[0]?.value ?? null,
          step: 'identify',
        });
      } catch (error) {
        console.error('Erkennung fehlgeschlagen', error);
        patch({
          recognition: {
            barcodeValues: [],
            qrValues: [],
            ocrText: '',
            candidateIdentifiers: [],
            ocrConfidence: null,
            processingTimeMs: 0,
            gs1: null,
          },
          step: 'identify',
        });
      }
    },
    [patch],
  );

  const handleCapture = useCallback((imageDataUrl: string) => runIdentification([imageDataUrl]), [runIdentification]);

  // SetScannerFlow already has the photo(s) (from its own capture/gallery
  // step) and remounts this component fresh per Sieb, so it's safe to fire
  // this exactly once on mount rather than re-running on every
  // runIdentification identity change.
  useEffect(() => {
    if (initialImageDataUrls?.length) {
      runIdentification(initialImageDataUrls);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only the case-intake summary offers an Operateur picker, so only that
  // mode needs the physicians list.
  useEffect(() => {
    if (mode.kind === 'case-intake') {
      dataProvider.getPhysicians().then(setPhysicians);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTrayIntoState = useCallback(
    async (tray: Tray) => {
      const [supplier, instruments] = await Promise.all([
        dataProvider.getSupplier(tray.supplierId),
        dataProvider.getTrayInstruments(tray.id),
      ]);
      const checks: InstrumentCheckEntry[] = instruments.map((instrument) => ({
        instrumentId: instrument.id,
        name: instrument.name,
        quantityExpected: instrument.quantity,
        quantityConfirmed: 0,
        critical: instrument.critical,
        userConfirmed: false,
      }));
      patch({
        tray,
        supplier,
        instruments,
        checks,
        step: 'matched',
      });

      await dataProvider.appendAuditEntry(
        buildAuditEntry(state.scanId, 'scan_matched', { trayCode: tray.code }, performedBy),
      );
    },
    [patch, state.scanId, performedBy],
  );

  const handleConfirmIdentifier = useCallback(
    async (identifier: string) => {
      patch({ selectedIdentifier: identifier, step: 'matching' });

      if (mode.kind === 'case-outtake') {
        const normalized = normalizeTrayIdentifier(identifier);
        const matchesExpected =
          normalizeTrayIdentifier(mode.tray.code) === normalized ||
          mode.tray.aliases.some((alias) => normalizeTrayIdentifier(alias) === normalized);
        setMismatchWarning(
          matchesExpected
            ? null
            : `Der erkannte Code „${identifier}" stimmt nicht mit dem erwarteten Sieb ${mode.tray.code} überein. Bitte prüfen, ob das richtige Sieb zurückgegeben wurde.`,
        );
        await loadTrayIntoState(mode.tray);
        return;
      }

      const tray = await dataProvider.findTrayByIdentifier(identifier);
      if (tray) {
        await loadTrayIntoState(tray);
      } else {
        const [trays, suppliersList] = await Promise.all([dataProvider.getTrays(), dataProvider.getSuppliers()]);
        setAllTrays(trays);
        setAllSuppliers(suppliersList);
        await dataProvider.appendAuditEntry(
          buildAuditEntry(state.scanId, 'scan_unmatched', { identifier }, performedBy),
        );
        patch({ step: 'unmatched' });
      }
    },
    [loadTrayIntoState, mode, patch, state.scanId, performedBy],
  );

  const handleUpdateCheck = useCallback(
    (instrumentId: string, checkPatch: Partial<InstrumentCheckEntry>) => {
      setState((prev) => ({
        ...prev,
        checks: prev.checks.map((c) => (c.instrumentId === instrumentId ? { ...c, ...checkPatch } : c)),
      }));
    },
    [],
  );

  const handleAddExtra = useCallback((entry: Omit<ExtraInstrumentEntry, 'id'>) => {
    setState((prev) => ({
      ...prev,
      extraInstruments: [...prev.extraInstruments, { ...entry, id: crypto.randomUUID() }],
    }));
  }, []);

  const handleRemoveExtra = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      extraInstruments: prev.extraInstruments.filter((e) => e.id !== id),
    }));
  }, []);

  const computeDetectedCount = (checks: InstrumentCheckEntry[], extras: ExtraInstrumentEntry[]) =>
    checks.reduce((sum, c) => sum + c.quantityConfirmed, 0) + extras.reduce((sum, e) => sum + e.quantity, 0);

  const computeMissingIds = (checks: InstrumentCheckEntry[]) =>
    checks.filter((c) => c.quantityConfirmed < c.quantityExpected).map((c) => c.instrumentId);

  const handleConfirmAndSave = useCallback(async () => {
    if (!state.tray) return;
    setSaving(true);
    try {
      const record: ScanRecord = {
        id: state.scanId,
        trayId: state.tray.id,
        supplierId: state.supplier?.id ?? null,
        caseId: null,
        capturedImageDataUrl: state.imageDataUrl,
        additionalImageDataUrls: state.additionalImageDataUrls,
        recognition: state.recognition,
        matchedIdentifier: state.selectedIdentifier,
        status: 'confirmed',
        expectedCount: state.tray.expectedInstrumentCount,
        detectedCount: computeDetectedCount(state.checks, state.extraInstruments),
        instrumentChecks: state.checks,
        extraInstruments: state.extraInstruments,
        missingInstrumentIds: computeMissingIds(state.checks),
        notes: state.notes || null,
        operationDate: operationDate || null,
        operateurId,
        performedBy,
        createdAt: new Date().toISOString(),
        confirmedAt: new Date().toISOString(),
      };

      await dataProvider.saveScan(record);
      await dataProvider.appendAuditEntry(
        buildAuditEntry(
          state.scanId,
          'scan_confirmed',
          {
            trayCode: state.tray.code,
            expectedCount: record.expectedCount,
            detectedCount: record.detectedCount,
            missing: record.missingInstrumentIds.length,
            extra: state.extraInstruments.length,
          },
          performedBy,
        ),
      );

      patch({ step: 'done' });
    } finally {
      setSaving(false);
    }
  }, [patch, state, performedBy, operationDate, operateurId]);

  const handleConfirmIntakeAndOpenCase = useCallback(async () => {
    if (!state.tray) return;
    setSaving(true);
    try {
      const record: ScanRecord = {
        id: state.scanId,
        trayId: state.tray.id,
        supplierId: state.supplier?.id ?? null,
        caseId: null,
        capturedImageDataUrl: state.imageDataUrl,
        additionalImageDataUrls: state.additionalImageDataUrls,
        recognition: state.recognition,
        matchedIdentifier: state.selectedIdentifier,
        status: 'confirmed',
        expectedCount: state.tray.expectedInstrumentCount,
        detectedCount: computeDetectedCount(state.checks, state.extraInstruments),
        instrumentChecks: state.checks,
        extraInstruments: state.extraInstruments,
        missingInstrumentIds: computeMissingIds(state.checks),
        notes: state.notes || null,
        operationDate: operationDate || null,
        operateurId,
        performedBy,
        createdAt: new Date().toISOString(),
        confirmedAt: new Date().toISOString(),
      };

      await dataProvider.saveScan(record);
      await dataProvider.appendAuditEntry(
        buildAuditEntry(
          state.scanId,
          'scan_confirmed',
          {
            trayCode: state.tray.code,
            expectedCount: record.expectedCount,
            detectedCount: record.detectedCount,
          },
          performedBy,
        ),
      );

      const loanCase = await dataProvider.createCase({
        trayId: state.tray.id,
        supplierId: state.tray.supplierId,
        intakeScanId: record.id,
        operationNote: operationNote.trim() || null,
        operationDate: operationDate || null,
        operateurId,
        performedBy,
      });

      await dataProvider.saveScan({ ...record, caseId: loanCase.id });
      await dataProvider.appendAuditEntry({
        id: crypto.randomUUID(),
        entityType: 'case',
        entityId: loanCase.id,
        action: 'case_intake',
        performedBy,
        details: { trayCode: state.tray.code },
        createdAt: new Date().toISOString(),
      });

      setOpenedCaseId(loanCase.id);
      patch({ step: 'done' });
    } finally {
      setSaving(false);
    }
  }, [operationDate, operationNote, operateurId, patch, state, performedBy]);

  const outtakeComparison = useMemo(() => {
    if (mode.kind !== 'case-outtake') return null;
    return compareCaseScans(
      { instrumentChecks: mode.intakeScan.instrumentChecks, extraInstruments: mode.intakeScan.extraInstruments },
      { instrumentChecks: state.checks, extraInstruments: state.extraInstruments },
      performedBy,
    );
  }, [mode, state.checks, state.extraInstruments, performedBy]);

  const handleConfirmOuttakeAndClose = useCallback(async () => {
    if (!state.tray || mode.kind !== 'case-outtake') return;
    setSaving(true);
    try {
      const finalComparison = compareCaseScans(
        { instrumentChecks: mode.intakeScan.instrumentChecks, extraInstruments: mode.intakeScan.extraInstruments },
        { instrumentChecks: state.checks, extraInstruments: state.extraInstruments },
        performedBy,
      );

      const record: ScanRecord = {
        id: state.scanId,
        trayId: state.tray.id,
        supplierId: state.supplier?.id ?? null,
        caseId: mode.caseId,
        capturedImageDataUrl: state.imageDataUrl,
        additionalImageDataUrls: state.additionalImageDataUrls,
        recognition: state.recognition,
        matchedIdentifier: state.selectedIdentifier,
        status: 'confirmed',
        expectedCount: state.tray.expectedInstrumentCount,
        detectedCount: computeDetectedCount(state.checks, state.extraInstruments),
        instrumentChecks: state.checks,
        extraInstruments: state.extraInstruments,
        missingInstrumentIds: computeMissingIds(state.checks),
        notes: state.notes || null,
        operationDate: operationDate || null,
        operateurId,
        performedBy,
        createdAt: new Date().toISOString(),
        confirmedAt: new Date().toISOString(),
      };

      await dataProvider.saveScan(record);
      await dataProvider.appendAuditEntry(
        buildAuditEntry(
          state.scanId,
          'scan_confirmed',
          {
            trayCode: state.tray.code,
            expectedCount: record.expectedCount,
            detectedCount: record.detectedCount,
          },
          performedBy,
        ),
      );

      await dataProvider.completeOuttake(mode.caseId, record.id, finalComparison);
      await dataProvider.appendAuditEntry({
        id: crypto.randomUUID(),
        entityType: 'case',
        entityId: mode.caseId,
        action: 'case_compared',
        performedBy,
        details: {
          hasDeviations: finalComparison.hasDeviations,
          missing: finalComparison.instrumentDeltas.filter((d) => d.delta < 0).length,
          extra: finalComparison.extraDeltas.filter((d) => d.outtakeQuantity > d.intakeQuantity).length,
        },
        createdAt: new Date().toISOString(),
      });

      patch({ step: 'done' });
    } finally {
      setSaving(false);
    }
  }, [mode, patch, state, performedBy, operationDate, operateurId]);

  if (mode.kind === 'case-intake' && !caseDetailsConfirmed) {
    return (
      <div>
        <TopBar title="Fall-Angaben" subtitle={MODE_SUBTITLE[mode.kind]} showBack onBack={() => navigate(-1)} />
        <CaseIntakeDetailsStep
          operationNote={operationNote}
          onOperationNoteChange={setOperationNote}
          operationDate={operationDate}
          onOperationDateChange={setOperationDate}
          physicians={physicians}
          operateurId={operateurId}
          onOperateurIdChange={setOperateurId}
          onContinue={() => setCaseDetailsConfirmed(true)}
        />
      </div>
    );
  }

  return (
    <div>
      <TopBar
        title={STEP_LABELS[state.step]}
        subtitle={MODE_SUBTITLE[mode.kind]}
        showBack={state.step !== 'capture' && state.step !== 'done'}
        onBack={() => {
          if (state.step === 'identify') {
            setSkipCaptureUi(false);
            patch({ step: 'capture' });
          } else if (state.step === 'unmatched') patch({ step: 'identify' });
          else if (state.step === 'matched') patch({ step: 'identify' });
          else if (state.step === 'instruments') patch({ step: 'matched' });
          else if (state.step === 'summary') patch({ step: 'instruments' });
          else navigate(-1);
        }}
      />
      <StepProgress step={state.step} />

      {state.step === 'capture' && !skipCaptureUi && (
        <div className="px-4 py-4">
          <CameraCapture onCapture={handleCapture} />
        </div>
      )}

      {state.step === 'recognizing' && (
        <RecognizingStep imageDataUrl={state.imageDataUrl} stage={recognitionStage} />
      )}

      {state.step === 'identify' && state.recognition && (
        <IdentifyStep
          imageDataUrl={state.imageDataUrl}
          additionalImageDataUrls={state.additionalImageDataUrls}
          recognition={state.recognition}
          onConfirm={handleConfirmIdentifier}
          onRetake={resetFlow}
        />
      )}

      {state.step === 'matching' && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-200 border-t-brand-600" />
        </div>
      )}

      {state.step === 'unmatched' && state.selectedIdentifier && (
        <UnmatchedStep
          identifier={state.selectedIdentifier}
          trays={allTrays}
          suppliers={allSuppliers}
          onSelectTray={loadTrayIntoState}
          onRetake={resetFlow}
        />
      )}

      {state.step === 'matched' && state.tray && (
        <TrayMatchedStep
          tray={state.tray}
          supplier={state.supplier}
          imageDataUrl={state.imageDataUrl}
          mismatchWarning={mismatchWarning ?? undefined}
          onContinue={() => patch({ step: 'instruments' })}
          onWrongMatch={() => patch({ step: 'identify' })}
        />
      )}

      {state.step === 'instruments' && state.tray && (
        <InstrumentCheckStep
          checks={state.checks}
          extras={state.extraInstruments}
          expectedCount={state.tray.expectedInstrumentCount}
          onUpdateCheck={handleUpdateCheck}
          onAddExtra={handleAddExtra}
          onRemoveExtra={handleRemoveExtra}
          onContinue={() => patch({ step: 'summary' })}
        />
      )}

      {state.step === 'summary' && state.tray && mode.kind === 'standalone' && (
        <SummaryStep
          tray={state.tray}
          supplier={state.supplier}
          checks={state.checks}
          extras={state.extraInstruments}
          notes={state.notes}
          onNotesChange={(notes) => patch({ notes })}
          onConfirmAndSave={handleConfirmAndSave}
          saving={saving}
        />
      )}

      {state.step === 'summary' && state.tray && mode.kind === 'case-intake' && (
        <CaseIntakeSummaryStep
          tray={state.tray}
          supplier={state.supplier}
          checks={state.checks}
          extras={state.extraInstruments}
          operationNote={operationNote}
          operationDate={operationDate}
          operateur={physicians.find((p) => p.id === operateurId) ?? null}
          onConfirmAndOpenCase={handleConfirmIntakeAndOpenCase}
          saving={saving}
        />
      )}

      {state.step === 'summary' && state.tray && mode.kind === 'case-outtake' && outtakeComparison && (
        <CaseOuttakeSummaryStep
          tray={state.tray}
          supplier={state.supplier}
          comparison={outtakeComparison}
          notes={state.notes}
          onNotesChange={(notes) => patch({ notes })}
          onConfirmAndClose={handleConfirmOuttakeAndClose}
          saving={saving}
        />
      )}

      {state.step === 'done' && mode.kind === 'standalone' && setProgress && onSetItemDone && (
        <DoneStep
          detailPath={`/historie/${state.scanId}`}
          message={`Sieb ${setProgress.index}/${setProgress.total} erfasst${state.tray ? `: ${state.tray.code}` : ''}.`}
          onStartNew={onSetItemDone}
          startNewLabel={
            setProgress.index < setProgress.total
              ? `Nächstes Sieb (${setProgress.index + 1}/${setProgress.total})`
              : 'SET abschliessen'
          }
        />
      )}

      {state.step === 'done' && mode.kind === 'standalone' && !setProgress && (
        <DoneStep detailPath={`/historie/${state.scanId}`} onStartNew={resetFlow} />
      )}

      {state.step === 'done' && mode.kind === 'case-intake' && openedCaseId && (
        <DoneStep
          detailPath={`/faelle/${openedCaseId}`}
          detailLabel="Fall anzeigen"
          message="Der Sieb-Fall wurde eröffnet und wartet auf den Ausgangs-Scan nach der Operation."
          onStartNew={() => navigate('/faelle')}
          startNewLabel="Zur Fälle-Übersicht"
        />
      )}

      {state.step === 'done' && mode.kind === 'case-outtake' && (
        <DoneStep
          detailPath={`/faelle/${mode.caseId}`}
          detailLabel="Vergleich anzeigen"
          message="Der Ausgangs-Scan wurde gespeichert und mit dem Eingang verglichen."
          onStartNew={() => navigate('/faelle')}
          startNewLabel="Zur Fälle-Übersicht"
        />
      )}
    </div>
  );
}

function buildAuditEntry(
  scanId: string,
  action: AuditLogEntry['action'],
  details: Record<string, unknown>,
  performedBy: string,
): AuditLogEntry {
  return {
    id: crypto.randomUUID(),
    entityType: 'scan',
    entityId: scanId,
    action,
    performedBy,
    details,
    createdAt: new Date().toISOString(),
  };
}
