export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

export const SEVERITY_COLORS = {
  critical: '#7c3aed',
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#14b8a6',
  info: '#6b7280',
};

export function getSeverityRank(sev) {
  const s = String(sev || 'info').toLowerCase();
  if (s === 'critical') return 4;
  if (s === 'high') return 3;
  if (s === 'medium') return 2;
  if (s === 'low') return 1;
  return 0;
}
