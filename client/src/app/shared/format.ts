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
