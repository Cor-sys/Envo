// Shared empty-state surface. Use anywhere the page has no rows to show.
//
//   <EmptyState title="No items yet" description="Tap + to add the first."
//               action={<Link to="/items/new" className="tap-primary">Add item</Link>} />
//
// The dashed border + roomy padding makes it obvious that the absence is
// intentional (vs. "still loading" — which uses Skeleton instead).
// `variant="inline"` drops the surface and renders as quiet centered text,
// for places like sheet bodies where a full card is too heavy.

export default function EmptyState({
  title,
  description = null,
  action = null,
  icon = null,
  variant = 'card',
  className = '',
}) {
  if (variant === 'inline') {
    return (
      <div className={`text-center py-6 px-3 ${className}`}>
        {icon && <div className="mx-auto mb-2 text-slate-500">{icon}</div>}
        <p className="text-sm text-slate-300 font-medium">{title}</p>
        {description && (
          <p className="text-xs text-slate-500 mt-1">{description}</p>
        )}
        {action && <div className="mt-3">{action}</div>}
      </div>
    );
  }
  return (
    <div
      className={`rounded-2xl border border-dashed border-slate-700
                  bg-slate-900/30 p-6 text-center ${className}`}
    >
      {icon && (
        <div className="mx-auto mb-3 text-slate-500 inline-flex">{icon}</div>
      )}
      <p className="font-medium text-slate-200">{title}</p>
      {description && (
        <p className="text-sm text-slate-400 mt-1">{description}</p>
      )}
      {action && <div className="mt-4 inline-flex">{action}</div>}
    </div>
  );
}
