// Carriers (API v12): a Folk on a job with a roomScale carries goods in its own room between other Folks, depots and
// your bank. These are the sums for one move: what comes first, how much fits, how a short load or bank is shared.
// Stacks are { id, qty, ms } as in a room (ms: the work the stack is worth). Pure: no game globals.

/**
 * The stacks a carrier takes, in the order it takes them: what `linkedIds` names first (a supply line's goods), then
 * the rest as given. `only` (an array of ids): nothing else.
 */
export function takeOrder(stacks, linkedIds = [], only) {
  const linked = new Set(linkedIds);
  const allowed = Array.isArray(only) ? new Set(only) : undefined;
  const list = (stacks ?? []).filter(({ id }) => allowed === undefined || allowed.has(id));
  return [...list.filter(({ id }) => linked.has(id)), ...list.filter(({ id }) => !linked.has(id))];
}

/**
 * What fits in `freeMs`, in order: whole stacks while they fit, then as many whole units of a stack as still do, each
 * with its share of the work. A stack that weighs nothing always fits. { moves: [{ id, qty, ms }], ms }.
 */
export function fitStacks(stacks, freeMs) {
  const moves = [];
  let left = Math.max(0, freeMs);
  let ms = 0;
  for (const s of stacks ?? []) {
    if (!(s.qty > 0)) continue;
    if (!(s.ms > 0)) {
      moves.push({ id: s.id, qty: s.qty, ms: 0 });
      continue;
    }
    const qty = s.ms <= left ? s.qty : Math.floor(left / (s.ms / s.qty));
    if (qty <= 0) continue;
    const part = qty === s.qty ? s.ms : (s.ms * qty) / s.qty;
    moves.push({ id: s.id, qty, ms: part });
    left = Math.max(0, left - part);
    ms += part;
  }
  return { moves, ms };
}

/** One action's inputs that count: a positive quantity. */
const inputsOf = (perAction) => (perAction ?? []).filter(({ qty }) => Number.isInteger(qty) && qty > 0);
/** The work one unit of an input is worth: an even share of the action's time, as a Restock weighs it. */
const unitOf = (inputs, intervalMs, qty) => intervalMs / inputs.length / qty;

/**
 * What a carrier hands a Folk: for each input of its recipe, up to as many units as `freeMs` holds actions of, from
 * what is aboard (`aboard(id)`), each re-weighed by this recipe. An input it lacks doesn't hold back the others.
 * [{ id, qty, ms }].
 */
export function giveStacks({ perAction, intervalMs, freeMs, aboard }) {
  const inputs = inputsOf(perAction);
  if (inputs.length === 0 || !(intervalMs > 0) || !(freeMs > 0)) return [];
  const actions = Number.isFinite(freeMs) ? Math.floor(freeMs / intervalMs) : Infinity;
  if (actions === 0) return [];
  const out = [];
  for (const { id, qty } of inputs) {
    const n = Math.min(actions * qty, Math.max(0, Math.floor(aboard(id))));
    if (n > 0) out.push({ id, qty: n, ms: n * unitOf(inputs, intervalMs, qty) });
  }
  return out;
}

/** What `actions` per demand ask: from what is aboard first, in order, the rest from the bank, with its weight. */
function assess(demands, actions, aboard, bankQty, freeMs) {
  const spare = new Map();
  const left = (id) => {
    if (!spare.has(id)) spare.set(id, Math.max(0, Math.floor(aboard(id))));
    return spare.get(id);
  };
  const bank = new Map();
  let weight = 0;
  const stops = demands.map((d, i) => {
    const items = d.inputs.map(({ id, qty }) => {
      const need = actions[i] * qty;
      const fromAboard = Math.min(left(id), need);
      spare.set(id, left(id) - fromAboard);
      const fromBank = need - fromAboard;
      const ms = fromBank * unitOf(d.inputs, d.intervalMs, qty);
      if (fromBank > 0) {
        const e = bank.get(id) ?? { qty: 0, ms: 0 };
        e.qty += fromBank;
        e.ms += ms;
        bank.set(id, e);
      }
      weight += ms;
      return { id, qty: need };
    });
    return { key: d.key, actions: actions[i], items };
  });
  const overLoad = weight > freeMs;
  const overBank = [...bank].some(([id, e]) => e.qty > Math.max(0, bankQty(id)));
  return { ok: !overLoad && !overBank, overLoad, overBank, stops, bank, weight };
}

