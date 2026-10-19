// One way to write a time left on the page (scan of build .111, 19 Oct 2026, A-12 / A-17 / C-26): the game's
// formatAsShorthandTimePeriod(ms, true) rounded "4m 59.6s" up to "0h 4m 60s" and always led with "0h". Pure.

/**
 * A countdown as "45s", "4m 59s" or "23h 55m": whole seconds rounded up (a time left never reads 0 while time is left,
 * never "60s"), no leading zero unit, seconds dropped once there are hours.
 */
export function shortTime(ms) {
  const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

/** Hours covered as the Payroll band writes them: one decimal under 100, whole from 100. */
export function hoursText(h) {
  if (!Number.isFinite(h)) return '∞';
  return h >= 100 ? `${Math.floor(h)}` : (Math.floor(h * 10) / 10).toFixed(1);
}
