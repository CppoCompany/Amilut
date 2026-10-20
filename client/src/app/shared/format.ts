/** Hebrew-locale date (`dd.mm.yyyy`) for an ISO date/date-time, or an em dash when missing/invalid. */
export function formatHeDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** Comma-joined list, or an em dash when empty. */
export function joinOrEmDash(values: readonly (string | number)[] | null | undefined): string {
  return values && values.length ? values.join(', ') : '—';
}

/** The value as text, or an em dash for `null`/`undefined`/`''`. */
export function textOrEmDash(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

/**
 * "עכשיו", "לפני 5 דקות", "אתמול"… for anything within the last week;
 * otherwise the plain Hebrew date. `now` is injectable for tests.
 */
export function formatHeRelativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = date.getTime() - now;
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 1) return 'עכשיו';
  const rtf = new Intl.RelativeTimeFormat('he', { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return rtf.format(days, 'day');
  return formatHeDate(iso);
}
