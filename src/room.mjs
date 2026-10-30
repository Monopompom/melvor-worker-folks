// A Folk's room on the game side (build .150): the full bank's buffer, and the one count of what a Folk makes.
//
// While a Folk acts (acting.mjs sets `hiring.acting`) every item its action gives goes through Bank.addItem, which
// makes that call the place to count it: `folkMade`, read by Made this session and Work Orders. An item the bank can't
// take (a new kind and no free slot) would be lost there, and the game stops the skill too unless its "Continue if
// bank full" setting is on. Such an item waits in the Folk's room instead and the call reports success, so the Folk
// works on. Once the room has no space for an action's work, that action's items still go in (past the room's size,
// never lost) and the Folk stops; the card says "Bank and room full". Held items go to the bank on their own as soon
// as it can take them (looked at once a second, offline too). A fired or dead Folk's gear, then its room, go to the
// bank as far as its free slots reach; the rest is lost with the Folk (build .151, the user: the bank never goes past
// its slots for a Folk that leaves). The Fire popup says first what would be lost; a death's loss is told in a notice,
// in Welcome Back and on the frozen slot's card.
//
// Own stock (build .152): a Folk set to "Work from its own stock" takes its recipe's inputs from its room only, never
// from your bank. Every recipe a Folk can run checks its inputs with Costs.checkIfOwned and spends them with
// Costs.consumeCosts (Crafting-style skills, Firemaking, Cooking's active recipe, Alt. Magic's item and rune costs,
// Summoning, Cartography's paper and maps), so those two read and spend the stock while such a Folk acts; currencies
// stay yours. The bank itself is left alone: inside a Folk's action the game also takes potions from it, which are not
// inputs. Starting is checked outside any action (the Create, Cook, Cast and Burn buttons), so those see the stock of
// the Folk who takes the skill. Out of inputs, the Folk stops with the game's own stop and the card says so; Restock fills
// the free room with the current recipe's inputs from your bank and starts it again. Switched off, its stock goes to
// the bank as far as there is space; the rest is lost, which the switch warns of beside it (the user's call).
// A bag in the Folk's Cape slot makes the room bigger. The room's rules are in room-model.mjs, passed in from setup.mjs.

const CHECK_TICKS = 20;
const CAPE_SLOT = 'melvorD:Cape';

