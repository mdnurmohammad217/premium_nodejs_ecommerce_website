/**
 * v3.14 — a database time as an ISO string with its time zone ("…Z").
 *
 * Raw SQL rows give TIMESTAMP columns as "2026-10-18 09:04:07": the moment in
 * UTC (every connection works in UTC, see src/db/index.ts) but without the
 * "Z". A browser reads such a string as its own local time, so in Bangladesh
 * a message from a minute ago showed as "6 h ago". Sending "2026-10-18T09:04:07Z"
 * lets every browser show the right local time.
 */
export function utcIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const text = String(value).trim();
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/.exec(text);
  return match ? `${match[1]}T${match[2]}Z` : text;
}
