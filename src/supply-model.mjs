// Supply lines (joint order round 3): a Folk sends what it makes straight to another Folk whose recipe uses it. The
// link is set on the supplier's card; each supplier feeds one receiver, and a receiver has at most one supplier per
// input item. The supplier's output goes into the receiver's room (its stock side), what doesn't fit to your bank; the
// receiver takes its inputs from that stock first, then from your bank. While one of its suppliers works, the receiver
// gets one tier's step of Produce Rate. Pure: no game globals.

/** Hiring level supply lines open at. */
export const UNLOCK_LEVEL = 60;
/** Produce Rate a receiver gains while at least one of its suppliers works (one tier's step). */
export const LINK_BONUS = 20;

/**
 * Who this supplier may feed now. `supplier`: { id, products: [itemIds] } (what its action makes). `folks`: every
 * other Folk as { id, inputs: [itemIds] (its recipe's inputs now) }. `links`: [{ supplierId, receiverId }] as set.
 * A receiver is open when one of its inputs is a product of this supplier and no other supplier feeds it that item.
 * Returns [{ id, items: [itemIds this supplier would send] }], in the crew's order.
 */
export function receivers(supplier, folks, links, productsOf = () => []) {
  const products = new Set(supplier?.products ?? []);
  if (products.size === 0) return [];
  return folks
    .filter((f) => f.id !== supplier.id)
    .map((f) => {
      // Items of its recipe another supplier already brings (that supplier's products now).
      const taken = new Set();
      links.forEach((l) => {
        if (l.receiverId !== f.id || l.supplierId === supplier.id) return;
        productsOf(l.supplierId).forEach((id) => taken.add(id));
      });
      const items = [...new Set(f.inputs ?? [])].filter((id) => products.has(id) && !taken.has(id));
      return { id: f.id, items };
    })
    .filter((r) => r.items.length > 0);
}

/**
 * The work one unit of an input is worth in the receiver's room: its share of an action, as Restock weighs it (each
 * input an even share of the action's time). `perAction`: [{ id, qty }], `intervalMs` the receiver's action time.
 * 0 for an item the recipe doesn't use.
 */
export function unitMs(perAction, intervalMs, itemId) {
  const inputs = (perAction ?? []).filter(({ qty }) => qty > 0);
  const entry = inputs.find(({ id }) => id === itemId);
  if (entry === undefined || !(intervalMs > 0)) return 0;
  return intervalMs / inputs.length / entry.qty;
}

/**
 * How much of a delivery goes into the receiver's room: as many units as its free room holds (`freeMs`), the rest to
 * your bank. { toRoom, toBank }.
 */
export function split(qty, freeMs, msPerUnit) {
  const n = Math.max(0, Math.floor(qty));
  if (n === 0) return { toRoom: 0, toBank: 0 };
  if (!(msPerUnit > 0)) return { toRoom: 0, toBank: n };
  const fits = Math.max(0, Math.floor(Math.max(0, freeMs) / msPerUnit));
  const toRoom = Math.min(n, fits);
  return { toRoom, toBank: n - toRoom };
}

/** An input taken from the stock first, the rest from your bank: { fromStock, fromBank }. */
export function draw(need, stockQty) {
  const n = Math.max(0, Math.floor(need));
  const fromStock = Math.min(n, Math.max(0, Math.floor(stockQty)));
  return { fromStock, fromBank: n - fromStock };
}

/** Whether stock and bank together cover an action's inputs: [{ id, qty }] against stock(id) and bank(id). */
export function covers(perAction, stockOf, bankOf) {
  return (perAction ?? []).every(({ id, qty }) => stockOf(id) + bankOf(id) >= qty);
}

/**
 * The receiver's Produce Rate bonus: LINK_BONUS while at least one Folk supplying it works. `links`:
 * [{ supplierId, receiverId }], `working(id)` whether that supplier works now.
 */
export function bonus(receiverId, links, working) {
  return links.some((l) => l.receiverId === receiverId && working(l.supplierId)) ? LINK_BONUS : 0;
}
