// A Folk's recipe queue (round 5): up to QUEUE_MAX steps in its skill, the first the one it works now. A step is
// { recipeId, count, made }: `count` products of that recipe, or null for "until its inputs run out"; `made` counts
// what the Folk made of the step's products since the step began. Pure: no game globals.

/** The most steps a queue holds (the save keeps the same number). */
export const QUEUE_MAX = 3;
/** The count field's starting value in the picker. */
export const DEFAULT_COUNT = 100;
/** The biggest count a step takes (a whole number that stays exact). */
export const COUNT_MAX = 1e9;

/**
 * What the count field holds: { kind: 'qty', qty } for a whole number from 1 to COUNT_MAX (full-width digits and
 * spaces or commas between groups count), else { kind: 'bad' }. An empty field is bad too: "until inputs run out" is
 * its own switch, so unreadable text never means "for ever".
 */
export function countOf(raw) {
  const text = String(raw ?? '').normalize('NFKC').replace(/[\s,.'  ]/g, '');
  if (!/^[0-9]+$/.test(text)) return { kind: 'bad' };
  const qty = Number(text);
  return Number.isSafeInteger(qty) && qty >= 1 && qty <= COUNT_MAX ? { kind: 'qty', qty } : { kind: 'bad' };
}

/**
 * A new queue with this step added at the end: { queue } or { error } ('full' | 'count' | 'recipe'). `count` is a
 * whole number of 1 or more, or null for "until inputs run out". The same recipe may come twice (with steps between).
 */
export function addStep(queue, recipeId, count) {
  const list = Array.isArray(queue) ? queue : [];
  if (list.length >= QUEUE_MAX) return { error: 'full' };
  if (typeof recipeId !== 'string' || recipeId === '') return { error: 'recipe' };
  if (count !== null && !(Number.isInteger(count) && count >= 1 && count <= COUNT_MAX)) return { error: 'count' };
  return { queue: [...list.map((s) => ({ ...s })), { recipeId, count, made: 0 }] };
}

/** A new queue without step `index` (an index out of range leaves it as it was). */
export function removeStep(queue, index) {
  const list = Array.isArray(queue) ? queue : [];
  return list.filter((_, i) => i !== index).map((s) => ({ ...s }));
}

/** The step a Folk works now, or undefined. */
export const headOf = (queue) => (Array.isArray(queue) && queue.length > 0 ? queue[0] : undefined);

/** Whether this step has made its count ("until inputs run out" never ends on a count). */
export const stepDone = (step) => step !== undefined && step.count !== null && step.made >= step.count;

/**
 * Counts `qty` made of `itemId` towards the head step when that item is one of the head recipe's products
 * (`productIds`). Changes the step in place; returns the quantity counted.
 */
export function countMade(queue, itemId, qty, productIds) {
  const head = headOf(queue);
  if (head === undefined || !(Number.isFinite(qty) && qty > 0) || !(productIds ?? []).includes(itemId)) return 0;
  const n = Math.floor(qty);
  head.made += n;
  return n;
}

/** The queue after its head step: the rest, the new head starting at 0 made. */
export function advance(queue) {
  const rest = (Array.isArray(queue) ? queue : []).slice(1).map((s) => ({ ...s }));
  if (rest.length > 0) rest[0].made = 0;
  return rest;
}

/**
 * The items a chain keeps with the Folk: the head step's products that a later step uses (`laterInputs`: one list of
 * input ids per later step).
 */
export function chainItems(headProducts, laterInputs) {
  const used = new Set((laterInputs ?? []).flat());
  return [...new Set(headProducts ?? [])].filter((id) => used.has(id));
}

/**
 * How many of `quantity` go to the Folk's stock: as many whole items as the free room holds, at `unitMs` of room each
 * (0 or less: none). The rest goes on as usual.
 */
export function roomFor(quantity, freeMs, unitMs) {
  if (!(Number.isInteger(quantity) && quantity > 0) || !(unitMs > 0) || !(freeMs > 0)) return 0;
  return Math.min(quantity, Math.floor(freeMs / unitMs));
}

/** A step's progress for the card: { made, count, left } (count and left null for "until inputs run out"). */
export function progressOf(step) {
  if (step === undefined) return undefined;
  if (step.count === null) return { made: step.made, count: null, left: null };
  return { made: Math.min(step.made, step.count), count: step.count, left: Math.max(0, step.count - step.made) };
}
