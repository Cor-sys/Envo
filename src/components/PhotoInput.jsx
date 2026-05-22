import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { compressPhoto, photoUrl } from '../lib/photos.js';

// Photo capture / preview / clear field for NewItem and EditItem.
//
// Behavior:
//   - Tap "Take photo" → opens phone camera (or file picker on desktop).
//   - Selected file is compressed client-side; the resulting Blob is held
//     in component state and surfaced to the parent via onChange(blob).
//   - If `initialPath` is provided (edit flow), the existing photo loads
//     from Storage as the starting preview.
//   - "Remove" clears the preview and emits onChange(null, { remove: true })
//     so the parent can clear items.image_path on save.

export default function PhotoInput({ initialPath = null, onChange }) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(() => photoUrl(initialPath));
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    return () => {
      if (preview && preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await compressPhoto(file);
      const url = URL.createObjectURL(blob);
      setPreview(url);
      setRemoved(false);
      onChange?.(blob, { remove: false });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setPreview(null);
    setRemoved(true);
    onChange?.(null, { remove: Boolean(initialPath) });
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="space-y-2">
      <div className="eyebrow">Photo</div>

      {preview ? (
        <div className="relative">
          <img
            src={preview}
            alt="Item preview"
            className="h-40 w-full object-cover rounded-xl border border-slate-800 bg-slate-900"
          />
          <button
            type="button"
            onClick={clear}
            aria-label="Remove photo"
            className="absolute top-2 right-2 rounded-full bg-slate-900/90 border border-slate-700 p-1.5 text-slate-200 hover:bg-slate-800"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="w-full h-40 rounded-xl border-2 border-dashed border-slate-700 bg-slate-900/40 text-slate-400 hover:border-honey-500/60 hover:text-honey-500 hover:bg-slate-900/60 transition-colors flex flex-col items-center justify-center gap-2"
        >
          <Camera size={28} strokeWidth={1.5} />
          <span className="text-sm font-medium">{busy ? 'Processing…' : 'Take photo'}</span>
          <span className="text-xs text-slate-500">or pick from camera roll</span>
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {removed && initialPath && (
        <p className="text-xs text-amber-700">
          Existing photo will be removed when you save.
        </p>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