/**
 * Inputs a carrier loads at the bank for its stops. `demands`: [{ key, perAction, intervalMs, freeMs }], one per Folk
 * it feeds. Each wants its free room's worth of actions; when the load's `freeMs` or the bank can't cover them all,
 * every demand gets the same hours of work as far as it wants them, and one whose own item runs out stops there while
 * the others go on rising. What is `aboard(id)` counts first and costs no space. `aboardIds`: the items aboard; any no
 * demand's recipe uses comes back as `spare`, to go home.
 * { stops: [{ key, actions, items: [{ id, qty }] }], take: [{ id, qty, ms }], spare: [id], ms, short } with `short`
 * 'load' | 'bank' when a demand got less than it wanted, else null.
 */
export function inputsPlan({ demands, freeMs, aboard, aboardIds = [], bankQty }) {
  const used = new Set((demands ?? []).flatMap((d) => inputsOf(d.perAction).map(({ id }) => id)));
  const spare = aboardIds.filter((id) => !used.has(id)).sort();
  const list = (demands ?? [])
    .map((d) => ({ key: d.key, inputs: inputsOf(d.perAction), intervalMs: d.intervalMs, want: d.intervalMs > 0 ? Math.floor(Math.max(0, d.freeMs) / d.intervalMs) : 0 }))
    .filter((d) => d.inputs.length > 0 && d.want > 0);
  const room = Math.max(0, freeMs);
  // Demands whose own item ran out, at the actions they reached.
  const stopped = new Map();
  const at = (hours) => list.map((d, i) => stopped.get(i) ?? Math.min(d.want, Math.floor(hours / d.intervalMs)));
  const check = (actions) => assess(list, actions, aboard, bankQty, room);

  const top = list.reduce((max, d) => Math.max(max, d.want * d.intervalMs), 0);
  let actions = at(top);
  while (!check(actions).ok) {
    // The most hours every demand still rising can have alike.
    let lo = 0;
    let hi = top;
    for (let i = 0; i < 48 && hi - lo > 1; i += 1) {
      const mid = (lo + hi) / 2;
      if (check(at(mid)).ok) lo = mid;
      else hi = mid;
    }
    actions = at(lo);
    // Whole actions leave a little over: one more each, in order, while it still fits.
    list.forEach((d, i) => {
      if (actions[i] >= d.want) return;
      const next = actions.map((n, j) => (j === i ? n + 1 : n));
      if (check(next).ok) actions = next;
    });
    // One more action the bank can't cover: that demand is done. None like that means the load is what's short.
    const before = stopped.size;
    list.forEach((d, i) => {
      if (stopped.has(i) || actions[i] >= d.want) return;
      if (check(actions.map((n, j) => (j === i ? n + 1 : n))).overBank) stopped.set(i, actions[i]);
    });
    if (stopped.size === before) break;
    actions = at(top);
  }
  const result = check(actions);
  let short = null;
  for (let i = 0; i < list.length && short === null; i += 1) {
    if (actions[i] >= list[i].want) continue;
    const next = actions.map((n, j) => (j === i ? n + 1 : n));
    short = check(next).overLoad ? 'load' : 'bank';
  }
  return {
    stops: result.stops,
    take: [...result.bank].map(([id, e]) => ({ id, qty: e.qty, ms: e.ms })),
    spare,
    ms: result.weight,
    short,
  };
}

/**
 * A band's raid on a Folk's room or a depot (v13, Voyage's debts): what it takes toward `valueGp`. First GP from the
 * purse, then each side in the order given (haul, stock, town), the dearest stacks first by their sale value, whole
 * units only, never past `valueGp`: a unit worth more than what is still owed is skipped for cheaper ones. Stacks are
 * { id, qty, unit } (unit: one item's sale value in GP; worthless ones are never taken). Gear is never offered here.
 * { purse, moves: [{ side, id, qty }], gp } with gp the value taken (purse + items).
 */
export function raidPlan({ purseGp = 0, sides = [] } = {}, valueGp = 0) {
  let left = Number.isFinite(valueGp) ? Math.max(0, Math.floor(valueGp)) : 0;
  const purse = Math.min(left, Math.max(0, Math.floor(Number.isFinite(purseGp) ? purseGp : 0)));
  left -= purse;
  const moves = [];
  let items = 0;
  for (const { side, stacks } of sides) {
    const dearest = (stacks ?? [])
      .filter((s) => s.qty > 0 && s.unit > 0)
      .sort((a, b) => b.qty * b.unit - a.qty * a.unit || b.unit - a.unit);
    for (const s of dearest) {
      if (left <= 0) break;
      const qty = Math.min(s.qty, Math.floor(left / s.unit));
      if (qty <= 0) continue;
      moves.push({ side, id: s.id, qty });
      items += qty * s.unit;
      left -= qty * s.unit;
    }
  }
  return { purse, moves, gp: purse + items };
}
