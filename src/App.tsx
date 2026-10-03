import { AppShell } from '@/components/layout/AppShell';
import { AuditLogPage } from '@/features/audit/AuditLogPage';
import { CaseDetailPage } from '@/features/cases/CaseDetailPage';
import { CaseOuttakeRoute } from '@/features/cases/CaseOuttakeRoute';
import { CasesPage } from '@/features/cases/CasesPage';
import { HygienePassPage } from '@/features/cases/HygienePassPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { ScanDetailPage } from '@/features/history/ScanDetailPage';
import { HistoryPage } from '@/features/history/HistoryPage';
import { CreatePhysicianPage } from '@/features/physicians/CreatePhysicianPage';
import { PhysiciansPage } from '@/features/physicians/PhysiciansPage';
import { PricingPage } from '@/features/pricing/PricingPage';
import { CreateSupplierPage } from '@/features/suppliers/CreateSupplierPage';
import { EditSupplierPage } from '@/features/suppliers/EditSupplierPage';
import { SupplierDetailPage } from '@/features/suppliers/SupplierDetailPage';
import { SuppliersPage } from '@/features/suppliers/SuppliersPage';
import { CreateTrayPage } from '@/features/trays/CreateTrayPage';
import { EditTrayPage } from '@/features/trays/EditTrayPage';
import { RepairDetailPage } from '@/features/repair/RepairDetailPage';
import { ReportRepairFlow } from '@/features/repair/ReportRepairFlow';
import { RepairsPage } from '@/features/repair/RepairsPage';
import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

// Barcode/QR + OCR libraries are only needed on this screen, so it is split
// into its own chunk instead of bloating the initial dashboard bundle.
const ScannerFlow = lazy(() =>
  import('@/features/scanner/ScannerFlow').then((m) => ({ default: m.ScannerFlow })),
);

const SetScannerFlow = lazy(() =>
  import('@/features/scanner/SetScannerFlow').then((m) => ({ default: m.SetScannerFlow })),
);

// Pulls in exceljs + jszip (large) for the monthly archive export - split
// into its own chunk since most sessions never visit this admin/OP-Leitung
// screen.
const ArchivPage = lazy(() => import('@/features/archive/ArchivPage').then((m) => ({ default: m.ArchivPage })));

// Analytics + Benutzerverwaltung are admin/op_leitung-only (see each page's
// own role gate) - most signed-in sessions (mitarbeiter/lieferant) never
// load this code at all, so it is split out of the eagerly-loaded bundle
// every session pays for on first paint.
const AnalyticsPage = lazy(() =>
  import('@/features/analytics/pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })),
);
const InstrumentAnalyticsPage = lazy(() =>
  import('@/features/analytics/pages/InstrumentAnalyticsPage').then((m) => ({ default: m.InstrumentAnalyticsPage })),
);
const UserManagementPage = lazy(() =>
  import('@/features/users/UserManagementPage').then((m) => ({ default: m.UserManagementPage })),
);

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route
          path="/scanner"
          element={
            <Suspense fallback={<PageLoadingFallback />}>
              <ScannerFlow />
            </Suspense>
          }
        />
        <Route
          path="/scanner/set"
          element={
            <Suspense fallback={<PageLoadingFallback />}>
              <SetScannerFlow />
            </Suspense>
          }
        />
        <Route path="/historie" element={<HistoryPage />} />
        <Route path="/historie/:scanId" element={<ScanDetailPage />} />
        <Route path="/audit" element={<AuditLogPage />} />
        <Route path="/lieferanten" element={<SuppliersPage />} />
        <Route path="/lieferanten/neu" element={<CreateSupplierPage />} />
        <Route path="/lieferanten/:supplierId" element={<SupplierDetailPage />} />
        <Route path="/lieferanten/:supplierId/bearbeiten" element={<EditSupplierPage />} />
        <Route path="/sieb/neu" element={<CreateTrayPage />} />
        <Route path="/sieb/:trayId/bearbeiten" element={<EditTrayPage />} />
        <Route path="/aerzte" element={<PhysiciansPage />} />
        <Route path="/aerzte/neu" element={<CreatePhysicianPage />} />
        <Route path="/faelle" element={<CasesPage />} />
        <Route
          path="/faelle/eingang"
          element={
            <Suspense fallback={<PageLoadingFallback />}>
              <ScannerFlow mode={{ kind: 'case-intake' }} />
            </Suspense>
          }
        />
        <Route path="/faelle/:caseId" element={<CaseDetailPage />} />
        <Route path="/faelle/:caseId/ausgang" element={<CaseOuttakeRoute />} />
        <Route path="/faelle/:caseId/hygiene-pass" element={<HygienePassPage />} />
        <Route path="/reparaturen" element={<RepairsPage />} />
        <Route path="/reparaturen/melden" element={<ReportRepairFlow />} />
        <Route path="/reparaturen/:repairId" element={<RepairDetailPage />} />
        <Route
          path="/analytics"
          element={
            <Suspense fallback={<PageLoadingFallback />}>
              <AnalyticsPage />
            </Suspense>
          }
        />
        <Route
          path="/analytics/instrumente"
          element={
            <Suspense fallback={<PageLoadingFallback />}>
              <InstrumentAnalyticsPage />
            </Suspense>
          }
        />
        <Route path="/tarife" element={<PricingPage />} />
        <Route
          path="/benutzer"
          element={
            <Suspense fallback={<PageLoadingFallback />}>
              <UserManagementPage />
            </Suspense>
          }
        />
        <Route
          path="/archiv"
          element={
            <Suspense fallback={<PageLoadingFallback />}>
              <ArchivPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function PageLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-200 border-t-brand-600" />
    </div>
  );
}

export default App;