export function install(ctx, { getHiring, model, resume, time, tips, log }) {
  let hiring;
  /** Folks whose bank and room were both full at their last item: the card says so until the room has space. */
  const blocked = new Set();
  /** `folkId|itemId` already announced: one notice per kind of item until it reaches the bank. */
  const told = new Set();
  /** Folks working from their own stock that stopped for want of inputs: until a Restock or a start. */
  const dry = new Set();
  /** The Folk whose stock a start button reads (the Create, Cast or Burn click), outside any action. */
  let startFolk;
  let ticks = 0;

  const capOf = (folk) => model.capacityMs(folk.tier, model.bagHours(folk.tier, folk.loadout?.[CAPE_SLOT]?.id));
  /** The work an action is worth: the timer that just ran (any skill has one, mod skills too), at least a tick. */
  const intervalOf = (skill) => {
    const timer = skill?.actionTimer;
    const ms = timer !== undefined && timer.maxTicks > 0 ? timer.maxTicks * TICK_INTERVAL : 0;
    return Math.max(TICK_INTERVAL, ms);
  };
  const bankTakes = (bank, item) => bank.items.has(item) || bank.occupiedSlots < bank.maximumSlots;
  const notify = (text) => {
    if (game._isInOnlineLoop) game.notifications.createErrorNotification('worker_folks:room', text);
  };
  const made = (acting, item, quantity, held) => {
    hiring.events.emit('folkMade', { folk: acting.folk, skill: acting.skill, item, quantity, held });
  };
  const forget = (folk) => {
    blocked.delete(folk.id);
    dry.delete(folk.id);
    told.forEach((key) => { if (key.startsWith(`${folk.id}|`)) told.delete(key); });
  };

  /** Puts an item the bank can't take in the acting Folk's room; false only for a Folk with no room. */
  const hold = (acting, item, quantity) => {
    const folk = acting.folk;
    if (folk?.room === undefined) return false;
    // An action's work is charged once, to the first item it puts in the room.
    const charge = acting.roomCharged === true ? 0 : intervalOf(acting.skill);
    const over = acting.roomCharged !== true && !model.fits(folk.room, capOf(folk), charge);
    model.put(folk.room, item.id, quantity, charge);
    acting.roomCharged = true;
    if (over || acting.roomOver === true) {
      // No space for this action's work: its items are kept all the same, and the Folk stops after it (acting.mjs
      // stops the timer the action would restart).
      acting.roomOver = true;
      if (acting.skill.isActive) acting.skill.stop();
      if (!blocked.has(folk.id)) {
        blocked.add(folk.id);
        notify(templateLangString('MOD_WF_ROOM_FULL_NOTICE', { name: folk.name }));
      }
      hiring.renderQueue.folks = true;
      return true;
    }
    blocked.delete(folk.id);
    const key = `${folk.id}|${item.id}`;
    if (!told.has(key)) {
      told.add(key);
      notify(templateLangString('MOD_WF_ROOM_HELD_NOTICE', { name: folk.name, item: item.name }));
    }
    hiring.renderQueue.folks = true;
    return true;
  };

  /** "2,989 Willow Logs, 1 Mastery Token" for [{ id, qty }]. */
  const itemsText = (list) => list.map(({ id, qty }) => `${numberWithCommas(qty)} ${game.items.getObjectByID(id)?.name ?? id}`).join(', ');
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  /** "17 kinds of item": Welcome Back's short form for a list (the user: a full gear set ran down the modal). */
  const kindsText = (list) => (list.length === 1 ? getLangString('MOD_WF_ITEM_KINDS_ONE') : templateLangString('MOD_WF_ITEM_KINDS', { count: numberWithCommas(list.length) }));
  /** Hours of work for a line of text: a few minutes read "<0.1", never "0.0". */
  const hoursOf = (hours) => (hours > 0 && hours < 0.1 ? '<0.1' : time.hoursText(hours));

  /**
   * The same list as tiles, the look of the bank and of Made this session: the item's icon, its count under it (the
   * game's short form, 1.2K), its tooltip set by `tipTiles` once the HTML is in the page. `lost`: a red frame and
   * count; `small`: a card's size.
   */
  const itemTiles = (list, { lost = false, small = false } = {}) => `<div class="wf-item-grid${small ? ' wf-item-grid-sm' : ''}" data-no-skill-names>${list.map(({ id, qty }) => {
    const item = game.items.getObjectByID(id);
    const icon = item?.media ? `<img class="wf-item-tile-icon" src="${item.media}" alt="">` : '';
    const count = typeof formatNumber === 'function' ? formatNumber(qty) : numberWithCommas(qty);
    return `<div class="wf-item-tile${lost ? ' wf-item-tile-lost' : ''}" data-wf-item="${esc(id)}" data-wf-qty="${qty}">${icon}<span class="wf-item-tile-count">${esc(count)}</span></div>`;
  }).join('')}</div>`;
  /** Each tile's tooltip under `root`: the item's own (name and icon), its exact count. */
  const tipTiles = (root) => {
    root?.querySelectorAll('[data-wf-item]').forEach((el) => {
      const item = game.items.getObjectByID(el.dataset.wfItem);
      tips?.set(el, [{ item: item ?? undefined, text: `${item?.name ?? el.dataset.wfItem} ×${numberWithCommas(Number(el.dataset.wfQty))}` }]);
    });
  };

  /** A list of items against the bank's free slots now: `{ kept, lost }` (room-model.mjs splitForBank). */
  const splitNow = (list) => {
    const item = (id) => game.items.getObjectByID(id);
    return model.splitForBank(list, {
      freeSlots: game.bank.maximumSlots - game.bank.occupiedSlots,
      inBank: (id) => game.bank.items.has(item(id)),
      known: (id) => item(id) !== undefined,
    });
  };
  const sideList = (folk, side) => (folk?.room === undefined ? [] : model.entries(folk.room, side).map(({ id, qty }) => ({ id, qty })));
  /** Puts a kept list in the bank; returns what it still refused. */
  const toBank = (kept) => kept.filter(({ id, qty }) => !game.bank.addItem(game.items.getObjectByID(id), qty, false, true, false, game._isInOnlineLoop, `Skill.${hiring.id}`));

  /**
   * What would reach the bank and what would be lost if the Folk left now: `{ kept, lost }`, each [{ id, qty }]. Its
   * gear goes first, then its room (what it made, then its stock), biggest work first. A kind already in the bank (or
   * going there) always fits; a new kind needs a free slot; a room item no loaded mod registers is lost. `gear: false`:
   * the room alone (its gear already went back).
   */
  const leaveSplit = (folk, { gear = true } = {}) => {
    if (folk === undefined) return { kept: [], lost: [] };
    return splitNow([
      ...(gear ? (hiring.loadout?.items(folk) ?? []).map(({ item, qty }) => ({ id: item.id, qty })) : []),
      ...sideList(folk, 'haul'),
      ...sideList(folk, 'stock'),
    ]);
  };

  /** A Folk leaves the crew: its room goes to the bank as far as it has space; returns what was lost. */
  const leave = (folk) => {
    if (folk?.room === undefined || (model.isEmpty(folk.room) && model.isEmpty(folk.room, 'stock'))) return [];
    const { kept, lost } = leaveSplit(folk, { gear: false });
    lost.push(...toBank(kept));
    folk.room = { haul: {}, stock: {} };
    forget(folk);
    log(`room: ${folk.name} left; ${kept.length} kind(s) to the bank, ${lost.length} lost`);
    return lost;
  };

  /** Moves what the bank can take now from a Folk's room (what it made; never its stock) to the bank. */
  const empty = (folk) => {
    if (folk?.room === undefined || model.isEmpty(folk.room)) return 0;
    let moved = 0;
    for (const { id } of model.entries(folk.room)) {
      const item = game.items.getObjectByID(id);
      // An item no loaded mod registers stays held: the mod that adds it may be back next load.
      if (item === undefined) continue;
      if (!bankTakes(game.bank, item)) continue;
      const { qty, ms } = model.take(folk.room, id);
      if (game.bank.addItem(item, qty, false, true, false, game._isInOnlineLoop, `Skill.${hiring.id}`)) {
        moved += 1;
        told.delete(`${folk.id}|${id}`);
      } else {
        model.put(folk.room, id, qty, ms);
      }
    }
    if (moved > 0) {
      if (model.isEmpty(folk.room)) {
        blocked.delete(folk.id);
        told.forEach((key) => { if (key.startsWith(`${folk.id}|`)) told.delete(key); });
      } else if (model.usedMs(folk.room) < capOf(folk)) blocked.delete(folk.id);
      hiring.renderQueue.folks = true;
      log(`room: ${folk.name} handed ${moved} kind(s) of item to the bank`);
    }
    return moved;
  };

  /** Bank and room full: the last action found no space, or (after a load, which forgets that) the room is at its size. */
  const isFull = (folk) => folk?.room !== undefined
    && (blocked.has(folk.id) || (!model.isEmpty(folk.room) && model.usedMs(folk.room) >= capOf(folk)));

  /**
   * Cooking before its first Cook click has no active category, so no current recipe: the first category's chosen
   * recipe (Fire, Furnace, Pot) stands in. Undefined for any other skill, and once a category is active.
   */
  const cookStandIn = (skill) => {
    if (!(skill?.selectedRecipes instanceof Map) || typeof skill.onActiveCookButtonClick !== 'function' || skill.activeCookingCategory !== undefined) return undefined;
    return skill.categories?.allObjects?.map((category) => skill.selectedRecipes.get(category)).find((recipe) => recipe !== undefined);
  };

  /**
   * One action's inputs for the Folk's skill now, as the Folk (its cost cuts apply): `{ skill, perAction, intervalMs }`,
   * perAction [{ id, qty }]. Alt. Magic's runes count with its item. No recipe, no inputs (gathering skills): [].
   */
  const inputsOf = (folk) => {
    const skill = folk === undefined ? undefined : hiring.skillOf(folk);
    const none = { skill, perAction: [], intervalMs: 0 };
    if (skill === undefined || typeof skill.getCurrentRecipeCosts !== 'function') return none;
    try {
      return hiring.asFolk(folk, skill, () => {
        const cook = cookStandIn(skill);
        const costs = (cook === undefined ? skill.getCurrentRecipeCosts() : skill.getRecipeCosts(cook)).clone();
        if (typeof skill.getCurrentRecipeRuneCosts === 'function') costs.addCosts(skill.getCurrentRecipeRuneCosts());
        const perAction = costs.getItemQuantityArray().filter(({ quantity }) => quantity > 0).map(({ item, quantity }) => ({ id: item.id, qty: quantity }));
        const interval = cook === undefined ? skill.actionInterval : skill.getRecipeCookingInterval(cook);
        return { skill, perAction, intervalMs: Number.isFinite(interval) && interval > 0 ? interval : intervalOf(skill) };
      });
    } catch {
      // A recipe skill with nothing selected has no costs to read.
      return none;
    }
  };

  /** Out of inputs: stopped for want of its own stock (this session), or (after a load) idle with a stock that falls short. */
  const isDry = (folk) => {
    if (folk?.ownStock !== true) return false;
    if (dry.has(folk.id)) return true;
    const skill = hiring.skillOf(folk);
    if (skill === undefined || hiring.delegated.has(skill)) return false;
    const { perAction } = inputsOf(folk);
    return perAction.length > 0 && !model.stockCovers(folk.room, perAction);
  };
  const markDry = (folk) => {
    if (dry.has(folk.id)) return;
    dry.add(folk.id);
    hiring.renderQueue.folks = true;
    log(`room: ${folk.name} is out of inputs`);
  };

  /** The Folk whose stock the game's cost checks read now: the acting Folk working from its stock, or a start click's. */
  const stockFolk = () => {
    if (startFolk !== undefined) return startFolk;
    const folk = hiring?.acting?.folk;
    return folk?.ownStock === true && folk.room !== undefined ? folk : undefined;
  };
  /** The Folk who would take this skill at a start click, when it works from its own stock. */
  const startingFolk = (skill) => {
    if (hiring === undefined) return undefined;
    const pending = hiring.pendingFor?.(skill);
    if (pending === null) return undefined;
    const folk = pending ?? (hiring.decideStart?.(skill) === 'delegate' ? hiring.crew.bySkill(skill.id) : undefined);
    return folk?.ownStock === true ? folk : undefined;
  };
  const asStart = (folk, fn) => {
    const outer = startFolk;
    startFolk = folk;
    try {
      return fn();
    } finally {
      startFolk = outer;
    }
  };

  /** The stock's items against the bank now: what switching off would send home and what it would lose. */
  const stockSplit = (folk) => splitNow(sideList(folk, 'stock'));

  /** "Work from its own stock" on or off. Off sends the stock to the bank; what finds no space is lost. */
  const setOwnStock = (folk, on) => {
    if (folk === undefined || folk.ownStock === on) return;
    folk.ownStock = on;
    dry.delete(folk.id);
    if (!on && !model.isEmpty(folk.room, 'stock')) {
      const { kept, lost } = stockSplit(folk);
      lost.push(...toBank(kept));
      folk.room.stock = {};
      if (lost.length > 0) game.notifications.createErrorNotification('worker_folks:stock', templateLangString('MOD_WF_STOCK_LOST_NOTICE', { name: folk.name, items: itemsText(lost) }));
      log(`room: ${folk.name} stock home; ${kept.length} kind(s) to the bank, ${lost.length} lost`);
    }
    hiring.renderQueue.folks = true;
  };

  /** Starts a restocked Folk again, when it would take the skill (never the player in its place). */
  const startAfterRestock = (folk, skill) => {
    if (skill === undefined || skill.isActive || hiring.delegated.has(skill)) return;
    if (!hiring.folkAvailable(folk) || hiring.workRefusal(folk, skill) !== '' || hiring.decideStart?.(skill) !== 'delegate') return;
    try {
      // Cooking that never cooked starts through its Cook click, which picks the category; start() alone would throw.
      const cook = cookStandIn(skill);
      asStart(folk, () => (cook === undefined ? resume.startAgain(skill, resume.selectionOf(skill)) : skill.onActiveCookButtonClick(cook.category)));
    } catch (err) {
      log('restock start failed', err);
    }
    if (!hiring.delegated.has(skill) && skill.isActive && game.activeAction !== skill) {
      try { skill.stop(); } catch { skill.isActive = false; }
    }
  };

  /** Restock: the free room filled with the current recipe's inputs from your bank, then the Folk starts again. */
  /** Restock: the free room's worth of inputs, or at most `maxActions` actions' (the card's slider, build .153). */
  const restock = (folk, maxActions = Infinity) => {
    if (folk?.ownStock !== true || folk.room === undefined) return false;
    const { skill, perAction, intervalMs } = inputsOf(folk);
    const fail = (key, vars = {}) => {
      game.notifications.createErrorNotification('worker_folks:restock', templateLangString(key, { name: folk.name, ...vars }));
      return false;
    };
    if (perAction.length === 0) return fail(skill === undefined ? 'MOD_WF_RESTOCK_NO_SKILL' : 'MOD_WF_RESTOCK_NO_INPUTS', { skill: skill === undefined ? '' : hiring.skillName(skill) });
    const item = (id) => game.items.getObjectByID(id);
    const plan = model.restockPlan({ perAction, intervalMs, freeMs: capOf(folk) - model.usedMs(folk.room), bankQty: (id) => game.bank.getQty(item(id)), maxActions });
    if (plan.actions === 0) return plan.short === null ? fail('MOD_WF_RESTOCK_NO_ROOM') : fail('MOD_WF_RESTOCK_NO_BANK', { item: item(plan.short)?.name ?? plan.short });
    plan.items.forEach(({ id, qty, ms }) => {
      // false: an item keeps its charges on the way out of the bank, as gear does.
      game.bank.removeItemQuantity(item(id), qty, false);
      model.put(folk.room, id, qty, ms, 'stock');
    });
    dry.delete(folk.id);
    const hours = (plan.actions * intervalMs) / 3_600_000;
    game.notifications.createSuccessNotification('worker_folks:restock', templateLangString('MOD_WF_RESTOCK_DONE', { name: folk.name, hours: hoursOf(hours), items: itemsText(plan.items) }), hiring.portrait?.(folk.tier));
    log(`room: ${folk.name} restocked ${plan.actions} actions (${hours.toFixed(2)} h)`);
    startAfterRestock(folk, skill);
    hiring.renderQueue.folks = true;
    return true;
  };

  /**
   * The card's Restock amount panel: what the room holds and its size in hours, the hours one action takes, how many
   * actions fit (`space`) and how many the bank covers within that (`bank`); and the cost line for `n` actions.
   * undefined while the Folk works from your bank or its skill takes no inputs.
   */
  const restockView = (folk) => {
    if (folk?.ownStock !== true || folk.room === undefined) return undefined;
    const { perAction, intervalMs } = inputsOf(folk);
    if (perAction.length === 0 || !(intervalMs > 0)) return undefined;
    const usedMs = model.usedMs(folk.room);
    const capMs = capOf(folk);
    const freeMs = Math.max(0, capMs - usedMs);
    const plan = model.restockPlan({ perAction, intervalMs, freeMs, bankQty: (id) => game.bank.getQty(game.items.getObjectByID(id)) });
    const space = Math.floor(freeMs / intervalMs);
    const hours = (n) => (usedMs + n * intervalMs) / 3_600_000;
    return {
      space,
      bank: plan.actions,
      hoursAt: (n) => hoursOf(hours(n)),
      nowText: hoursOf(usedMs / 3_600_000),
      fullText: time.hoursText(capMs / 3_600_000),
      percentAt: (n) => (capMs > 0 ? Math.min(100, ((n * intervalMs) / capMs) * 100) : 0),
      usedPercent: capMs > 0 ? Math.min(100, (usedMs / capMs) * 100) : 0,
      costText: (n) => templateLangString('MOD_WF_RESTOCK_COST', {
        hours: hoursOf((n * intervalMs) / 3_600_000),
        items: itemsText(perAction.map(({ id, qty }) => ({ id, qty: qty * n }))),
      }),
      bankText: plan.actions < space ? templateLangString('MOD_WF_RESTOCK_BANK_SHORT', { hours: hoursOf((plan.actions * intervalMs) / 3_600_000) }) : '',
    };
  };

  const tipLines = (folk, side) => model.entries(folk.room, side).map(({ id, qty }) => {
    const item = game.items.getObjectByID(id);
    return { item: item ?? undefined, text: `${item?.name ?? id} ×${numberWithCommas(qty)}` };
  });

  const api = {
    isFull,
    isDry,
    leaveSplit,
    itemsText,
    itemTiles,
    tipTiles,
    kindsText,
    setOwnStock,
    restock,
    restockView,
    /** The room's size in hours (its tier plus a bag in its Cape slot). */
    capHours: (folk) => capOf(folk) / 3_600_000,
    /** What the room holds for you (what it made), biggest work first: [{ id, qty }], [] while empty. */
    heldList(folk) {
      return sideList(folk, 'haul');
    },
    /**
     * The card's room meter: undefined while the room is empty, nothing is wrong and the Folk uses your bank. `status`
     * and `why` are the alert row's lines while bank and room are full or the stock is out.
     */
    cardView(folk) {
      if (folk?.room === undefined) return undefined;
      const full = isFull(folk);
      const stockOn = folk.ownStock === true;
      const noStock = model.isEmpty(folk.room, 'stock');
      if (model.isEmpty(folk.room) && noStock && !full && !stockOn) return undefined;
      const out = !full && isDry(folk);
      const fill = model.fillView(folk.room, capOf(folk));
      const lines = [];
      if (stockOn || !noStock) lines.push(getLangString('MOD_WF_ROOM_TIP_STOCK'), ...tipLines(folk, 'stock'));
      if (!model.isEmpty(folk.room) || !stockOn) lines.push(getLangString('MOD_WF_ROOM_TIP'), ...tipLines(folk, 'haul'));
      const text = templateLangString('MOD_WF_CARD_ROOM', { used: hoursOf(fill.usedHours), cap: time.hoursText(fill.capHours) });
      return {
        percent: fill.percent,
        full,
        out,
        text,
        status: full ? getLangString('MOD_WF_CARD_ROOM_FULL') : out ? getLangString('MOD_WF_CARD_ROOM_DRY') : '',
        why: full ? getLangString('MOD_WF_CARD_ROOM_FULL_WHY') : out ? text : '',
        tip: lines,
        restock: stockOn ? { text: getLangString('MOD_WF_BUTTON_RESTOCK'), tip: [getLangString('MOD_WF_RESTOCK_TIP')], attention: out } : undefined,
      };
    },
    /**
     * The card's switch: on or off, its label and tooltip, and the line under it: while on, what switching off sends
     * home or loses; while off on a skill without inputs (gathering), why it can't be switched on.
     */
    ownStockView(folk) {
      const on = folk?.ownStock === true;
      const lost = on ? stockSplit(folk).lost : [];
      const skill = folk === undefined ? undefined : hiring.skillOf(folk);
      const noInputs = !on && skill !== undefined && typeof skill.getCurrentRecipeCosts !== 'function';
      return {
        on,
        disabled: noInputs,
        text: getLangString('MOD_WF_SWITCH_OWN_STOCK'),
        tip: [getLangString('MOD_WF_OWN_STOCK_TIP')],
        note: on ? (lost.length > 0 ? templateLangString('MOD_WF_OWN_STOCK_NOTE_LOST', { items: kindsText(lost) }) : getLangString('MOD_WF_OWN_STOCK_NOTE'))
          : noInputs ? templateLangString('MOD_WF_OWN_STOCK_NO_INPUTS', { skill: hiring.skillName(skill) }) : '',
        noteLost: lost.length > 0,
      };
    },
    empty,
  };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.room = api;
  });

  ctx.patch(Bank, 'addItem').replace(function (original, item, quantity, ...rest) {
    const acting = hiring?.acting;
    if (acting === undefined || item === undefined || !(quantity > 0)) return original(item, quantity, ...rest);
    const ignoreSpace = rest[2] === true;
    if (!ignoreSpace && Number.isInteger(quantity) && !bankTakes(this, item) && hold(acting, item, quantity)) {
      made(acting, item, quantity, true);
      return true;
    }
    const added = original(item, quantity, ...rest);
    if (added) made(acting, item, quantity, false);
    return added;
  });

  // Own stock: a recipe's item costs read and spend the Folk's stock; its currency costs stay yours.
  ctx.patch(Costs, 'checkIfOwned').replace(function (original) {
    const folk = stockFolk();
    if (folk === undefined) return original();
    let owned = true;
    this._currencies.forEach((qty, currency) => { owned &&= currency.canAfford(qty); });
    this._items.forEach((qty, item) => { owned &&= model.qtyOf(folk.room, item.id, 'stock') >= qty; });
    return owned;
  });
  ctx.patch(Costs, 'consumeCosts').replace(function (original) {
    const acting = hiring?.acting;
    const folk = acting?.folk;
    if (folk?.ownStock !== true || folk.room === undefined) return original();
    // The game's own spending for the currencies, the items left out of it.
    const items = this._items;
    this._items = new Map();
    try {
      original();
    } finally {
      this._items = items;
    }
    let short = false;
    items.forEach((qty, item) => {
      if (qty > 0 && model.take(folk.room, item.id, qty, 'stock').qty < qty) short = true;
    });
    // Cartography's paper making never checks its logs before it spends them: a stock that falls short stops the Folk.
    if (short) {
      markDry(folk);
      if (acting.skill?.isActive) acting.skill.stop();
    }
    hiring.renderQueue.folks = true;
    return undefined;
  });

  // Start clicks are checked outside any action: they see the stock of the Folk who takes the skill. Their "not enough
  // materials" goes straight to the game's notifyPlayer (not the action queue above): for the duration of the click it
  // says whose stock is short instead, and the card shows "Out of inputs".
  const startButton = (Class, method) => {
    if (typeof Class === 'undefined' || typeof Class.prototype[method] !== 'function') return;
    ctx.patch(Class, method).replace(function (original, ...args) {
      const folk = startingFolk(this);
      if (folk === undefined) return original(...args);
      const skill = this;
      const notify = window.notifyPlayer;
      window.notifyPlayer = (who, message, theme, ...rest) => {
        if (who !== skill || theme !== 'danger' || (message !== skill.noCostsMessage && message !== skill.noRunesMessage)) return notify(who, message, theme, ...rest);
        markDry(folk);
        return notify(who, templateLangString('MOD_WF_DRY_NOTICE', { name: folk.name, skill: hiring.skillName(skill) }), theme, ...rest);
      };
      try {
        return asStart(folk, () => original(...args));
      } finally {
        window.notifyPlayer = notify;
      }
    });
  };
  startButton(ArtisanSkill, 'createButtonOnClick');
  if (typeof Cooking !== 'undefined') startButton(Cooking, 'onActiveCookButtonClick');
  if (typeof AltMagic !== 'undefined') startButton(AltMagic, 'castButtonOnClick');
  // Firemaking's Burn checks the bank for its log directly, not through Costs.
  if (typeof Firemaking !== 'undefined') {
    ctx.patch(Firemaking, 'burnLog').replace(function (original) {
      const folk = this.selectedRecipe === undefined ? undefined : startingFolk(this);
      if (folk === undefined) return original();
      if (model.qtyOf(folk.room, this.activeRecipe.log.id, 'stock') > 0) {
        asStart(folk, () => this.start());
        this.renderQueue.bonfireProgress = true;
        this.renderQueue.oilProgress = true;
      } else {
        notifyPlayer(this, templateLangString('MOD_WF_DRY_NOTICE', { name: folk.name, skill: hiring.skillName(this) }), 'danger');
      }
      return undefined;
    });
  }

  ctx.patch(Game, 'tick').after(function () {
    if (hiring === undefined || this.isGolbinRaid) return;
    ticks += 1;
    if (ticks % CHECK_TICKS !== 0) return;
    hiring.crew.all.forEach((folk) => { if (!model.isEmpty(folk.room)) empty(folk); });
  });

  ctx.onCharacterLoaded(() => {
    blocked.clear();
    told.clear();
    dry.clear();
    // A recipe skill out of inputs stops with the game's "not enough materials" toast; for a Folk working from its
    // own stock it says whose stock ran dry and that Restock fixes it, and the card shows "Out of inputs".
    const queue = game.combat?.notifications;
    if (queue !== undefined && typeof queue.add === 'function' && queue.add.wfRoom !== true) {
      const add = queue.add.bind(queue);
      queue.add = (n) => {
        const acting = hiring.acting;
        const folk = acting?.folk;
        if (folk?.ownStock === true && n?.type === 'Player' && n.args?.[0] === acting.skill && n.args?.[2] === 'danger') {
          markDry(folk);
          return add({ ...n, args: [n.args[0], templateLangString('MOD_WF_DRY_NOTICE', { name: folk.name, skill: hiring.skillName(acting.skill) }), n.args[2]] });
        }
        return add(n);
      };
      queue.add.wfRoom = true;
    }
    // The gear went back just before this event (hiring-skill.mjs returnLoadout); what it lost comes with the event.
    hiring.events.on('folkFired', ({ folk, reason, lost: gearLost = [] }) => {
      const lost = [...gearLost, ...leave(folk)];
      if (lost.length === 0) return;
      // A death's loss stays on its frozen slot's card; health.mjs froze the slot before this event.
      if (reason === 'died') hiring.crew.setLost(folk.slot, lost);
      notify(templateLangString('MOD_WF_ROOM_LOST_NOTICE', { name: folk.name, items: itemsText(lost) }));
    });
    hiring.events.on('folkStarted', ({ folk } = {}) => { if (folk !== undefined) dry.delete(folk.id); });
    // A bag put on or taken off changes the room's size.
    hiring.events.on('loadoutChanged', () => { hiring.renderQueue.folks = true; });
    log('Folk rooms ready');
  });

  return api;
}
