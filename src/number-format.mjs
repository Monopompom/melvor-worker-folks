// A big number in a short form, for the lines where a full one is too long to read at a glance (the user, 29 Oct
// 2026). Pure: the game's own formatters are used when they are there, plain output where they are not (tests).

const UNITS = [
  { size: 1e12, fallback: 'T' },
  { size: 1e9, fallback: 'B' },
  { size: 1e6, fallback: 'M' },
  { size: 1e3, fallback: 'K' },
];

const whole = (n) => (typeof numberWithCommas === 'function' ? numberWithCommas(n) : `${n}`);
const tenth = (n) => (typeof formatFixed === 'function' ? formatFixed(n, 1) : n.toFixed(1));

/** The game's own letter for a unit (its short form of ten of them, digits stripped), so a translation carries over. */
function suffix(unit) {
  if (typeof formatNumber !== 'function') return unit.fallback;
  const s = String(formatNumber(unit.size * 10)).replace(/^[-\d\s.,  ']+/, '');
  return s === '' ? unit.fallback : s;
}

/**
 * "9,999" as it is, then "12.3K", "125K", "2.5M", "100M": rounded down, one decimal under 100 of a unit, no ".0".
 * The game's formatNumber drops the decimal ("2M" for 2,500,000), which misstates a price by a quarter.
 */
export function shortNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return `${value}`;
  const sign = n < 0 ? '-' : '';
  const abs = Math.floor(Math.abs(n));
  if (abs < 10000) return sign + whole(abs);
  const unit = UNITS.find((u) => abs >= u.size);
  const v = abs / unit.size;
  if (v >= 100) return `${sign}${whole(Math.floor(v))}${suffix(unit)}`;
  const t = Math.floor(v * 10) / 10;
  return `${sign}${Number.isInteger(t) ? whole(t) : tenth(t)}${suffix(unit)}`;
}
