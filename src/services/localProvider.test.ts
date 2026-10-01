import { compareCaseScans } from '@/features/cases/comparison';
import type { ExtraInstrumentEntry, InstrumentCheckEntry, ScanRecord, SupplierInput } from '@/types/database';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalDataProvider } from './localProvider';

const blankSupplierInput = (name: string, shortCode: string): SupplierInput => ({
  name,
  shortCode,
  location: null,
  specialties: [],
  loanServiceConfirmed: true,
  loanServiceNote: null,
  contactPhone: null,
  contactEmail: null,
  contactNote: null,
  source: null,
  logoUrl: null,
});

describe('LocalDataProvider - Eingang/Ausgang/Fälle/Audit regression', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('opens a case at intake, completes outtake with a deviation, and records the audit trail', async () => {
    const provider = new LocalDataProvider();

    const supplier = await provider.createSupplier(blankSupplierInput('Test Lieferant', 'TST'));
    const tray = await provider.createTray({
      code: 'TST-LEIH-01-01',
      aliases: ['LEIH 01'],
      name: 'Test-Sieb',
      supplierId: supplier.id,
      referencePhotoUrl: null,
      instruments: [{ name: 'Schere', quantity: 1, critical: true }],
    });
    const [instrument] = await provider.getTrayInstruments(tray.id);

    const intakeChecks: InstrumentCheckEntry[] = [
      {
        instrumentId: instrument.id,
        name: instrument.name,
        quantityExpected: 1,
        quantityConfirmed: 1,
        critical: true,
        userConfirmed: true,
      },
    ];

    const intakeScan: ScanRecord = {
      id: crypto.randomUUID(),
      trayId: tray.id,
      supplierId: supplier.id,
      caseId: null,
      capturedImageDataUrl: null,
      additionalImageDataUrls: [],
      recognition: null,
      matchedIdentifier: tray.code,
      status: 'confirmed',
      expectedCount: 1,
      detectedCount: 1,
      instrumentChecks: intakeChecks,
      extraInstruments: [],
      missingInstrumentIds: [],
      notes: null,
      operationDate: null,
      operateurId: null,
      performedBy: 'Tester',
      createdAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
    };
    await provider.saveScan(intakeScan);

    const loanCase = await provider.createCase({
      trayId: tray.id,
      supplierId: supplier.id,
      intakeScanId: intakeScan.id,
      operationNote: null,
      operationDate: null,
      operateurId: null,
      performedBy: 'Tester',
    });
    await provider.saveScan({ ...intakeScan, caseId: loanCase.id });
    await provider.appendAuditEntry({
      id: crypto.randomUUID(),
      entityType: 'case',
      entityId: loanCase.id,
      action: 'case_intake',
      performedBy: 'Tester',
      details: {},
      createdAt: new Date().toISOString(),
    });

    expect(loanCase.status).toBe('outtake_pending');
    expect((await provider.getCase(loanCase.id))?.id).toBe(loanCase.id);
    expect(await provider.getCasesBySupplier(supplier.id)).toHaveLength(1);

    // Ausgang: the instrument comes back missing - the comparison engine must catch this.
    const outtakeChecks: InstrumentCheckEntry[] = [{ ...intakeChecks[0], quantityConfirmed: 0 }];
    const extras: ExtraInstrumentEntry[] = [];
    const comparison = compareCaseScans(
      { instrumentChecks: intakeChecks, extraInstruments: [] },
      { instrumentChecks: outtakeChecks, extraInstruments: extras },
      'Tester',
    );
    expect(comparison.hasDeviations).toBe(true);
    expect(comparison.instrumentDeltas).toEqual([expect.objectContaining({ delta: -1 })]);

    const outtakeScan: ScanRecord = {
      ...intakeScan,
      id: crypto.randomUUID(),
      caseId: loanCase.id,
      instrumentChecks: outtakeChecks,
      missingInstrumentIds: [instrument.id],
      detectedCount: 0,
    };
    await provider.saveScan(outtakeScan);

    const completed = await provider.completeOuttake(loanCase.id, outtakeScan.id, comparison);
    expect(completed.status).toBe('compared');
    expect(completed.comparison?.hasDeviations).toBe(true);

    await provider.appendAuditEntry({
      id: crypto.randomUUID(),
      entityType: 'case',
      entityId: loanCase.id,
      action: 'case_compared',
      performedBy: 'Tester',
      details: { hasDeviations: true },
      createdAt: new Date().toISOString(),
    });

    const auditLog = await provider.getAuditLog();
    expect(auditLog.filter((e) => e.entityId === loanCase.id)).toHaveLength(2);
    expect(auditLog.map((e) => e.action)).toEqual(expect.arrayContaining(['case_intake', 'case_compared']));

    expect(await provider.getScanHistory()).toHaveLength(2);
  });

  it('blocks deleting a supplier that still has trays, but allows deactivating it', async () => {
    const provider = new LocalDataProvider();
    const supplier = await provider.createSupplier(blankSupplierInput('Mit Sieb', 'MIT'));
    await provider.createTray({
      code: 'MIT-LEIH-01-01',
      aliases: [],
      name: 'Sieb',
      supplierId: supplier.id,
      referencePhotoUrl: null,
      instruments: [],
    });

    await expect(provider.deleteSupplier(supplier.id)).rejects.toThrow();

    const deactivated = await provider.setSupplierActive(supplier.id, false);
    expect(deactivated.active).toBe(false);
  });

  it('resolves a tray by its short alias as well as its full code, case-insensitively', async () => {
    const provider = new LocalDataProvider();
    const supplier = await provider.createSupplier(blankSupplierInput('Alias Lieferant', 'ALI'));
    const tray = await provider.createTray({
      code: 'ALI-LEIH-09-01',
      aliases: ['LEIH 09'],
      name: 'Alias-Sieb',
      supplierId: supplier.id,
      referencePhotoUrl: null,
      instruments: [],
    });

    expect((await provider.findTrayByIdentifier('ali-leih-09-01'))?.id).toBe(tray.id);
    expect((await provider.findTrayByIdentifier('leih 09'))?.id).toBe(tray.id);
    expect(await provider.findTrayByIdentifier('LEIH 99')).toBeNull();
  });
});

