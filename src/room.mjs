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
// The room's rules are in room-model.mjs, passed in from setup.mjs.

const CHECK_TICKS = 20;

export function install(ctx, { getHiring, model, time, tips, log }) {
  let hiring;
  /** Folks whose bank and room were both full at their last item: the card says so until the room has space. */
  const blocked = new Set();
  /** `folkId|itemId` already announced: one notice per kind of item until it reaches the bank. */
  const told = new Set();
  let ticks = 0;

  const capOf = (folk) => model.capacityMs(folk.tier);
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

  /**
   * What would reach the bank and what would be lost if the Folk left now: `{ kept, lost }`, each [{ id, qty }]. Its
   * gear goes first, then its room, biggest work first. A kind already in the bank (or going there) always fits; a
   * new kind needs a free slot; a room item no loaded mod registers is lost. `gear: false`: the room alone (its gear
   * already went back).
   */
  const leaveSplit = (folk, { gear = true } = {}) => {
    if (folk === undefined) return { kept: [], lost: [] };
    const list = [
      ...(gear ? (hiring.loadout?.items(folk) ?? []).map(({ item, qty }) => ({ id: item.id, qty })) : []),
      ...(folk.room === undefined ? [] : model.entries(folk.room).map(({ id, qty }) => ({ id, qty }))),
    ];
    const item = (id) => game.items.getObjectByID(id);
    return model.splitForBank(list, {
      freeSlots: game.bank.maximumSlots - game.bank.occupiedSlots,
      inBank: (id) => game.bank.items.has(item(id)),
      known: (id) => item(id) !== undefined,
    });
  };

  /** A Folk leaves the crew: its room goes to the bank as far as it has space; returns what was lost. */
  const leave = (folk) => {
    if (folk?.room === undefined || model.isEmpty(folk.room)) return [];
    const { kept, lost } = leaveSplit(folk, { gear: false });
    kept.forEach(({ id, qty }) => {
      model.take(folk.room, id);
      const ok = game.bank.addItem(game.items.getObjectByID(id), qty, false, true, false, game._isInOnlineLoop, `Skill.${hiring.id}`);
      if (!ok) lost.push({ id, qty });
    });
    folk.room = { haul: {} };
    forget(folk);
    log(`room: ${folk.name} left; ${kept.length} kind(s) to the bank, ${lost.length} lost`);
    return lost;
  };

  /** Moves what the bank can take now from a Folk's room to the bank. */
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
      if (model.isEmpty(folk.room)) forget(folk);
      else if (model.usedMs(folk.room) < capOf(folk)) blocked.delete(folk.id);
      hiring.renderQueue.folks = true;
      log(`room: ${folk.name} handed ${moved} kind(s) of item to the bank`);
    }
    return moved;
  };

  /** Bank and room full: the last action found no space, or (after a load, which forgets that) the room is at its size. */
  const isFull = (folk) => folk?.room !== undefined
    && (blocked.has(folk.id) || (!model.isEmpty(folk.room) && model.usedMs(folk.room) >= capOf(folk)));

  const api = {
    isFull,
    leaveSplit,
    itemsText,
    itemTiles,
    tipTiles,
    kindsText,
    /** What the room holds, biggest work first: [{ id, qty }], [] while empty. */
    heldList(folk) {
      return folk?.room === undefined ? [] : model.entries(folk.room).map(({ id, qty }) => ({ id, qty }));
    },
    /** The card's room band: undefined while the room is empty and nothing is wrong. */
    cardView(folk) {
      if (folk?.room === undefined) return undefined;
      const full = isFull(folk);
      if (model.isEmpty(folk.room) && !full) return undefined;
      const fill = model.fillView(folk.room, capOf(folk));
      // A few minutes of work read "<0.1", never "0.0".
      const used = fill.usedHours > 0 && fill.usedHours < 0.1 ? '<0.1' : time.hoursText(fill.usedHours);
      const lines = [getLangString('MOD_WF_ROOM_TIP')];
      model.entries(folk.room).forEach(({ id, qty }) => {
        const item = game.items.getObjectByID(id);
        lines.push({ item: item ?? undefined, text: `${item?.name ?? id} ×${numberWithCommas(qty)}` });
      });
      return {
        percent: fill.percent,
        full,
        text: templateLangString('MOD_WF_CARD_ROOM', { used, cap: time.hoursText(fill.capHours) }),
        status: full ? getLangString('MOD_WF_CARD_ROOM_FULL') : '',
        tip: lines,
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

  ctx.patch(Game, 'tick').after(function () {
    if (hiring === undefined || this.isGolbinRaid) return;
    ticks += 1;
    if (ticks % CHECK_TICKS !== 0) return;
    hiring.crew.all.forEach((folk) => { if (!model.isEmpty(folk.room)) empty(folk); });
  });

  ctx.onCharacterLoaded(() => {
    blocked.clear();
    told.clear();
    // The gear went back just before this event (hiring-skill.mjs returnLoadout); what it lost comes with the event.
    hiring.events.on('folkFired', ({ folk, reason, lost: gearLost = [] }) => {
      const lost = [...gearLost, ...leave(folk)];
      if (lost.length === 0) return;
      // A death's loss stays on its frozen slot's card; health.mjs froze the slot before this event.
      if (reason === 'died') hiring.crew.setLost(folk.slot, lost);
      notify(templateLangString('MOD_WF_ROOM_LOST_NOTICE', { name: folk.name, items: itemsText(lost) }));
    });
    log('Folk rooms ready');
  });

  return api;
}
