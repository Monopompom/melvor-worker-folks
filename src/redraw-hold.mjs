// Fewer redraws of the game's own displays while Folks work. Two of the game's draws follow every Folk action:
// - a wage paid from the bank changes the currency, and its draw searches the whole page for every amount shown
//   (over 100,000 elements) and redraws the tooltips;
// - each mastery level a Folk earns redraws the completion log's progress (the sidebar, the log's bars, class
//   changes made by selector over the page), though the log is rarely open.
// With many Folks these come several times a second, and each searches the page by selector. Held here, they draw
// at most every CURRENCY_HOLD_MS / COMPLETION_HOLD_MS while online: the wait keeps the game's own "needs a draw"
// marks, so the next draw shows everything; nothing is skipped for good. A change that is not the Folks' doing (a
// purchase, a sale, a reward) draws at once as before; the completion log draws at once while its page is open.
// Offline the game draws nothing, so nothing is held. Game-facing.
//
// The setting "Faster displays" (Hiring section, the same switch as the mastery bars) turns it off.

const CURRENCY_HOLD_MS = 500;
const COMPLETION_HOLD_MS = 1000;
const COMPLETION_PAGE = 'melvorD:CompletionLog';

export function install(ctx, { getHiring, log }) {
  const usable = typeof Currency === 'function' && typeof Currency.prototype.render === 'function'
    && typeof Currency.prototype.onAmountChange === 'function' && typeof Currency.prototype.remove === 'function';
  const completionUsable = typeof Completion === 'function' && typeof Completion.prototype.render === 'function';
  const section = ctx.settings.section('Hiring');
  const enabled = () => section.get('fastMasteryDisplays') !== false;
  const now = () => performance.now();

  // The lookups inside those draws: the currency's amounts and tooltips (`[data-currency-quantity="…"]`,
  // `[data-currency-tooltip="…"]`) and the completion log's percents (`$('.mastery-log-comp-percent')` and the like)
  // are found by selector over the whole page each time, 10 to 25 ms each with many Folks. These elements are made
  // with the page and hardly change, so inside these two draws only, the same selector is answered from a list kept
  // for CACHE_MS, read again when the open page changes or one of its elements has left the page.
  const CACHE_MS = 5000;
  const CACHED = /^(\[data-currency-(quantity|tooltip)="[^"\]]+"\]|\.[a-z]+-log-comp-percent)$/;
  const cache = new Map();
  const lookup = (selector, find) => {
    const hit = cache.get(selector);
    if (hit !== undefined && now() - hit.at < CACHE_MS && hit.page === game.openPage && hit.els.every((el) => el.isConnected)) return hit.els;
    const els = [...find(selector)];
    cache.set(selector, { els, at: now(), page: game.openPage });
    return els;
  };
  /** Runs `fn` with the page's selector lookups for CACHED selectors answered from the list above. */
  const withCachedLookups = (fn) => {
    const qsa = document.querySelectorAll;
    const ownQsa = Object.prototype.hasOwnProperty.call(document, 'querySelectorAll');
    const jq = window.$;
    document.querySelectorAll = function (selector) {
      return typeof selector === 'string' && CACHED.test(selector) ? lookup(selector, (s) => qsa.call(document, s)) : qsa.call(this, selector);
    };
    if (typeof jq === 'function') {
      const cached = function (selector, ...rest) {
        return rest.length === 0 && typeof selector === 'string' && CACHED.test(selector) ? jq(lookup(selector, (s) => qsa.call(document, s))) : jq.call(this, selector, ...rest);
      };
      Object.assign(cached, jq);
      window.$ = cached;
    }
    try {
      return fn();
    } finally {
      if (ownQsa) document.querySelectorAll = qsa;
      else delete document.querySelectorAll;
      if (typeof jq === 'function') window.$ = jq;
    }
  };

  /** Currencies changed by something other than a wage since their last draw. */
  const otherChange = new WeakSet();
  /** When each currency last drew. */
  const drawnAt = new WeakMap();
  let inWage = false;

  if (usable) {
    // A wage, or anything a Folk's own action pays or earns (Thieving's GP): Folks' doing, so its draw may wait.
    ctx.patch(Currency, 'onAmountChange').after(function () {
      const h = getHiring();
      // A Folk's turn as quiet-popups.mjs reads it: delegation's ticks, or an action run as a Folk.
      if (!inWage && h?.folkTurn !== true && h?.acting === undefined) otherChange.add(this);
    });
    ctx.patch(Currency, 'render').replace(function (original) {
      // Setting off: the game's own draw, lookups and all.
      if (!enabled()) return original();
      if (this.renderRequired && game._isInOnlineLoop && !otherChange.has(this)
        && now() - (drawnAt.get(this) ?? -Infinity) < CURRENCY_HOLD_MS) return undefined;
      if (!this.renderRequired) return original();
      otherChange.delete(this);
      drawnAt.set(this, now());
      return withCachedLookups(original);
    });
  } else {
    log('redraws: the game changed, currency draws are not held');
  }

  if (completionUsable) {
    let completionDrawnAt = -Infinity;
    ctx.patch(Completion, 'render').replace(function (original) {
      if (!enabled()) return original();
      if (game._isInOnlineLoop && game.openPage?.id !== COMPLETION_PAGE
        && now() - completionDrawnAt < COMPLETION_HOLD_MS) return undefined;
      completionDrawnAt = now();
      return withCachedLookups(original);
    });
  } else {
    log('redraws: the game changed, completion log draws are not held');
  }

  ctx.onModsLoaded(() => {
    const hiring = getHiring();
    /** Takes a wage from the bank; its draw may wait (see above). */
    hiring.payFromBank = (cur, amount) => {
      if (!usable) {
        cur.remove(amount);
        return;
      }
      inWage = true;
      try { cur.remove(amount); } finally { inWage = false; }
    };
  });
}
