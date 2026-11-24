// How much of the Hiring page's card grid a frame redraws. Pure: no game globals.

export const CARD_WORK_MS = 1000; // the least time between two card redraws that only work asked for
export const CARD_INPUT_MS = 1500; // for this long after a press or a key, a redraw waits for nothing
export const CARD_SWEEP_MS = 5000; // cards that only depend on someone else's work catch up this often
export const CARD_SWEEP_SIZE = 3; // a catch-up draws this many cards at a time, so it never holds up a frame
export const CARD_SWEEP_GAP_MS = 100; // the least time between two of those small draws

/**
 * 'all' redraws every card, 'sweep' starts a catch-up over all of them, 'some' only the marked ones, 'none' nothing.
 * `all`: something asked for every card (a press, a hire, a move). `marked`: how many cards have new work to show.
 * `stale`: something other cards may show has moved, so a catch-up is due at `nextSweep`.
 */
export function planCardDraw({ all, marked, stale, now, lastInput, nextDraw, nextSweep }) {
  if (!all && marked === 0 && !stale) return 'none';
  if (now < nextDraw && now - lastInput > CARD_INPUT_MS) return 'none';
  if (all) return 'all';
  if (stale && now >= nextSweep) return 'sweep';
  return marked > 0 ? 'some' : 'none';
}

/** The next few cards of a catch-up, and those still to come. Cards in `drawn` were just redrawn: they are skipped. */
export function nextSweepSlice(left, drawn = new Set(), size = CARD_SWEEP_SIZE) {
  const rest = left.filter((id) => !drawn.has(id));
  return { slice: rest.slice(0, size), left: rest.slice(size) };
}