describe('LocalDataProvider - Reparatur (v2.2 Phase 2) regression', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('reports a repair case open, tied to a tray, and can close it', async () => {
    const provider = new LocalDataProvider();
    const supplier = await provider.createSupplier(blankSupplierInput('Reparatur Lieferant', 'REP'));
    const tray = await provider.createTray({
      code: 'REP-LEIH-01-01',
      aliases: [],
      name: 'Reparatur-Sieb',
      supplierId: supplier.id,
      referencePhotoUrl: null,
      instruments: [],
    });

    const repairCase = await provider.createRepairCase({
      trayId: tray.id,
      supplierId: supplier.id,
      instrumentName: 'Chirurgische Schere',
      overviewPhotoUrl: 'data:image/jpeg;base64,overview',
      defectPhotoUrl: null,
      refPhotoUrl: null,
      defectNote: 'Spitze verbogen',
      performedBy: 'Tester',
    });

    expect(repairCase.status).toBe('open');
    expect((await provider.getRepairCase(repairCase.id))?.id).toBe(repairCase.id);
    expect(await provider.getRepairCases()).toHaveLength(1);

    const closed = await provider.closeRepairCase(repairCase.id, 'Tester2');
    expect(closed.status).toBe('closed');
    expect(closed.closedBy).toBe('Tester2');
    expect(closed.closedAt).not.toBeNull();
  });

  it('allows reporting a repair with no tray assigned yet', async () => {
    const provider = new LocalDataProvider();
    const repairCase = await provider.createRepairCase({
      trayId: null,
      supplierId: null,
      instrumentName: 'Loses Instrument',
      overviewPhotoUrl: 'data:image/jpeg;base64,overview',
      defectPhotoUrl: null,
      refPhotoUrl: null,
      defectNote: 'Unbekannte Herkunft, Griff gebrochen',
      performedBy: 'Tester',
    });
    expect(repairCase.trayId).toBeNull();
    expect(repairCase.status).toBe('open');
  });

  it('rejects closing a repair case that does not exist', async () => {
    const provider = new LocalDataProvider();
    await expect(provider.closeRepairCase('does-not-exist', 'Tester')).rejects.toThrow();
  });
});
