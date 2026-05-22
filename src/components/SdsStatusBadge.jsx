import { AlertTriangle, CheckCircle2, HelpCircle, Link2 } from 'lucide-react';

// SDS readiness badge. Quiet variant — small icon + colored text, no chip
// fill. Maps the lib/sds.js status values to a Lucide icon + label.

const VARIANTS = {
  uploaded: { Icon: CheckCircle2,  label: 'On file',    color: 'text-emerald-700' },
  linked:   { Icon: Link2,         label: 'Linked',     color: 'text-honey-500' },
  hint:     { Icon: HelpCircle,    label: 'Unverified', color: 'text-amber-700' },
  missing:  { Icon: AlertTriangle, label: 'Missing',    color: 'text-red-700' },
};

export default function SdsStatusBadge({ status, size = 'sm' }) {
  const v = VARIANTS[status] ?? VARIANTS.missing;
  const px = size === 'lg' ? 14 : 12;
  const cls = size === 'lg' ? 'text-xs' : 'text-[11px]';
  return (
    <span className={`inline-flex items-center gap-1 font-medium uppercase tracking-wider ${cls} ${v.color}`}>
      <v.Icon size={px} strokeWidth={2.2} />
      {v.label}
    </span>
  );
}
