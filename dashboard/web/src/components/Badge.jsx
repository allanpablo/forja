export default function Badge({ status, children }) {
  const cls = `badge badge-${status || 'unknown'}`;
  return <span className={cls}>{children || status || '—'}</span>;
}
