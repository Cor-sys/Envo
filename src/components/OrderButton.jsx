// One-click reorder shortcut.
//
//   - If the item has a metadata.purchase_url set, the button opens that URL
//     in a new tab (rel=noopener for safety on external links).
//   - Otherwise we fall back to a Google search for "{brand} {name}" so the
//     button is useful immediately, before staff have configured per-item
//     URLs for the catalog.
//
// We deliberately don't store the purchase URL on its own column — keeping
// it inside items.metadata.purchase_url makes this a zero-migration feature
// and lines up with how the rest of type-specific data is stored.

function searchUrl({ brand, name, model, sku }) {
  const parts = [brand, name, model].filter(Boolean);
  const q = parts.join(' ') || sku || '';
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export function getOrderUrl(item) {
  if (!item) return null;
  const direct = item?.metadata?.purchase_url;
  if (direct && /^https?:\/\//i.test(direct)) return direct;
  return searchUrl(item);
}

export default function OrderButton({ item, className = '', variant = 'primary', children = 'Order' }) {
  const url = getOrderUrl(item);
  if (!url) return null;
  const fallback = !item?.metadata?.purchase_url;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${variant === 'primary' ? 'tap-primary' : 'tap-secondary'} ${className}`}
      title={fallback ? 'No reorder URL set — opens a Google search' : 'Open reorder page in a new tab'}
    >
      {children}
      {fallback && <span className="ml-1 text-xs opacity-70">↗</span>}
    </a>
  );
}
