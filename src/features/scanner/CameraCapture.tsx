import { Button } from '@/components/ui/Button';
import { AlertTriangle, Camera, ImageUp, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface CameraCaptureProps {
  onCapture: (imageDataUrl: string) => void;
}

/**
 * Live camera preview with a shutter button, backed by getUserMedia. Falls
 * back to a native file picker (camera capture attribute) when no camera
 * stream is available - e.g. desktop browsers without a webcam permission,
 * or embedded webviews that block getUserMedia.
 *
 * When more than one camera is available (e.g. a desktop with a built-in
 * webcam plus an external USB one), a picker lets the user choose which
 * one to use - getUserMedia alone just grabs browser's default, which
 * isn't necessarily the one they want.
 */
export function CameraCapture({ onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  // User's explicit choice from the picker below. Stays null until they
  // pick one - until then, startStream() below uses facingMode instead,
  // so this never fights with the initial auto-selected camera.
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  // Which camera the live stream is actually using, purely for showing
  // the right option as selected in the picker before the user has
  // chosen anything themselves.
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let localStream: MediaStream | null = null;

    async function startStream() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Kamerazugriff wird von diesem Browser nicht unterstützt.');
        return;
      }
      setReady(false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStream = stream;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
        setError(null);
        setActiveDeviceId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? null);

        // Device labels are only populated once permission has been
        // granted, so this only enumerates usefully after a successful
        // stream above - calling it earlier would just show blank labels.
        const mediaDevices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setDevices(mediaDevices.filter((d) => d.kind === 'videoinput'));
      } catch {
        if (!cancelled) setError('Kein Kamerazugriff möglich. Bitte Berechtigung erteilen oder Foto auswählen.');
      }
    }

    startStream();

    return () => {
      cancelled = true;
      localStream?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [selectedDeviceId]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !ready) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    onCapture(dataUrl);
  }, [onCapture, ready]);

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onCapture(reader.result);
        }
      };
      reader.readAsDataURL(file);
    },
    [onCapture],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-ink-900">
        {!error && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            muted
            playsInline
            autoPlay
          />
        )}
        {error && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-ink-200">
            <AlertTriangle size={32} className="text-warning-500" />
            <p className="text-sm">{error}</p>
          </div>
        )}
        {!error && ready && (
          <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-white/60" />
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {!error && devices.length > 1 && (
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-ink-700">Kamera</span>
          <select
            value={selectedDeviceId ?? activeDeviceId ?? ''}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          >
            {devices.map((device, i) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Kamera ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        // No "capture" attribute here on purpose: with it set, mobile
        // browsers skip the native chooser and jump straight back into the
        // camera, making the phone's photo library unreachable from this
        // button. Leaving it off lets the OS offer "Photo Library" /
        // "Camera" / "Browse" - see the live camera preview above for the
        // dedicated quick-capture path.
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />

      <div className="flex items-center justify-center gap-3">
        <Button
          variant="secondary"
          size="lg"
          icon={<ImageUp size={20} />}
          onClick={() => fileInputRef.current?.click()}
        >
          Aus Fotos wählen
        </Button>
        <Button
          variant="primary"
          size="lg"
          icon={<Camera size={20} />}
          onClick={capture}
          disabled={!ready}
        >
          Aufnehmen
        </Button>
      </div>

      {error && (
        <Button
          variant="ghost"
          size="md"
          icon={<RotateCcw size={16} />}
          onClick={() => window.location.reload()}
        >
          Kamera erneut versuchen
        </Button>
      )}
    </div>
  );
}
