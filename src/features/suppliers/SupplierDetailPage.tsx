import { TopBar } from '@/components/layout/TopBar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth/AuthContext';
import { dataProvider } from '@/services';
import type { LoanCase, Physician, Supplier, Tray } from '@/types/database';
import {
  BadgeCheck,
  Calendar,
  ClipboardList,
  Mail,
  MapPin,
  Pencil,
  Phone,
  PlusCircle,
  Power,
  Stethoscope,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

export function SupplierDetailPage() {
  const { supplierId } = useParams<{ supplierId: string }>();
  const navigate = useNavigate();
  const { performedBy } = useAuth();
  const [supplier, setSupplier] = useState<Supplier | null | undefined>(undefined);
  const [trays, setTrays] = useState<Tray[]>([]);
  const [cases, setCases] = useState<LoanCase[]>([]);
  const [physicians, setPhysicians] = useState<Physician[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supplierId) return;
    const [s, allTrays, supplierCases, allPhysicians] = await Promise.all([
      dataProvider.getSupplier(supplierId),
      dataProvider.getTrays(),
      dataProvider.getCasesBySupplier(supplierId),
      dataProvider.getPhysicians(),
    ]);
    setSupplier(s);
    setTrays(allTrays.filter((t) => t.supplierId === supplierId));
    setCases(supplierCases);
    setPhysicians(allPhysicians);
  }, [supplierId]);

  useEffect(() => {
    load();
  }, [load]);

  if (supplier === undefined) {
    return (
      <div>
        <TopBar title="Lieferant" showBack />
        <p className="px-4 py-10 text-center text-sm text-ink-400">Wird geladen …</p>
      </div>
    );
  }

  if (supplier === null || !supplierId) {
    return (
      <div>
        <TopBar title="Lieferant" showBack />
        <p className="px-4 py-10 text-center text-sm text-ink-400">Lieferant nicht gefunden.</p>
      </div>
    );
  }

  const toggleActive = async () => {
    await dataProvider.setSupplierActive(supplierId, !supplier.active);
    await dataProvider.appendAuditEntry({
      id: crypto.randomUUID(),
      entityType: 'supplier',
      entityId: supplierId,
      action: supplier.active ? 'supplier_deactivated' : 'supplier_activated',
      performedBy,
      details: { name: supplier.name },
      createdAt: new Date().toISOString(),
    });
    load();
  };

  const handleDelete = async () => {
    if (!window.confirm(`„${supplier.name}" wirklich löschen?`)) return;
    setError(null);
    try {
      await dataProvider.deleteSupplier(supplierId);
      await dataProvider.appendAuditEntry({
        id: crypto.randomUUID(),
        entityType: 'supplier',
        entityId: supplierId,
        action: 'supplier_deleted',
        performedBy,
        details: { name: supplier.name },
        createdAt: new Date().toISOString(),
      });
      navigate('/lieferanten', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
    }
  };

  return (
    <div>
      <TopBar title={supplier.name} subtitle={supplier.location ?? undefined} showBack />

      <div className="px-4 py-4">
        <Card className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {supplier.loanServiceConfirmed && (
                <Badge tone="success">
                  <BadgeCheck size={12} />
                  Leihservice
                </Badge>
              )}
              <Badge tone={supplier.active ? 'brand' : 'neutral'}>{supplier.active ? 'Aktiv' : 'Inaktiv'}</Badge>
            </div>
          </div>

          {supplier.loanServiceNote && <p className="mt-2 text-sm text-ink-600">{supplier.loanServiceNote}</p>}

          {supplier.specialties.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {supplier.specialties.map((s) => (
                <span key={s} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                  {s}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 space-y-1 border-t border-ink-100 pt-2.5 text-xs text-ink-600">
            {supplier.location && (
              <p className="flex items-center gap-1.5">
                <MapPin size={12} className="shrink-0 text-ink-400" />
                {supplier.location}
              </p>
            )}
            {supplier.contactPhone && (
              <a href={`tel:${supplier.contactPhone.replace(/\s+/g, '')}`} className="flex items-center gap-1.5">
                <Phone size={12} className="shrink-0 text-ink-400" />
                {supplier.contactPhone}
              </a>
            )}
            {supplier.contactEmail && (
              <a href={`mailto:${supplier.contactEmail}`} className="flex items-center gap-1.5">
                <Mail size={12} className="shrink-0 text-ink-400" />
                {supplier.contactEmail}
              </a>
            )}
            {supplier.contactNote && <p className="text-ink-500">{supplier.contactNote}</p>}
          </div>
        </Card>

        {error && <p className="mt-3 rounded-xl bg-danger-50 p-3 text-sm text-danger-600">{error}</p>}

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button variant="secondary" size="md" icon={<Pencil size={14} />} onClick={() => navigate(`/lieferanten/${supplierId}/bearbeiten`)}>
            Bearbeiten
          </Button>
          <Button variant="secondary" size="md" icon={<Power size={14} />} onClick={toggleActive}>
            {supplier.active ? 'Deaktivieren' : 'Aktivieren'}
          </Button>
          <Button variant="danger" size="md" icon={<Trash2 size={14} />} onClick={handleDelete}>
            Löschen
          </Button>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Sieb-Referenzen ({trays.length})</p>
          <Link to={`/sieb/neu?supplierId=${supplierId}`} className="flex items-center gap-1 text-xs font-medium text-brand-600">
            <PlusCircle size={14} />
            Neues Sieb erfassen
          </Link>
        </div>
        <div className="mt-2 space-y-2">
          {trays.map((tray) => (
            <Link key={tray.id} to={`/sieb/${tray.id}/bearbeiten`} className="block">
              <Card className="flex items-center justify-between p-3 active:bg-ink-50">
                <div>
                  <p className="font-mono text-xs font-medium text-brand-600">{tray.code}</p>
                  <p className="text-sm font-semibold text-ink-900">{tray.name}</p>
                </div>
                <Badge tone={tray.active ? 'brand' : 'neutral'}>{tray.active ? 'Aktiv' : 'Inaktiv'}</Badge>
              </Card>
            </Link>
          ))}
          {trays.length === 0 && <p className="text-sm text-ink-400">Noch keine Siebe erfasst.</p>}
        </div>

        <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-ink-500">
          Sieb-Historie ({cases.length})
        </p>
        <div className="space-y-2">
          {cases.map((c) => {
            const tray = trays.find((t) => t.id === c.trayId);
            const operateur = physicians.find((p) => p.id === c.operateurId);
            return (
              <Link key={c.id} to={`/faelle/${c.id}`} className="block">
                <Card className="p-3 active:bg-ink-50">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-xs font-medium text-brand-600">{tray?.code ?? '–'}</p>
                    <Badge tone={c.status === 'compared' ? (c.comparison?.hasDeviations ? 'warning' : 'success') : 'neutral'}>
                      {c.status === 'compared' ? (c.comparison?.hasDeviations ? 'Abweichung' : 'Vollständig') : 'Offen'}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {formatDate(c.createdAt)}
                    {c.operationNote && ` · ${c.operationNote}`}
                  </p>
                  {(c.operationDate || operateur) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                      {c.operationDate && (
                        <span className="flex items-center gap-1">
                          <Calendar size={12} className="shrink-0 text-ink-400" />
                          {c.operationDate}
                        </span>
                      )}
                      {operateur && (
                        <span className="flex items-center gap-1">
                          <Stethoscope size={12} className="shrink-0 text-ink-400" />
                          {operateur.name}
                        </span>
                      )}
                    </div>
                  )}
                </Card>
              </Link>
            );
          })}
          {cases.length === 0 && (
            <p className="flex items-center gap-1.5 text-sm text-ink-400">
              <ClipboardList size={14} />
              Noch keine Sieb-Fälle für diesen Lieferanten.
            </p>
          )}
        </div>
      </div>
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
