export function getSeverityRank(sev) {
  const s = String(sev || 'info').toLowerCase();
  if (s === 'critical') return 4;
  if (s === 'high') return 3;
  if (s === 'medium') return 2;
  if (s === 'low') return 1;
  return 0;
}
