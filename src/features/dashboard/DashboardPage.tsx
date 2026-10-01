import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth/AuthContext';
import { dataProvider } from '@/services';
import {
  BarChart3,
  CircleAlert,
  ClipboardList,
  GitCompareArrows,
  Layers,
  PackageOpen,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Truck,
  Wrench,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const modules = [
  {
    to: '/historie',
    icon: ClipboardList,
    title: 'Sieb-Historie',
    description: 'Alle durchgeführten Leih-Sieb-Kontrollen',
  },
  {
    to: '/audit',
    icon: ShieldCheck,
    title: 'Audit-Log',
    description: 'Lückenlose Nachverfolgung aller Aktionen',
  },
  {
    to: '/lieferanten',
    icon: Truck,
    title: 'Lieferantenverwaltung',
    description: 'Anbieter verwalten, Siebe zuordnen',
  },
  {
    to: '/faelle',
    icon: GitCompareArrows,
    title: 'Vorher/Nachher-Vergleich',
    description: 'Eingang, Ausgang & Abweichungen',
  },
  {
    to: '/aerzte',
    icon: Stethoscope,
    title: 'Ärzteliste',
    description: 'Belegärzte/Operateure nach Fachbereich',
  },
  {
    to: '/reparaturen',
    icon: Wrench,
    title: 'Reparaturen',
    description: 'Defekte Instrumente melden und nachverfolgen',
  },
];

interface Stats {
  openCases: number;
  activeSuppliers: number;
  comparedCases: number;
  casesWithDeviations: number;
  openRepairs: number;
}

export function DashboardPage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const analyticsAllowed = !profile || profile.role === 'admin' || profile.role === 'op_leitung';
  const visibleModules = analyticsAllowed
    ? [
        ...modules,
        {
          to: '/analytics',
          icon: BarChart3,
          title: 'Analytics',
          description: 'KPIs, Trends und Lieferanten-Auswertungen',
        },
      ]
    : modules;

  useEffect(() => {
    Promise.all([dataProvider.getCases(), dataProvider.getSuppliers(), dataProvider.getRepairCases()]).then(
      ([cases, suppliers, repairs]) => {
        setStats({
          openCases: cases.filter((c) => c.status === 'outtake_pending').length,
          activeSuppliers: suppliers.filter((s) => s.active).length,
          comparedCases: cases.filter((c) => c.status === 'compared').length,
          casesWithDeviations: cases.filter((c) => c.comparison?.hasDeviations).length,
          openRepairs: repairs.filter((r) => r.status === 'open').length,
        });
      },
    );
  }, []);

  return (
    <div className="px-4 pt-6">
      <div className="mb-6">
        <p className="text-sm font-medium text-brand-600">AEMP · Instrumentenmanagement</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">IDM Mobile</h1>
      </div>

      <Link to="/scanner" className="block">
        <Card className="relative overflow-hidden border-brand-600 bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white active:opacity-95">
          <div className="flex items-start justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
              <ScanLine size={24} />
            </div>
            <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white">
              Modul 1
            </span>
          </div>
          <h2 className="mt-4 text-lg font-semibold">LEIH-SIEB SCANNER</h2>
          <p className="mt-1 text-sm text-brand-100">
            Leihsieb fotografieren, Barcode/QR &amp; Text erkennen, Instrumente kontrollieren.
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-white">
            Kontrolle starten →
          </span>
        </Card>
      </Link>

      <Link to="/scanner/set" className="mt-3 block">
        <Card className="flex items-center gap-3 p-3.5 active:bg-ink-50">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Layers size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">Sieb-SET erfassen</p>
            <p className="text-xs text-ink-500">Lieferung mit mehreren Leihsieben - 2 bis 10 Siebe, je 1-3 Fotos</p>
          </div>
        </Card>
      </Link>

      <div className="mt-6 flex items-center gap-1.5 text-xs text-ink-500">
        <Sparkles size={14} className="text-brand-500" />
        <span>KI-gestützte Erkennung – Ergebnisse müssen manuell bestätigt werden.</span>
      </div>

      <h3 className="mb-3 mt-7 text-sm font-semibold uppercase tracking-wide text-ink-500">Überblick</h3>
      <div className="grid grid-cols-2 gap-3">
        <Link to="/faelle">
          <StatCard icon={PackageOpen} label="Offene Leihsiebe" value={stats?.openCases} tone="brand" />
        </Link>
        <Link to="/lieferanten">
          <StatCard icon={Truck} label="Aktive Lieferanten" value={stats?.activeSuppliers} tone="neutral" />
        </Link>
        <Link to="/faelle">
          <StatCard icon={GitCompareArrows} label="Vergleiche abgeschlossen" value={stats?.comparedCases} tone="neutral" />
        </Link>
        <Link to="/faelle">
          <StatCard
            icon={CircleAlert}
            label="Fälle mit Abweichung"
            value={stats?.casesWithDeviations}
            tone={stats && stats.casesWithDeviations > 0 ? 'warning' : 'neutral'}
          />
        </Link>
        <Link to="/reparaturen">
          <StatCard
            icon={Wrench}
            label="Offene Reparaturen"
            value={stats?.openRepairs}
            tone={stats && stats.openRepairs > 0 ? 'warning' : 'neutral'}
          />
        </Link>
      </div>

      <h3 className="mb-3 mt-7 text-sm font-semibold uppercase tracking-wide text-ink-500">
        Weitere Module
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {visibleModules.map((mod) => {
          const Icon = mod.icon;
          return (
            <Link key={mod.to} to={mod.to}>
              <Card className="flex h-full flex-col gap-2.5 p-4 active:bg-ink-50">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink-900">{mod.title}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{mod.description}</p>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <Link to="/tarife" className="mt-6 mb-2 block text-center text-xs text-ink-400 underline-offset-2 active:underline">
        Tarife & Preise
      </Link>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof PackageOpen;
  label: string;
  value: number | undefined;
  tone: 'brand' | 'warning' | 'neutral';
}) {
  const toneClass =
    tone === 'brand' ? 'bg-brand-50 text-brand-600' : tone === 'warning' ? 'bg-warning-50 text-warning-600' : 'bg-ink-100 text-ink-500';
  return (
    <Card className="p-4 active:bg-ink-50">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneClass}`}>
        <Icon size={16} />
      </div>
      <p className="mt-2 text-xl font-bold text-ink-900">{value ?? '–'}</p>
      <p className="text-xs text-ink-500">{label}</p>
    </Card>
  );
}
