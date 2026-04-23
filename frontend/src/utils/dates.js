export function formatLocalDateTime(value, options, fallback = '—') {
  if (!value) return fallback;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;

  const fmt = new Intl.DateTimeFormat(undefined, options || {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return fmt.format(d);
}

/**
 * Returns a human-friendly relative string (e.g. "3 minutes ago") for dates
 * within the last 24 hours. Returns null for older dates so callers can fall
 * back to the absolute formatted time.
 */
export function timeAgo(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return null;

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;

  return null;
}
