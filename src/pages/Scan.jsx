import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import {
  getItem,
  itemTypeLabel,
  lookupItemByCode,
  recordMovement,
} from '../lib/items.js';
import { success as hapticSuccess, error as hapticError, tap as hapticTap } from '../lib/haptics.js';
import StatusPill from '../components/StatusPill.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import BuildingPicker from '../components/BuildingPicker.jsx';

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
  const [permDenied, setPermDenied] = useState(false);
  const [scannerKind, setScannerKind] = useState(null);  // 'native' | 'zxing' | null
  const [manualCode, setManualCode] = useState('');
  const [busy, setBusy]             = useState(false);
  const [flash, setFlash]           = useState(null);    // { name, direction } shown for 1.5s
  const [buildingId, setBuildingId] = useState('');      // optional destination tag

  // Camera + barcode detector lifecycle.
  // Path A: native BarcodeDetector (Chrome / Edge on Android + desktop).
  // Path B: @zxing/browser fallback (Safari / iOS — dynamically imported so
  //         Chrome users don't pay the ~60KB gzipped cost).
  useEffect(() => {
    let stopped = false;
    let raf = 0;
    let zxingReader = null;            // path B handle
    let lastCode = null;
    let lastCodeAt = 0;

    function maybeHandle(code) {
      if (!code) return;
      const now = Date.now();
      if (code !== lastCode || now - lastCodeAt > DEBOUNCE_MS) {
        lastCode = code;
        lastCodeAt = now;
        lookup(code);
      }
    }

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

        let nativeDetector = null;
        if ('BarcodeDetector' in window) {
          try {
            nativeDetector = new window.BarcodeDetector({ formats: BARCODE_FORMATS });
          } catch {
            // Some browsers expose the constructor but throw on unsupported
            // formats — fall through to ZXing.
            nativeDetector = null;
          }
        }

        if (nativeDetector) {
          setScannerKind('native');
          const tick = async () => {
            if (stopped) return;
            if (v.readyState >= 2) {
              try {
                const codes = await nativeDetector.detect(v);
                if (codes.length > 0) maybeHandle(codes[0].rawValue);
              } catch { /* transient — ignore */ }
            }
            raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
          return;
        }

        // Fallback: @zxing/browser. Dynamically imported so Chrome users
        // don't pay the ~60KB gzipped cost for a path they never use.
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (stopped) return;
        zxingReader = new BrowserMultiFormatReader();
        setScannerKind('zxing');
        // The callback fires on every recognized symbol; errors are passed
        // too but most are just "no code in frame", which we ignore.
        await zxingReader.decodeFromVideoElement(v, (result) => {
          if (result) maybeHandle(result.getText());
        });
      } catch (e) {
        if (stopped) return;
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          setPermDenied(true);
        } else if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') {
          setError('No camera found on this device. Use manual entry below.');
        } else {
          setError(e.message || String(e));
        }
      }
    }
    init();

    return () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      if (zxingReader) {
        try { zxingReader.reset?.(); } catch { /* noop */ }
      }
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
    hapticTap();
    try {
      const result = await recordMovement({
        itemId: item.id, direction, qty: 1,
        unitCostSnapshot: item.best_price ?? null,
        maxPriceSnapshot: item.max_price ?? null,
        vendorSnapshot:   item.best_vendor ?? null,
        buildingId:       buildingId || null,
      });
      const queued = result?.queued === true;
      hapticSuccess();
      setFlash({ name: item.name, direction, queued });
      if (queued) {
        // Server hasn't seen the change yet — apply the delta locally so the
        // next scan operates on the updated qty. Drainer reconciles later.
        const delta = direction === 'in' ? 1 : -1;
        const nextQty = Math.max(0, item.qty + delta);
        setItem({
          ...item,
          qty: nextQty,
          status: nextQty <= 0 ? 'out'
                : nextQty <= item.threshold ? 'low'
                : 'ok',
        });
      } else {
        const refreshed = await getItem(item.id);
        setItem(refreshed);
      }
      setTimeout(() => setFlash(null), 1500);
    } catch (e) {
      setError(e.message);
      hapticError();
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
      {/* Direction toggle. Matched to the bottom +/− buttons: brass for IN,
          red for OUT — so the action you pick up top reads the same as the
          button you'll tap below. Matte, no gradient. */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-800 p-1">
        <button
          type="button"
          onClick={() => setDirection('in')}
          className={`rounded-lg py-2 text-sm font-medium transition-colors ${
            inDir
              ? 'bg-sage-600 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Check IN
        </button>
        <button
          type="button"
          onClick={() => setDirection('out')}
          className={`rounded-lg py-2 text-sm font-medium transition-colors ${
            !inDir
              ? 'bg-red-700 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.10)]'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Check OUT
        </button>
      </div>

      <BuildingPicker value={buildingId} onChange={setBuildingId} />

      {/* viewfinder */}
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-black border border-slate-800">
        <video
          ref={videoRef}
          muted
          playsInline
          className="h-full w-full object-cover"
        />
        {/* reticle */}
        <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.55)] overflow-hidden">
          {scannerKind && !flash && <div className="scan-line" />}
        </div>
        {/* Active-scan indicator. Sits at the bottom of the viewfinder so it
            doesn't fight the match-flash banner that takes the top edge. */}
        {scannerKind && !flash && !permDenied && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-slate-950/85 px-2.5 py-1 text-[11px] font-medium text-honey-200 ring-1 ring-honey-400/30">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-honey-400 animate-pulse" />
            Scanning…
          </div>
        )}
        {!scannerKind && !permDenied && !error && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-slate-950/85 px-2.5 py-1 text-[11px] font-medium text-slate-300 ring-1 ring-slate-700">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
            Starting camera…
          </div>
        )}
        {flash && (
          <div className={`absolute inset-x-0 top-0 text-white px-3 py-2 text-sm font-medium flex items-center justify-center gap-1.5 ${
            flash.queued ? 'bg-amber-600' : 'bg-emerald-600'
          }`}>
            <Check size={14} strokeWidth={3} />
            {flash.direction === 'in' ? '+1' : '−1'}: {flash.name}
            {flash.queued && ' (queued)'}
          </div>
        )}
      </div>

      <ErrorBanner
        message={permDenied
          ? "Camera permission denied. Allow camera access in your browser's site settings and reload, or use manual entry below."
          : null}
      />

      {/* matched item card */}
      {item ? (
        <div className="surface p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link to={`/items/${item.id}`} className="font-semibold text-slate-100 truncate hover:text-sage-300 transition-colors">
                {item.name}
              </Link>
              <div className="text-xs text-slate-400 truncate">
                {item.brand && <>{item.brand} · </>}
                <span className="font-mono">{item.sku}</span>
                {' · '}{itemTypeLabel(item.item_type)}
              </div>
            </div>
            <StatusPill status={item.status} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase text-slate-500 tracking-wide">On hand</div>
              <div className="text-2xl font-semibold tabular-nums text-slate-100">{item.qty}</div>
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
        <div className="rounded-2xl border border-dashed border-slate-700 p-4 text-center text-sm text-slate-400 space-y-1">
          <div>Point the camera at a UPC barcode or one of our QR labels.</div>
          <div className="text-xs text-slate-500">Hold ~4–8&nbsp;inches away and keep steady — focus catches automatically.</div>
        </div>
      )}

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* manual entry */}
      <form onSubmit={manualSubmit} className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 placeholder-slate-500"
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
