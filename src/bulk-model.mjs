// Stop all, Restart all, Restock all and Settle all on the Overview (build .218, joint order round 2): the rules that
// need no game. Pure: no DOM, no game globals (tests/bulk-model.test.mjs).

/**
 * What each button has to work on, from one plain row per Folk:
 * { working, hasSkill, available, onStrike, ownStock, onHaul }.
 * stop: Folks at work; restart: idle Folks with a skill that may work; restock: Folks on their own stock away from the
 * haul (the haul has no bank); settle: Folks on strike.
 */
export function counts(rows) {
  const c = { stop: 0, restart: 0, restock: 0, settle: 0 };
  for (const r of rows) {
    if (r.working) c.stop += 1;
    else if (r.hasSkill && r.available) c.restart += 1;
    if (r.ownStock && !r.onHaul) c.restock += 1;
    if (r.onStrike) c.settle += 1;
  }
  return c;
}

/** Lists of { id, qty } summed by id, in the order each id first comes. */
export function mergeItems(lists) {
  const total = new Map();
  for (const list of lists) {
    for (const { id, qty } of list) {
      if (!(qty > 0)) continue;
      total.set(id, (total.get(id) ?? 0) + qty);
    }
  }
  return [...total].map(([id, qty]) => ({ id, qty }));
}

/** A bank that a bill takes from as it goes: `qty(id)` is what is left once `take(id, n)` ran for earlier Folks. */
export function runningBank(bankQty) {
  const taken = new Map();
  return {
    qty: (id) => Math.max(0, bankQty(id) - (taken.get(id) ?? 0)),
    take: (id, n) => { taken.set(id, (taken.get(id) ?? 0) + n); },
  };
}

/**
 * Which settlements the wallet pays, in the order given: each candidate { key, parts: { currencyId: amount } } is
 * paid when what is left covers all its parts. { pay: [key], skip: [key], total: { currencyId: amount } }.
 */
export function payable(candidates, have) {
  const spent = {};
  const pay = [];
  const skip = [];
  for (const { key, parts } of candidates) {
    const entries = Object.entries(parts ?? {});
    if (entries.every(([id, amount]) => (spent[id] ?? 0) + amount <= have(id))) {
      entries.forEach(([id, amount]) => { spent[id] = (spent[id] ?? 0) + amount; });
      pay.push(key);
    } else {
      skip.push(key);
    }
  }
  return { pay, skip, total: spent };
}

/** Reasons a Folk was not started, counted: [[reason, [names]]], in the order each reason first comes. */
export function byReason(misses) {
  const groups = new Map();
  for (const { why, name } of misses) {
    if (!groups.has(why)) groups.set(why, []);
    groups.get(why).push(name);
  }
  return [...groups];
}
