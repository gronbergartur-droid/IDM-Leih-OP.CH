import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { Physician } from '@/types/database';
import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';

interface CaseIntakeDetailsStepProps {
  operationNote: string;
  onOperationNoteChange: (value: string) => void;
  operationDate: string;
  onOperationDateChange: (value: string) => void;
  physicians: Physician[];
  operateurId: string | null;
  onOperateurIdChange: (value: string | null) => void;
  onContinue: () => void;
}

export function CaseIntakeDetailsStep({
  operationNote,
  onOperationNoteChange,
  operationDate,
  onOperationDateChange,
  physicians,
  operateurId,
  onOperateurIdChange,
  onContinue,
}: CaseIntakeDetailsStepProps) {
  const physiciansByDepartment = useMemo(() => {
    const groups = new Map<string, Physician[]>();
    for (const p of physicians) {
      const list = groups.get(p.department) ?? [];
      list.push(p);
      groups.set(p.department, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [physicians]);

  return (
    <div className="px-4 py-4">
      <p className="mb-4 text-sm text-ink-600">
        Operateur und OP-Datum zum Fall erfassen, bevor das Leihsieb gescannt wird.
      </p>

      <Card className="space-y-4 p-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">Operateur</span>
          <select
            value={operateurId ?? ''}
            onChange={(e) => onOperateurIdChange(e.target.value || null)}
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
            onChange={(e) => onOperationDateChange(e.target.value)}
            className="w-full rounded-xl border border-ink-200 px-3.5 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-500">
            Operation (Referenz)
          </span>
          <input
            value={operationNote}
            onChange={(e) => onOperationNoteChange(e.target.value)}
            placeholder="z. B. Saal 3, Pat.-Nr. …"
            className="w-full rounded-xl border border-ink-200 px-3.5 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </Card>

      <Button size="lg" fullWidth icon={<ArrowRight size={18} />} className="mt-4" onClick={onContinue}>
        Weiter zum Eingangs-Scan
      </Button>
    </div>
  );
}
