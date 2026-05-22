import { ExternalLink } from 'lucide-react';

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

// Variants:
//   primary    — screen-level CTA, 44px min (e.g. ItemDetail's reorder banner).
//   secondary  — same height, neutral chrome.
//   compact    — in-row action (Reports table). 36px min — comfortable but
//                doesn't dominate dense rows.
const VARIANT_CLASS = {
  primary:   'tap-primary',
  secondary: 'tap-secondary',
  compact:   'tap-sm-secondary',
};

export default function OrderButton({ item, className = '', variant = 'primary', children = 'Order' }) {
  const url = getOrderUrl(item);
  if (!url) return null;
  const fallback = !item?.metadata?.purchase_url;
  const base = VARIANT_CLASS[variant] ?? VARIANT_CLASS.primary;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${base} ${className}`}
      title={fallback ? 'No reorder URL set — opens a Google search' : 'Open reorder page in a new tab'}
    >
      {children}
      <ExternalLink size={14} strokeWidth={2} className={fallback ? 'opacity-70' : ''} />
    </a>
  );
}
