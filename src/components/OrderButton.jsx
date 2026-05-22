import { ExternalLink } from 'lucide-react';
import { formatMoney } from '../lib/prices.js';

// One-click reorder shortcut. Three-step fallback so the button always
// does something useful:
//
//   1. item.best_url   — cheapest priced quote from the item_prices table
//                        (PR A schema, surfaced via items_with_best_price)
//   2. metadata.purchase_url — legacy single URL kept on every item for
//                              backward compatibility until pricing data
//                              soaks across the catalog
//   3. Google search for "{brand} {name} {model}" — always works, even
//                              when no URL has been configured yet
//
// The variant prop controls sizing:
//   primary   — screen-level CTA, 44px min (ItemDetail's reorder banner)
//   secondary — same height, neutral chrome
//   compact   — in-row action (Reports table). 36px min — comfortable but
//               doesn't dominate dense rows.

function searchUrl({ brand, name, model, sku }) {
  const parts = [brand, name, model].filter(Boolean);
  const q = parts.join(' ') || sku || '';
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

// Resolves the URL to open + which fallback layer produced it. Callers
// pass the item shape coming from `items_with_best_price` (best_url is
// computed there) but the function tolerates absence — old call sites
// still see legacy behaviour.
export function getOrderMeta(item) {
  if (!item) return null;

  const best = item.best_url;
  if (best && /^https?:\/\//i.test(best)) {
    return { url: best, source: 'best', vendor: item.best_vendor, price: item.best_price };
  }

  const legacy = item?.metadata?.purchase_url;
  if (legacy && /^https?:\/\//i.test(legacy)) {
    return { url: legacy, source: 'legacy' };
  }

  return { url: searchUrl(item), source: 'search' };
}

// Backwards-compat shim for callers that just want the URL string.
export function getOrderUrl(item) {
  return getOrderMeta(item)?.url ?? null;
}

const VARIANT_CLASS = {
  primary:   'tap-primary',
  secondary: 'tap-secondary',
  compact:   'tap-sm-secondary',
};

function titleFor(meta) {
  if (!meta) return null;
  if (meta.source === 'best') {
    const parts = [];
    if (meta.vendor) parts.push(meta.vendor);
    if (meta.price != null) parts.push(formatMoney(meta.price));
    return parts.length
      ? `Cheapest quote — ${parts.join(' · ')}`
      : 'Open cheapest quote in a new tab';
  }
  if (meta.source === 'legacy') return 'Open reorder page in a new tab';
  return 'No reorder URL set — opens a Google search';
}

export default function OrderButton({ item, className = '', variant = 'primary', children = 'Order' }) {
  const meta = getOrderMeta(item);
  if (!meta) return null;
  const isSearch = meta.source === 'search';
  const base = VARIANT_CLASS[variant] ?? VARIANT_CLASS.primary;
  return (
    <a
      href={meta.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${base} ${className}`}
      title={titleFor(meta)}
    >
      {children}
      <ExternalLink size={14} strokeWidth={2} className={isSearch ? 'opacity-70' : ''} />
    </a>
  );
}
