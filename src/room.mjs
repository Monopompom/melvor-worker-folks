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
//
// Township Commissions (build .163): a Folk sent on a commission puts that item, whatever the bank's space, on its
// room's town side (commissions.mjs claims it); it is counted as made there too (`folkMade` with `town`, so Work
// Orders leave it out). Runs to town take it from there; what is left over moves to the haul side, and from there to
// the bank like anything else the room holds for you.
//
// The haul (API v10, slice C): another mod (Voyage) may answer, per Folk, where its goods go: 'bank' (all of the
// above) or 'room'. A Folk on 'room' keeps everything it makes in its room, bank space or not, and the currencies it
// earns in its purse; its inputs come only from its stock, whatever the own-stock switch says. With no space for the
// next action it stops "Haul full"; out of inputs it stops "Out of inputs"; either way its wages keep running (the
// haul's demanding rule; a Folk on the bank still pays only for work). Its goods reach the bank only through that
// mod: collect, emptyToBank, or the bank's own buffer once its answer turns to 'bank'. The answer is kept per Folk and
// asked again when it moves, when that mod calls refreshBankAccess and at a load. No hook: 'bank' for every Folk.

const CHECK_TICKS = 20;
const CAPE_SLOT = 'melvorD:Cape';

export function install(ctx, { getHiring, model, depotModel, resume, time, tips, log }) {
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
  /**
   * The haul (API v10): another mod's answer for where a Folk's goods go (`hiring.accessHook`, set by the API so it
   * holds in either load order), kept per Folk; none = 'bank'.
   */
  const access = new Map();
  /** Folks whose room changed since the last roomChanged event. */
  const changed = new Set();
  /** Dev: answers set by workerFolksDev.access(), ahead of the hook (testing depots without the other mod). */
  const devAccess = new Map();

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

  const BANK = Object.freeze({ access: 'bank', depot: null });
  /**
   * The haul's hook answer for this Folk now: { access: 'bank' | 'room', depot } (API v10; a depot id since round 3),
   * asked once, then kept until refreshAccess. A dev override (`devAccess`) answers first.
   */
  const answerOf = (folk) => {
    if (folk === undefined) return BANK;
    if (devAccess.has(folk.id)) return devAccess.get(folk.id);
    const hook = hiring?.accessHook;
    if (typeof hook !== 'function') return BANK;
    const kept = access.get(folk.id);
    if (kept !== undefined) return kept;
    let answer = BANK;
    try {
      answer = Object.freeze(model.normalizeAnswer(hook(folk)));
    } catch (err) {
      log('bank access hook failed', err);
    }
    access.set(folk.id, answer);
    return answer;
  };
  /** 'bank' or 'room' for this Folk now (API v10). */
  const accessOf = (folk) => answerOf(folk).access;
  const onHaul = (folk) => accessOf(folk) === 'room';
  /** The depot id this Folk's answer names (null: none), registered or not. */
  const depotIdOf = (folk) => answerOf(folk).depot;
  /** The registered depot a Folk on the haul shares now ({ id, name, room, capMs }), else undefined. */
  const depotOf = (folk) => {
    const id = folk?.room === undefined || !onHaul(folk) ? null : depotIdOf(folk);
    return id === null ? undefined : hiring?.depots?.roomFor(id);
  };
  const depotFree = (depot) => (depot === undefined ? undefined : Math.max(0, depot.capMs - model.usedMs(depot.room)));
  /** An input's count for a Folk's actions: its stock, plus its depot's stock (round 3). */
  const stockQty = (folk, id) => {
    const depot = depotOf(folk);
    return model.qtyOf(folk.room, id, 'stock') + (depot === undefined ? 0 : model.qtyOf(depot.room, id, 'stock'));
  };
  /** Takes its inputs from its stock: the own-stock switch, or away from a bank on the haul. */
  const usesStock = (folk) => folk !== undefined && folk.room !== undefined && (folk.ownStock === true || onHaul(folk));
  /**
   * Supply lines (round 3): a receiver not on its own stock takes its inputs from its stock (what its suppliers sent)
   * first, then your bank.
   */
  const isMixed = (folk) => folk !== undefined && folk.room !== undefined && !usesStock(folk) && hiring?.supply?.fed(folk) === true;
  const touch = (folk) => { if (folk !== undefined) changed.add(folk.id); };
  const emitChanged = (folk) => {
    changed.delete(folk.id);
    hiring.events.emit('roomChanged', { folk });
  };
  /** Asks the hook again for one Folk, or every Folk; a Folk whose answer changed gets a roomChanged. */
  const refreshAccess = (folk) => {
    if (hiring === undefined) return;
    const list = folk === undefined ? hiring.crew.all : [folk];
    list.forEach((f) => {
      const before = access.get(f.id);
      access.delete(f.id);
      const now = answerOf(f);
      if (before !== undefined && (before.access !== now.access || before.depot !== now.depot)) {
        blocked.delete(f.id);
        dry.delete(f.id);
        log(`room: ${f.name} now uses ${now.access === 'room' ? 'its room' : 'the bank'}${now.depot === null ? '' : ` and depot ${now.depot}`}`);
        emitChanged(f);
      }
    });
    hiring.renderQueue.folks = true;
  };

  /** Puts an item the bank can't take in the acting Folk's room; false only for a Folk with no room. */
  const hold = (acting, item, quantity) => {
    const folk = acting.folk;
    if (folk?.room === undefined) return false;
    // An action's work is charged once, to the first item it puts in the room.
    const charge = acting.roomCharged === true ? 0 : intervalOf(acting.skill);
    const haul = onHaul(folk);
    // A Folk sharing a depot (round 3): its own room first, then the depot; the whole action's goods go to one place.
    const depot = haul ? depotOf(folk) : undefined;
    if (acting.roomCharged !== true) {
      acting.roomTarget = depot === undefined
        ? (model.fits(folk.room, capOf(folk), charge) ? 'room' : 'over')
        : depotModel.target({ roomFreeMs: capOf(folk) - model.usedMs(folk.room), depotFreeMs: depotFree(depot), chargeMs: charge });
    }
    if (acting.roomTarget === 'depot' && depot !== undefined) {
      model.put(depot.room, item.id, quantity, charge);
      acting.roomCharged = true;
      blocked.delete(folk.id);
      hiring.depots.touched(depot.id);
      hiring.renderQueue.folks = true;
      return true;
    }
    const over = acting.roomTarget === 'over';
    model.put(folk.room, item.id, quantity, charge);
    acting.roomCharged = true;
    touch(folk);
    if (over || acting.roomOver === true) {
      // No space for this action's work: its items are kept all the same, and the Folk stops after it (acting.mjs
      // stops the timer the action would restart).
      acting.roomOver = true;
      if (acting.skill.isActive) acting.skill.stop();
      if (!blocked.has(folk.id)) {
        blocked.add(folk.id);
        notify(templateLangString(haul ? 'MOD_WF_HAUL_FULL_NOTICE' : 'MOD_WF_ROOM_FULL_NOTICE', { name: folk.name }));
        hiring.events.emit('roomFull', { folk });
        if (depot !== undefined) hiring.depots.full(depot.id);
      }
      hiring.renderQueue.folks = true;
      return true;
    }
    blocked.delete(folk.id);
    // On the haul every item waits in the room: no notice for that.
    if (haul) {
      hiring.renderQueue.folks = true;
      return true;
    }
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
  const itemTiles = (list, { lost = false, small = false } = {}) => `<div class="wf-item-grid${small ? ' wf-item-grid-sm' : ''}" data-no-skill-names>${list.map(({ id, qty, have }) => {
    const item = game.items.getObjectByID(id);
    const icon = item?.media ? `<img class="wf-item-tile-icon" src="${item.media}" alt="">` : '';
    const count = typeof formatNumber === 'function' ? formatNumber(qty) : numberWithCommas(qty);
    // `have` on an entry: the bank holds fewer than `qty`, the tile red and its tooltip saying how many (build .216).
    const short = have !== undefined;
    return `<div class="wf-item-tile${lost || short ? ' wf-item-tile-lost' : ''}" data-wf-item="${esc(id)}" data-wf-qty="${qty}"${short ? ` data-wf-have="${have}"` : ''}>${icon}<span class="wf-item-tile-count">${esc(count)}</span></div>`;
  }).join('')}</div>`;
  /** Each tile's tooltip under `root`: the item's own (name and icon), its exact count. */
  const tipTiles = (root) => {
    root?.querySelectorAll('[data-wf-item]').forEach((el) => {
      const item = game.items.getObjectByID(el.dataset.wfItem);
      const line = { item: item ?? undefined, text: `${item?.name ?? el.dataset.wfItem} ×${numberWithCommas(Number(el.dataset.wfQty))}` };
      const have = el.dataset.wfHave;
      tips?.set(el, have === undefined ? [line] : [line, { cls: 'text-danger', text: templateLangString('MOD_WF_RESTOCK_HAVE', { have: numberWithCommas(Number(have)) }) }]);
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
      ...sideList(folk, 'town'),
      ...sideList(folk, 'stock'),
    ]);
  };

  /** The purse to your currencies (outside any action, so nothing holds it again); returns [{ currencyId, amount }]. */
  const purseHome = (folk) => {
    const paid = [];
    model.takePurse(folk.room).forEach(({ id, amount }) => {
      const currency = game.currencies?.getObjectByID(id);
      // A currency no loaded mod registers stays in the purse: its mod may be back next load.
      if (currency === undefined) {
        model.putPurse(folk.room, id, amount);
        return;
      }
      currency.add(amount);
      paid.push({ currencyId: id, amount });
    });
    return paid;
  };

  /**
   * Moves a side's stacks (all, or `ids`) to the bank as far as it takes them, found as new: [{ itemId, qty }] moved,
   * and what stayed (a new kind with no free slot, or an item no loaded mod registers) in `left`.
   */
  const moveSide = (folk, side, ids, left) => {
    const moved = [];
    for (const { id } of model.entries(folk.room, side)) {
      if (ids !== undefined && !ids.includes(id)) continue;
      const item = game.items.getObjectByID(id);
      if (item === undefined || !bankTakes(game.bank, item)) {
        left.push({ itemId: id, qty: model.qtyOf(folk.room, id, side) });
        continue;
      }
      const { qty, ms } = model.take(folk.room, id, Infinity, side);
      if (game.bank.addItem(item, qty, false, true, false, game._isInOnlineLoop, `Skill.${hiring.id}`)) {
        moved.push({ itemId: id, qty });
        told.delete(`${folk.id}|${id}`);
      } else {
        model.put(folk.room, id, qty, ms, side);
        left.push({ itemId: id, qty });
      }
    }
    return moved;
  };

  /** After goods left the room: a "Haul full" or "Bank and room full" Folk with space again starts again. */
  const afterOut = (folk) => {
    if (model.usedMs(folk.room) >= capOf(folk)) return;
    const wasFull = blocked.delete(folk.id);
    if (wasFull) startAfterRestock(folk, hiring.skillOf(folk));
  };

  /**
   * collect (API v10): what the Folk made and its purse go to your bank and currencies, and, while its own-stock switch
   * is off, stock its current recipe can't use. { items, left, purse }.
   */
  const collect = (folk) => {
    if (folk?.room === undefined) return undefined;
    const left = [];
    const items = moveSide(folk, 'haul', undefined, left);
    if (folk.ownStock !== true && !model.isEmpty(folk.room, 'stock')) {
      const recipe = inputsOf(folk).perAction.map(({ id }) => id);
      const spare = model.leftoverIds(folk.room, recipe);
      if (spare.length > 0) items.push(...moveSide(folk, 'stock', spare, left));
    }
    const purse = purseHome(folk);
    if (items.length > 0 || purse.length > 0) {
      log(`room: collected ${items.length} kind(s) and ${purse.length} currency(ies) from ${folk.name}`);
      afterOut(folk);
      hiring.renderQueue.folks = true;
      // Only when something moved: a listener that collects on roomChanged must not loop on a stack the bank refuses.
      emitChanged(folk);
    }
    return Object.freeze({ items: Object.freeze(items), left: Object.freeze(left), purse: Object.freeze(purse) });
  };

  /**
   * emptyToBank (API v10): its haul and purse, and its stock unless its own-stock switch is on (`inputs` true: that
   * stock too). A commission's goods stay. { items, left, purse }.
   */
  const emptyToBank = (folk, { inputs = false } = {}) => {
    if (folk?.room === undefined) return undefined;
    const left = [];
    const items = moveSide(folk, 'haul', undefined, left);
    if (folk.ownStock !== true || inputs === true) items.push(...moveSide(folk, 'stock', undefined, left));
    const purse = purseHome(folk);
    if (items.length > 0 || purse.length > 0) {
      log(`room: emptied ${items.length} kind(s) from ${folk.name} to the bank`);
      afterOut(folk);
      hiring.renderQueue.folks = true;
      emitChanged(folk);
    }
    return Object.freeze({ items: Object.freeze(items), left: Object.freeze(left), purse: Object.freeze(purse) });
  };

  /** A Folk leaves the crew: its room goes to the bank as far as it has space; returns what was lost. */
  const leave = (folk) => {
    if (folk?.room !== undefined) purseHome(folk);
    if (folk?.room === undefined || (model.isEmpty(folk.room) && model.isEmpty(folk.room, 'stock') && model.isEmpty(folk.room, 'town'))) return [];
    const { kept, lost } = leaveSplit(folk, { gear: false });
    lost.push(...toBank(kept));
    folk.room = { haul: {}, stock: {}, town: {}, purse: {} };
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
  const isFull = (folk) => {
    if (folk?.room === undefined) return false;
    if (blocked.has(folk.id)) return true;
    if (model.isEmpty(folk.room) || model.usedMs(folk.room) < capOf(folk)) return false;
    const depot = depotOf(folk);
    return depot === undefined || depotFree(depot) <= 0;
  };

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
    if (!usesStock(folk)) return false;
    if (dry.has(folk.id)) return true;
    const skill = hiring.skillOf(folk);
    if (skill === undefined || hiring.delegated.has(skill)) return false;
    const { perAction } = inputsOf(folk);
    return perAction.length > 0 && !perAction.every(({ id, qty }) => stockQty(folk, id) >= qty);
  };
  const markDry = (folk) => {
    if (dry.has(folk.id)) return;
    dry.add(folk.id);
    hiring.renderQueue.folks = true;
    hiring.events.emit('roomDry', { folk });
    log(`room: ${folk.name} is out of inputs`);
  };

  /** The Folk whose stock the game's cost checks read now: the acting Folk working from its stock, or a start click's. */
  const stockFolk = () => {
    if (startFolk !== undefined) return startFolk;
    const folk = hiring?.acting?.folk;
    return usesStock(folk) || isMixed(folk) ? folk : undefined;
  };
  /** The Folk who would take this skill at a start click, when it works from its own stock. */
  const startingFolk = (skill) => {
    if (hiring === undefined) return undefined;
    const pending = hiring.pendingFor?.(skill);
    if (pending === null) return undefined;
    const folk = pending ?? (hiring.decideStart?.(skill) === 'delegate' ? hiring.crew.bySkill(skill.id) : undefined);
    return usesStock(folk) || isMixed(folk) ? folk : undefined;
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

  /** The auto-restock line in hours of stock, or null for off (Hiring 75, build .202). */
  const setRestockAt = (folk, hours) => {
    if (folk === undefined) return;
    const at = Number.isFinite(hours) && hours > 0 ? hours : null;
    if (folk.restockAt === at) return;
    folk.restockAt = at;
    hiring.renderQueue.folks = true;
    // Already under the new line: the next look refills it.
  };
  /** The card's switch: off to the line a quarter of the room down, on to off. */
  const toggleAutoRestock = (folk) => {
    if (folk === undefined) return;
    setRestockAt(folk, folk.restockAt === null ? model.defaultRestockAt(capOf(folk) / 3_600_000) : null);
  };
  /** "15 min", "1 h": a line in the auto-restock picker. */
  const lineText = (h) => (h < 1
    ? templateLangString('MOD_WF_AUTO_RESTOCK_MINUTES', { minutes: `${Math.round(h * 60)}` })
    : templateLangString('MOD_WF_AUTO_RESTOCK_HOURS', { hours: numberWithCommas(h) }));

  /**
   * Auto-restock (Hiring 75, build .202): a Folk on its own stock whose stock feeds fewer hours than its line fills its
   * room from your bank, quietly, as the card's Restock does; one its stock stopped starts again. Only while it works or
   * its stock stopped it: a Folk you stopped yourself waits for you. Never on the haul: no bank there.
   */
  const autoRestock = (folk) => {
    if (folk.ownStock !== true || folk.restockAt === null || hiring.levels?.autoRestock?.() !== true) return;
    const skill = hiring.skillOf(folk);
    if (skill === undefined || (!hiring.delegated.has(skill) && !dry.has(folk.id))) return;
    const { perAction, intervalMs } = inputsOf(folk);
    if (perAction.length === 0) return;
    if (!model.restockDue({ room: folk.room, atHours: folk.restockAt, capMs: capOf(folk), intervalMs })) return;
    restockResult(folk, Infinity, { quiet: true });
  };

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

  /**
   * Starts a Folk on its skill, when it would take it (never the player in its place): on `pick` (resume.mjs), else on
   * what the skill has selected. '' when it works now, else why not: 'noSkill' | 'busy' (the skill runs: the Folk, or
   * you) | 'unavailable' | 'refused' | 'noSlot' | 'notStarted' (nothing picked, or the game refused the start).
   */
  const startWorker = (folk, pick) => {
    const skill = folk === undefined ? undefined : hiring.skillOf(folk);
    if (skill === undefined) return 'noSkill';
    if (skill.isActive || hiring.delegated.has(skill)) return 'busy';
    if (!hiring.folkAvailable(folk)) return 'unavailable';
    if (hiring.workRefusal(folk, skill) !== '') return 'refused';
    if (hiring.decideStart?.(skill) !== 'delegate') return 'noSlot';
    try {
      // Cooking that never cooked starts through its Cook click, which picks the category; start() alone would throw.
      const cook = pick?.cook === undefined ? cookStandIn(skill) : undefined;
      asStart(folk, () => (cook === undefined ? resume.startAgain(skill, pick ?? resume.selectionOf(skill)) : skill.onActiveCookButtonClick(cook.category)));
    } catch (err) {
      log('start failed', err);
    }
    if (!hiring.delegated.has(skill) && skill.isActive && game.activeAction !== skill) {
      try { skill.stop(); } catch { skill.isActive = false; }
    }
    return hiring.delegated.has(skill) ? '' : 'notStarted';
  };
  /** Starts a restocked Folk again, when it would take the skill. */
  const startAfterRestock = (folk) => { startWorker(folk); };

  /**
   * Restock: the free room's worth of inputs from your bank, or at most `maxActions` actions' (the card's slider, build
   * .153), then the Folk starts again. { ok: true, actions, items: [{ itemId, qty }] } or { ok: false, why } (why
   * 'noStock' | 'noSkill' | 'noInputs' | 'noRoom' | 'noBank' | 'refused'). `quiet`: no notices (auto-restock). On the
   * haul the card's button asks the other mod's staff guard first ({ action: 'restock', folk }): it knows whether you
   * stand by the Folk; the API's own call is that mod's, so it is not asked (`guard` false).
   */
  const restockResult = (folk, maxActions = Infinity, { quiet = false, guard = true } = {}) => {
    if (!usesStock(folk)) return { ok: false, why: 'noStock' };
    const { skill, perAction, intervalMs } = inputsOf(folk);
    const fail = (why, key, vars = {}) => {
      if (!quiet && key !== undefined) game.notifications.createErrorNotification('worker_folks:restock', templateLangString(key, { name: folk.name, ...vars }));
      return { ok: false, why };
    };
    if (guard && onHaul(folk)) {
      const reason = hiring.refusal?.('staff', { action: 'restock', folk }) ?? '';
      if (reason !== '') {
        if (!quiet) game.notifications.createErrorNotification('worker_folks:restock', reason);
        return { ok: false, why: 'refused' };
      }
    }
    if (perAction.length === 0) return skill === undefined ? fail('noSkill', 'MOD_WF_RESTOCK_NO_SKILL') : fail('noInputs', 'MOD_WF_RESTOCK_NO_INPUTS', { skill: hiring.skillName(skill) });
    const item = (id) => game.items.getObjectByID(id);
    const plan = model.restockPlan({ perAction, intervalMs, freeMs: capOf(folk) - model.usedMs(folk.room), bankQty: (id) => game.bank.getQty(item(id)), maxActions });
    if (plan.actions === 0) return plan.short === null ? fail('noRoom', 'MOD_WF_RESTOCK_NO_ROOM') : fail('noBank', 'MOD_WF_RESTOCK_NO_BANK', { item: item(plan.short)?.name ?? plan.short });
    plan.items.forEach(({ id, qty, ms }) => {
      // false: an item keeps its charges on the way out of the bank, as gear does.
      game.bank.removeItemQuantity(item(id), qty, false);
      model.put(folk.room, id, qty, ms, 'stock');
    });
    dry.delete(folk.id);
    const hours = (plan.actions * intervalMs) / 3_600_000;
    if (!quiet) game.notifications.createSuccessNotification('worker_folks:restock', templateLangString('MOD_WF_RESTOCK_DONE', { name: folk.name, hours: hoursOf(hours), items: itemsText(plan.items) }), hiring.portrait?.(folk.tier));
    log(`room: ${folk.name} restocked ${plan.actions} actions (${hours.toFixed(2)} h)`);
    startAfterRestock(folk);
    hiring.renderQueue.folks = true;
    touch(folk);
    return { ok: true, actions: plan.actions, items: plan.items.map(({ id, qty }) => ({ itemId: id, qty })) };
  };
  /** The card's Restock: true when something was restocked. */
  const restock = (folk, maxActions = Infinity) => restockResult(folk, maxActions).ok;

  /**
   * restockPlan (API v10): what a Restock would take now. { items: [{ itemId, qty, have }], freeMs, actions, ms }
   * (ms: the work it adds). `bankQty` (this mod's Restock all) reads a bank that earlier Folks of the same bill
   * already took from.
   */
  const restockPlanOf = (folk, bankQty) => {
    if (folk?.room === undefined) return undefined;
    const { perAction, intervalMs } = inputsOf(folk);
    const freeMs = Math.max(0, capOf(folk) - model.usedMs(folk.room));
    const have = typeof bankQty === 'function' ? bankQty : (id) => game.bank.getQty(game.items.getObjectByID(id));
    const plan = model.restockPlan({ perAction, intervalMs, freeMs, bankQty: have });
    return Object.freeze({ items: Object.freeze(plan.items.map(({ id, qty }) => Object.freeze({ itemId: id, qty, have: have(id) }))), freeMs, actions: plan.actions, ms: plan.actions * intervalMs });
  };

  /** room (API v10): everything the room holds and its state, frozen; undefined for no Folk. */
  const roomOf = (folk) => {
    if (folk?.room === undefined) return undefined;
    const side = (s) => Object.freeze(model.entries(folk.room, s).map(({ id, qty, ms }) => Object.freeze({ itemId: id, qty, ms })));
    const full = isFull(folk);
    return Object.freeze({
      sizeMs: capOf(folk),
      usedMs: model.usedMs(folk.room),
      haul: side('haul'),
      stock: side('stock'),
      town: side('town'),
      purse: Object.freeze(model.purseEntries(folk.room).map(({ id, amount }) => Object.freeze({ currencyId: id, amount }))),
      state: model.stateOf({ full, dry: !full && isDry(folk) }),
      access: accessOf(folk),
      depot: depotOf(folk)?.id ?? null,
    });
  };

  /**
   * The card's Restock amount panel: what the room holds and its size in hours, the hours one action takes, how many
   * actions fit (`space`) and how many the bank covers within that (`bank`); and the cost line for `n` actions.
   * undefined while the Folk works from your bank or its skill takes no inputs.
   */
  const restockView = (folk) => {
    if (!usesStock(folk)) return undefined;
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
      // What `n` actions take (build .216): a short label, then the items as tiles; one the bank can't cover red.
      costLabel: (n) => templateLangString('MOD_WF_RESTOCK_COST', { hours: hoursOf((n * intervalMs) / 3_600_000) }),
      costTiles: (n) => itemTiles(perAction.map(({ id, qty }) => {
        const need = qty * n;
        const have = game.bank.getQty(game.items.getObjectByID(id));
        return have < need ? { id, qty: need, have } : { id, qty: need };
      }), { small: true }),
      tipTiles,
      bankText: plan.actions < space ? templateLangString('MOD_WF_RESTOCK_BANK_SHORT', { hours: hoursOf((plan.actions * intervalMs) / 3_600_000) }) : '',
    };
  };

  const tipLines = (folk, side, room = folk.room) => model.entries(room, side).map(({ id, qty }) => {
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
      const haul = onHaul(folk);
      const stockOn = usesStock(folk);
      const noStock = model.isEmpty(folk.room, 'stock');
      const noTown = model.isEmpty(folk.room, 'town');
      const purse = model.purseEntries(folk.room);
      // A supply line's receiver keeps its bar while fed, so the card doesn't jump as deliveries come and go.
      if (model.isEmpty(folk.room) && noStock && noTown && purse.length === 0 && !full && !stockOn && !haul && !isMixed(folk)) return undefined;
      const out = !full && isDry(folk);
      const fill = model.fillView(folk.room, capOf(folk));
      // Each part a short label, then its items; an empty part says so on its label's line (build .208).
      const lines = [];
      const part = (key, side) => {
        const items = tipLines(folk, side);
        lines.push(getLangString(items.length === 0 ? `${key}_EMPTY` : key), ...items);
      };
      if (stockOn || !noStock || isMixed(folk)) part('MOD_WF_ROOM_TIP_STOCK', 'stock');
      if (!noTown) lines.push(getLangString('MOD_WF_ROOM_TIP_TOWN'), ...tipLines(folk, 'town'));
      if (!model.isEmpty(folk.room) || (!stockOn && noTown) || haul) part(haul ? 'MOD_WF_ROOM_TIP_HAUL' : 'MOD_WF_ROOM_TIP', 'haul');
      if (purse.length > 0) lines.push(getLangString('MOD_WF_ROOM_TIP_PURSE'), ...purse.map(({ id, amount }) => {
        const currency = game.currencies?.getObjectByID(id);
        return { text: `${currency?.name ?? id} ×${numberWithCommas(Math.floor(amount))}` };
      }));
      const text = templateLangString('MOD_WF_CARD_ROOM', { used: hoursOf(fill.usedHours), cap: time.hoursText(fill.capHours) });
      // A shared depot (round 3): its own line and bar under the room's, its stacks in their tooltip.
      const shared = depotOf(folk);
      let depot;
      if (shared !== undefined) {
        const d = model.fillView(shared.room, shared.capMs);
        const name = shared.name || getLangString('MOD_WF_DEPOT');
        const stock = tipLines(folk, 'stock', shared.room);
        const haulLines = tipLines(folk, 'haul', shared.room);
        const tip = [templateLangString('MOD_WF_ROOM_TIP_DEPOT', { name })];
        if (stock.length > 0) tip.push(getLangString('MOD_WF_ROOM_TIP_DEPOT_STOCK'), ...stock);
        if (haulLines.length > 0) tip.push(getLangString('MOD_WF_ROOM_TIP_DEPOT_HAUL'), ...haulLines);
        if (stock.length === 0 && haulLines.length === 0) tip.push(getLangString('MOD_WF_ROOM_TIP_DEPOT_EMPTY'));
        depot = {
          text: templateLangString('MOD_WF_CARD_DEPOT', { name, used: hoursOf(d.usedHours), cap: time.hoursText(d.capHours) }),
          percent: d.percent,
          full: model.usedMs(shared.room) >= shared.capMs || hiring.depots.isFull(shared.id),
          tip,
        };
      }
      return {
        depot,
        percent: fill.percent,
        full,
        out,
        text,
        status: full ? getLangString(haul ? 'MOD_WF_CARD_HAUL_FULL' : 'MOD_WF_CARD_ROOM_FULL') : out ? getLangString('MOD_WF_CARD_ROOM_DRY') : '',
        why: full ? getLangString(haul ? 'MOD_WF_CARD_HAUL_FULL_WHY' : 'MOD_WF_CARD_ROOM_FULL_WHY') : out ? text : '',
        tip: lines,
        restock: stockOn ? { text: getLangString('MOD_WF_BUTTON_RESTOCK'), tip: [getLangString('MOD_WF_RESTOCK_TIP')], attention: out } : undefined,
      };
    },
    /**
     * The card's switch: on or off, its label and tooltip, and the line under it: while on, what switching off sends
     * home or loses; while off on a skill without inputs (gathering), why it can't be switched on.
     */
    ownStockView(folk) {
      if (folk !== undefined && onHaul(folk)) {
        return { on: true, disabled: true, text: getLangString('MOD_WF_SWITCH_OWN_STOCK'), tip: [getLangString('MOD_WF_OWN_STOCK_TIP')], note: getLangString('MOD_WF_OWN_STOCK_AWAY'), noteLost: false };
      }
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
    setRestockAt,
    toggleAutoRestock,
    /**
     * The card's Auto-restock switch, under Own stock once Hiring 75 unlocks it: on or off, its line and the lines that
     * fit the room. On the haul it shows greyed while on (it waits for a bank); undefined where it has nothing to do.
     */
    autoRestockView(folk) {
      if (folk === undefined || hiring.levels?.autoRestock?.() !== true) return undefined;
      const on = folk.restockAt !== null;
      const away = onHaul(folk);
      if (away ? !on : folk.ownStock !== true) return undefined;
      if (inputsOf(folk).perAction.length === 0) return undefined;
      const capHours = capOf(folk) / 3_600_000;
      const lines = model.restockAtOptions(capHours);
      // A line saved for a bigger room (a bag taken off) shows as the largest that still fits; the tick uses the saved one.
      const at = on ? (lines.includes(folk.restockAt) ? folk.restockAt : lines[lines.length - 1]) : model.defaultRestockAt(capHours);
      return {
        on,
        disabled: away,
        text: getLangString('MOD_WF_SWITCH_AUTO_RESTOCK'),
        sub: getLangString(away ? 'MOD_WF_AUTO_RESTOCK_AWAY' : on ? 'MOD_WF_AUTO_RESTOCK_ON' : 'MOD_WF_AUTO_RESTOCK_OFF'),
        tip: [getLangString('MOD_WF_AUTO_RESTOCK_TIP')],
        pickLabel: getLangString('MOD_WF_AUTO_RESTOCK_AT'),
        at,
        lines: lines.map((h) => ({ value: h, text: lineText(h) })),
      };
    },
    empty,
    accessOf,
    onHaul,
    refreshAccess,
    depotIdOf,
    depotOf,
    /** Folks sharing this depot now (their answer names it and they are on the haul). */
    membersOf: (depotId) => (hiring?.crew.all ?? []).filter((f) => f.room !== undefined && onHaul(f) && depotIdOf(f) === depotId),
    /**
     * After a depot changed (restocked, collected, emptied): its members stopped full or dry try again, as a Restock or
     * a collect starts a Folk.
     */
    wakeDepot(depotId) {
      api.membersOf(depotId).forEach((folk) => {
        const was = blocked.delete(folk.id) | dry.delete(folk.id);
        if (was && !isFull(folk) && !isDry(folk)) startWorker(folk);
        touch(folk);
      });
      hiring.renderQueue.folks = true;
    },
    /** Dev: answer for this Folk ahead of the hook (null: back to the hook). */
    setDevAccess(folk, answer) {
      if (folk === undefined) return;
      if (answer === null) devAccess.delete(folk.id);
      else devAccess.set(folk.id, Object.freeze(model.normalizeAnswer(answer)));
      blocked.delete(folk.id);
      dry.delete(folk.id);
      hiring.renderQueue.folks = true;
    },
    collect,
    emptyToBank,
    roomOf,
    restockPlanOf,
    restockResult,
    startFolk: startWorker,
    usesStock,
    /** How many of these items (a commission's) the room's town side holds. */
    townQty(folk, ids) {
      return folk?.room === undefined ? 0 : ids.reduce((sum, id) => sum + model.qtyOf(folk.room, id, 'town'), 0);
    },
    /** Takes up to `max` of these items off the town side (a run delivered them); returns how many. */
    takeTown(folk, ids, max) {
      if (folk?.room === undefined) return 0;
      let taken = 0;
      for (const id of ids) {
        if (taken >= max) break;
        taken += model.take(folk.room, id, max - taken, 'town').qty;
      }
      if (taken > 0) hiring.renderQueue.folks = true;
      return taken;
    },
    /** What the town side still holds goes over to what the room holds for you, and so to the bank. */
    townHome(folk) {
      if (folk?.room === undefined || model.isEmpty(folk.room, 'town')) return;
      model.entries(folk.room, 'town').forEach(({ id }) => {
        const { qty, ms } = model.take(folk.room, id, Infinity, 'town');
        model.put(folk.room, id, qty, ms);
      });
      hiring.renderQueue.folks = true;
    },
    /** The room's size and what it holds now, in ms of work. */
    capMs: (folk) => capOf(folk),
    /** One action's inputs for the Folk's recipe now, as the Folk: { skill, perAction: [{ id, qty }], intervalMs }. */
    inputsOf,
    isMixed,
    /** Puts a supply line's delivery on the receiver's stock side (the caller checked it fits). */
    putStock(folk, itemId, qty, ms) {
      if (folk?.room === undefined) return;
      model.put(folk.room, itemId, qty, ms, 'stock');
      touch(folk);
      hiring.renderQueue.folks = true;
    },
    /**
     * A receiver a delivery reached: stopped for want of inputs, it starts again once its stock and your bank cover an
     * action (as after a Restock).
     */
    wake(folk) {
      if (!dry.has(folk.id)) return;
      const skill = hiring.skillOf(folk);
      if (skill === undefined || hiring.delegated.has(skill)) return;
      const { perAction } = inputsOf(folk);
      const bankToo = !usesStock(folk);
      const covered = perAction.every(({ id, qty }) => model.qtyOf(folk.room, id, 'stock') + (bankToo ? game.bank.getQty(game.items.getObjectByID(id)) : 0) >= qty);
      if (!covered) return;
      dry.delete(folk.id);
      startWorker(folk);
    },
    usedMs: (folk) => (folk?.room === undefined ? 0 : model.usedMs(folk.room)),
  };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.room = api;
  });

  ctx.patch(Bank, 'addItem').replace(function (original, item, quantity, ...rest) {
    const acting = hiring?.acting;
    if (acting === undefined || item === undefined || !(quantity > 0)) return original(item, quantity, ...rest);
    // A commission's item goes to the room's town side, bank space or not.
    const folk = acting.folk;
    if (folk?.room !== undefined && Number.isInteger(quantity) && hiring.commissions?.claim(folk, item) !== undefined) {
      model.put(folk.room, item.id, quantity, acting.roomCharged === true ? 0 : intervalOf(acting.skill), 'town');
      acting.roomCharged = true;
      hiring.events.emit('folkMade', { folk, skill: acting.skill, item, quantity, held: true, town: true });
      hiring.renderQueue.folks = true;
      return true;
    }
    // A supply line: what the receiver's recipe uses goes into its stock as far as its room holds (src/supply.mjs).
    const sent = hiring.supply?.route(acting, item, quantity) ?? 0;
    if (sent > 0) {
      hiring.events.emit('folkMade', { folk, skill: acting.skill, item, quantity: sent, held: true, supplied: true });
      quantity -= sent;
      if (quantity <= 0) return true;
    }
    const ignoreSpace = rest[2] === true;
    const haul = folk?.room !== undefined && onHaul(folk);
    if (Number.isInteger(quantity) && (haul || (!ignoreSpace && !bankTakes(this, item))) && hold(acting, item, quantity)) {
      made(acting, item, quantity, true);
      return true;
    }
    const added = original(item, quantity, ...rest);
    if (added) made(acting, item, quantity, false);
    return added;
  });

  // The haul's purse: what a Folk on the haul earns waits there (Thieving's GP, Alt. Magic, other mods' currencies).
  if (typeof Currency === 'function' && typeof Currency.prototype.add === 'function') {
    ctx.patch(Currency, 'add').replace(function (original, amount, ...rest) {
      const folk = hiring?.acting?.folk;
      if (folk?.room === undefined || !(Number.isFinite(amount) && amount > 0) || !onHaul(folk)) return original(amount, ...rest);
      model.putPurse(folk.room, this.id, amount);
      touch(folk);
      hiring.renderQueue.folks = true;
      return undefined;
    });
  }

  // Own stock: a recipe's item costs read and spend the Folk's stock; its currency costs stay yours.
  ctx.patch(Costs, 'checkIfOwned').replace(function (original) {
    const folk = stockFolk();
    if (folk === undefined) return original();
    let owned = true;
    // A receiver of a supply line counts your bank too.
    const bankToo = !usesStock(folk);
    this._currencies.forEach((qty, currency) => { owned &&= currency.canAfford(qty); });
    this._items.forEach((qty, item) => { owned &&= stockQty(folk, item.id) + (bankToo ? game.bank.getQty(item) : 0) >= qty; });
    return owned;
  });
  ctx.patch(Costs, 'consumeCosts').replace(function (original) {
    const acting = hiring?.acting;
    const folk = acting?.folk;
    if (isMixed(folk)) {
      // A supply line's receiver: each input from its stock first, the rest from your bank through the game's own spending.
      const items = this._items;
      const fromBank = new Map();
      items.forEach((qty, item) => {
        const taken = qty > 0 ? model.take(folk.room, item.id, qty, 'stock').qty : 0;
        if (qty - taken > 0) fromBank.set(item, qty - taken);
      });
      this._items = fromBank;
      try {
        original();
      } finally {
        this._items = items;
      }
      touch(folk);
      hiring.renderQueue.folks = true;
      return undefined;
    }
    if (!usesStock(folk)) return original();
    // The game's own spending for the currencies, the items left out of it.
    const items = this._items;
    this._items = new Map();
    try {
      original();
    } finally {
      this._items = items;
    }
    let short = false;
    const depot = depotOf(folk);
    items.forEach((qty, item) => {
      if (qty <= 0) return;
      const own = model.take(folk.room, item.id, qty, 'stock').qty;
      // A Folk sharing a depot: what its stock lacks from the depot's (round 3).
      const shared = own < qty && depot !== undefined ? model.take(depot.room, item.id, qty - own, 'stock').qty : 0;
      if (shared > 0) hiring.depots.touched(depot.id);
      if (own + shared < qty) short = true;
    });
    touch(folk);
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
        // A supply line's receiver: the game's own message (its stock and your bank both fall short; no Restock).
        if (!usesStock(folk)) return notify(who, message, theme, ...rest);
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
      const fuel = this.activeRecipe.log;
      if (stockQty(folk, fuel.id) + (usesStock(folk) ? 0 : game.bank.getQty(fuel)) > 0) {
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
    hiring.crew.all.forEach((folk) => {
      const haul = onHaul(folk);
      // A Folk on the haul keeps its goods until collected: only the bank's own buffer empties on its own.
      if (!haul && !model.isEmpty(folk.room)) empty(folk);
      if (haul) standby(folk);
      else autoRestock(folk);
      if (changed.has(folk.id)) emitChanged(folk);
    });
  });

  /**
   * Standby wages (the haul, API v10): a Folk on the haul that its room stopped ("Haul full" or "Out of inputs") with its
   * skill still held pays its wage for the time it stands, a second at each look, through payroll's charge for time (a
   * run's). The stop is known for this session only: after a load such a Folk pays again once it has tried to work.
   */
  const standby = (folk) => {
    if (folk.skillId === null || folk.onStrike) return;
    const skill = hiring.skillOf(folk);
    if (skill === undefined || hiring.delegated.has(skill)) return;
    // Only a stop the room made (this session): a Folk you stopped yourself costs nothing.
    if (!blocked.has(folk.id) && !dry.has(folk.id)) return;
    hiring.payroll?.chargeTime?.(folk, skill, CHECK_TICKS * TICK_INTERVAL);
  };

  ctx.onCharacterLoaded(() => {
    blocked.clear();
    told.clear();
    dry.clear();
    access.clear();
    changed.clear();
    // A recipe skill out of inputs stops with the game's "not enough materials" toast; for a Folk working from its
    // own stock it says whose stock ran dry and that Restock fixes it, and the card shows "Out of inputs".
    const queue = game.combat?.notifications;
    if (queue !== undefined && typeof queue.add === 'function' && queue.add.wfRoom !== true) {
      const add = queue.add.bind(queue);
      queue.add = (n) => {
        const acting = hiring.acting;
        const folk = acting?.folk;
        if (isMixed(folk) && n?.type === 'Player' && n.args?.[0] === acting.skill && n.args?.[2] === 'danger') markDry(folk);
        if (usesStock(folk) && n?.type === 'Player' && n.args?.[0] === acting.skill && n.args?.[2] === 'danger') {
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
    // A Folk that moved may now stand by a bank, or away from one: ask the haul's hook again.
    hiring.events.on('folkMoved', ({ folk } = {}) => { if (folk !== undefined) refreshAccess(folk); });
    // A bag put on or taken off changes the room's size.
    hiring.events.on('loadoutChanged', () => { hiring.renderQueue.folks = true; });
    log('Folk rooms ready');
  });

  return api;
}
