import { Archive } from 'lucide-react';
import { Link } from 'react-router-dom';

/** Shared entry point to SterimaterialArchivPage from both the station and AEMP views. */
export function ArchivLink({ className = '' }: { className?: string }) {
  return (
    <Link
      to="/sterimaterial/archiv"
      className={`flex items-center justify-center gap-1.5 text-xs text-ink-500 underline-offset-2 active:underline ${className}`}
    >
      <Archive size={14} />
      Archiv (abgeschlossen, ab Mitternacht nach Ausgang)
    </Link>
  );
}
