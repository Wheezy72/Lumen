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
