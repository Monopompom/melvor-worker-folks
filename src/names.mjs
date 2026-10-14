// Folk name generation. Pure: no game globals.

export const FIRST_NAMES = [
  'Ada', 'Bram', 'Cora', 'Dag', 'Elin', 'Finn', 'Greta', 'Hald', 'Ivo', 'Jute',
  'Kell', 'Lotte', 'Milo', 'Nessa', 'Orrin', 'Pim', 'Quill', 'Rue', 'Sten', 'Tove',
  'Ulf', 'Vera', 'Wren', 'Ysolde', 'Zane', 'Astrid', 'Boyd', 'Cass', 'Dolph', 'Edda',
  'Ferris', 'Gwen', 'Hob', 'Ingrid', 'Jory', 'Kit', 'Lark', 'Marit', 'Nils', 'Oona',
  'Perrin', 'Rolf', 'Sigrun', 'Tam', 'Una', 'Viggo', 'Willa', 'Yorick',
];

/** Light-hearted epithets; every combination with a first name is a possible Folk. */
export const EPITHETS = [
  'the Punctual', 'the Unhurried', 'of Many Snacks', 'the Overthinker', 'the Tea-Fuelled',
  'the Barely Awake', 'the Log Whisperer', 'the Optimist', 'the Mildly Lost', 'the Lunch Enthusiast',
  'the Second Breakfast', 'the Nearly Famous', 'the Reasonably Brave', 'the Chair Expert',
  'the Rock Hugger', 'the Fish Negotiator', 'the Early Finisher', 'the Nap Scheduler',
  'the Hat Collector', 'the Cheerful', 'the Compass Doubter', 'the Sock Mismatcher',
  'the Loud Yawner', 'the Meeting Avoider', 'the Pie Judge', 'the Cloud Watcher',
  'the Humble Legend', 'the Fully Insured', 'the Whistler', 'the Bucket Carrier',
  'the Ladder Holder', 'the Tool Borrower',
];

/**
 * Picks "<first name> <epithet>" not in `taken` (first names are spread out before
 * epithets repeat). When every combination is used, appends the smallest free
 * roman-style numeral (e.g. "Ada the Punctual II"). `rng` returns [0,1).
 * With an empty `epithets` list the name is the first name alone.
 */
export function pickName(taken, rng = Math.random, names = FIRST_NAMES, epithets = EPITHETS) {
  const used = new Set(taken);
  const full = (first, epithet) => (epithet === undefined ? first : `${first} ${epithet}`);
  const takenFirst = new Set(taken.map((n) => n.split(' ')[0]));
  const freeFirst = names.filter((n) => !takenFirst.has(n));
  const firsts = freeFirst.length > 0 ? freeFirst : names;
  const pool = epithets.length === 0 ? [undefined] : epithets;
  const first = firsts[Math.floor(rng() * firsts.length)];
  const options = pool.map((e) => full(first, e)).filter((n) => !used.has(n));
  if (options.length > 0) return options[Math.floor(rng() * options.length)];
  const base = full(names[Math.floor(rng() * names.length)], pool[Math.floor(rng() * pool.length)]);
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base} ${toRoman(n)}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base} ${Date.now()}`;
}

export function toRoman(n) {
  const table = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [value, sym] of table) {
    while (n >= value) {
      out += sym;
      n -= value;
    }
  }
  return out;
}
