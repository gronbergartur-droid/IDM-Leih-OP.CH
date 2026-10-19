import { X } from 'lucide-react';

export interface LightboxPhoto {
  url: string;
  label: string;
}

/** Small tappable image preview; opens the given photo in a PhotoLightbox instead of navigating. */
export function PhotoThumbnail({ url, label, onOpen }: { url: string; label: string; onOpen: (photo: LightboxPhoto) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpen({ url, label });
      }}
      className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-900"
      aria-label={label}
    >
      <img src={url} alt={label} className="h-full w-full object-cover" />
    </button>
  );
}

/** Full-screen overlay for a PhotoThumbnail tap; render once per page, controlled by the page's own state. */
export function PhotoLightbox({ photo, onClose }: { photo: LightboxPhoto | null; onClose: () => void }) {
  if (!photo) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4" onClick={onClose}>
      <div className="flex items-center justify-between text-sm text-white">
        <span>{photo.label}</span>
        <button type="button" aria-label="Schliessen" onClick={onClose} className="rounded-full p-1.5 active:bg-white/10">
          <X size={22} />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <img src={photo.url} alt={photo.label} className="max-h-full max-w-full object-contain" />
      </div>
    </div>
  );
}
