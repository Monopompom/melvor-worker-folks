// One way to write a time left on the page (scan of build .111, 19 Oct 2026, A-12 / A-17 / C-26): the game's
// formatAsShorthandTimePeriod(ms, true) rounded "4m 59.6s" up to "0h 4m 60s" and always led with "0h". Pure.

/** The language file's wording in the game; the plain form where its strings are missing. */
const worded = (key, vars, plain) => (typeof templateLangString === 'function' ? templateLangString(key, vars) : plain);

/**
 * A countdown as "45s", "4m 59s" or "23h 55m": whole seconds rounded up (a time left never reads 0 while time is left,
 * never "60s"), no leading zero unit, seconds dropped once there are hours.
 */
export function shortTime(ms) {
  const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return worded('MOD_WF_TIME_H_M', { h: `${h}`, m: `${m}` }, `${h}h ${m}m`);
  if (m > 0) return worded('MOD_WF_TIME_M_S', { m: `${m}`, s: `${s % 60}` }, `${m}m ${s % 60}s`);
  return worded('MOD_WF_TIME_S', { s: `${s}` }, `${s}s`);
}

/**
 * Hours covered as the Payroll band writes them: rounded down, one decimal under 100, whole from 100. In the game
 * through its own formatters (the player's number setting: separators, decimal mark); plain where they are missing.
 */
export function hoursText(h) {
  if (!Number.isFinite(h)) return '∞';
  if (h >= 100) {
    const whole = Math.floor(h);
    // A huge cover stays short enough for the Overview's one-line pill.
    if (whole >= 10000 && typeof formatNumber === 'function') return formatNumber(whole);
    return typeof numberWithCommas === 'function' ? numberWithCommas(whole) : `${whole}`;
  }
  const tenth = Math.floor(h * 10) / 10;
  return typeof formatFixed === 'function' ? formatFixed(tenth, 1) : tenth.toFixed(1);
}
