import { AlertTriangle, X } from 'lucide-react';

// Standardised error surface. Used anywhere an action or load might fail.
//
//   <ErrorBanner message={error} onDismiss={() => setError(null)} />
//
// `variant="banner"` (default) draws a full-width red-tinted card with an
// icon and an optional dismiss button — appropriate at the top of a form
// or list when an error blocks progress.
//
// `variant="inline"` is the lightweight fallback for cases where space is
// tight (e.g. inline next to a form field) — same color language, no
// surface chrome, no icon.
//
// Both variants render nothing when `message` is null/empty, so callers
// can mount the component unconditionally and pass state through.

export default function ErrorBanner({
  message,
  onDismiss = null,
  variant = 'banner',
  className = '',
}) {
  if (!message) return null;

  if (variant === 'inline') {
    return (
      <p className={`text-red-300 text-sm ${className}`}>{message}</p>
    );
  }

  return (
    <div
      role="alert"
      className={`rounded-xl border border-red-500/30 bg-red-500/10
                  p-3 flex items-start gap-2.5 text-sm ${className}`}
    >
      <AlertTriangle size={16} strokeWidth={2.2} className="text-red-300 shrink-0 mt-0.5" />
      <p className="text-red-200 flex-1 min-w-0">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-red-300/70 hover:text-red-200 shrink-0 -m-1 p-1 rounded"
        >
          <X size={14} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}
