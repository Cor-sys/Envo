import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getItem,
  itemTypeLabel,
  lookupItemByCode,
  recordMovement,
} from '../lib/items.js';
import StatusPill from '../components/StatusPill.jsx';

const BARCODE_FORMATS = [
  'qr_code',
  'upc_a', 'upc_e',
  'ean_13', 'ean_8',
  'code_128', 'code_39',
  'itf', 'codabar',
  'data_matrix',
];

const DEBOUNCE_MS = 1500;

export default function Scan() {
  const videoRef = useRef(null);
  const [direction, setDirection]   = useState('out');   // default: pulling stock
  const [item, setItem]             = useState(null);
  const [error, setError]           = useState(null);
  const [unsupported, setUnsupported] = useState(false);
  const [permDenied, setPermDenied] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [busy, setBusy]             = useState(false);
  const [flash, setFlash]           = useState(null);    // { name, direction } shown for 1.5s

  // Camera + barcode detector lifecycle
  useEffect(() => {
    if (!('BarcodeDetector' in window)) {
      setUnsupported(true);
      return;
    }

    let stopped = false;
    let detector = null;
    let raf = 0;
    let lastCode = null;
    let lastCodeAt = 0;

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = videoRef.current;
        if (!v) return;
        v.srcObject = stream;
        v.setAttribute('playsinline', '');
        await v.play();

        detector = new window.BarcodeDetector({ formats: BARCODE_FORMATS });

        const tick = async () => {
          if (stopped) return;
          if (v.readyState >= 2) {
            try {
              const codes = await detector.detect(v);
              if (codes.length > 0) {
                const code = codes[0].rawValue;
                const now = Date.now();
                if (code !== lastCode || now - lastCodeAt > DEBOUNCE_MS) {
                  lastCode = code;
                  lastCodeAt = now;
                  lookup(code);
                }
              }
            } catch {
              /* transient detection errors — ignore */
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        if (stopped) return;
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          setPermDenied(true);
        } else {
          setError(e.message || String(e));
        }
      }
    }
    init();

    return () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      const v = videoRef.current;
      const stream = v?.srcObject;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        v.srcObject = null;
      }
    };
  }, []);

  async function lookup(code) {
    setError(null);
    try {
      const found = await lookupItemByCode(code);
      if (!found) {
        setItem(null);
        setError(`No item with barcode or SKU "${code}".`);
        return;
      }
      setItem(found);
    } catch (e) {
      setError(e.message);
    }
  }

  async function commit() {
    if (!item || busy) return;
    setBusy(true);
    setError(null);
    try {
      await recordMovement({ itemId: item.id, direction, qty: 1 });
      setFlash({ name: item.name, direction });
      // Refresh item so the on-screen qty/status update
      const refreshed = await getItem(item.id);
      setItem(refreshed);
      setTimeout(() => setFlash(null), 1500);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function manualSubmit(e) {
    e.preventDefault();
    const c = manualCode.trim();
    if (!c) return;
    setManualCode('');
    lookup(c);
  }

  const inDir = direction === 'in';
  const dirLabel = inDir ? '+1 IN' : '−1 OUT';

  return (
    <div className="p-3 space-y-3">
      {/* direction toggle */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setDirection('in')}
          className={`rounded-lg py-2 text-sm font-medium ${
            inDir ? 'bg-white text-slate-900 shadow' : 'text-slate-500'
          }`}
        >
          Check IN
        </button>
        <button
          type="button"
          onClick={() => setDirection('out')}
          className={`rounded-lg py-2 text-sm font-medium ${
            !inDir ? 'bg-white text-slate-900 shadow' : 'text-slate-500'
          }`}
        >
          Check OUT
        </button>
      </div>

      {/* viewfinder */}
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-900">
        <video
          ref={videoRef}
          muted
          playsInline
          className="h-full w-full object-cover"
        />
        {/* reticle */}
        <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]" />
        {flash && (
          <div className="absolute inset-x-0 top-0 bg-emerald-500/95 text-white px-3 py-2 text-sm font-medium text-center">
            ✓ {flash.direction === 'in' ? '+1' : '−1'}: {flash.name}
          </div>
        )}
      </div>

      {unsupported && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          This browser doesn't support live barcode scanning. Type the
          factory UPC or our SKU (e.g. <code className="font-mono">STK0001</code>) in
          the field below.
        </div>
      )}
      {permDenied && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          Camera permission denied. Allow camera access in your browser's
          site settings and reload, or use manual entry below.
        </div>
      )}

      {/* matched item card */}
      {item ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link to={`/items/${item.id}`} className="font-semibold truncate">
                {item.name}
              </Link>
              <div className="text-xs text-slate-500 truncate">
                {item.brand && <>{item.brand} · </>}
                <span className="font-mono">{item.sku}</span>
                {' · '}{itemTypeLabel(item.item_type)}
              </div>
            </div>
            <StatusPill status={item.status} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase text-slate-500">On hand</div>
              <div className="text-2xl font-semibold tabular-nums">{item.qty}</div>
              <div className="text-xs text-slate-500">threshold {item.threshold}</div>
            </div>
            <button
              type="button"
              onClick={commit}
              disabled={busy || (!inDir && item.qty < 1)}
              className={inDir ? 'tap-primary' : 'tap-danger'}
            >
              {busy ? '…' : dirLabel}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
          Point the camera at a UPC barcode or one of our QR labels.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {/* manual entry */}
      <form onSubmit={manualSubmit} className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2"
          placeholder="Or type UPC / SKU"
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          inputMode="numeric"
        />
        <button type="submit" className="tap-secondary">Look up</button>
      </form>
    </div>
  );
}
