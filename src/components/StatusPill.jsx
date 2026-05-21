export default function StatusPill({ status }) {
  if (status === 'out') return <span className="pill-out">OUT</span>;
  if (status === 'low') return <span className="pill-low">LOW</span>;
  return <span className="pill-ok">OK</span>;
}
