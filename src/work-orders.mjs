// Work Orders on the Hiring page: the board's clock, counting what Folks make, paying delivered orders and the board's
// block. Game-facing; the rules are in work-orders-model.mjs, passed in from setup.mjs.
//
// Counting: an item counts when a Folk's action makes it (`folkMade`, sent by room.mjs while `hiring.acting` is set,
// whether the item goes to the bank or waits in the Folk's room), so what you make yourself never does, and selling or using it later changes nothing. Wages: payroll pays each action
// right after it (`folkPaid` inside `folkActionDone`); that wage goes to the order the action delivered to. A failed
// action brings nothing but costs its wage: it goes to the order the same Folk delivered to last, until one of its
// actions brings something else (a Folk switched to another recipe stops paying into the order).
// The clock is our own tick count on Game.tick, so offline time counts (game.tickTimestamp doesn't move per tick
// during the offline catch-up).

const CONTAINER_ID = 'worker-folks-container';
export const BLOCK_ID = 'worker-folks-orders';
const GP_ID = 'melvorD:GP';

export function install(ctx, { getHiring, model, time, numbers, tips, popupDidRender, log }) {
  let hiring;
  let board = null;
  let seenLevel = -1;
  let paying = false;
  /** folk id → { matched: Set<order id>, added: boolean } for the action running now. */
  const actions = new Map();
  /** folk id → the order its last delivering action filled: a failed action's wage goes there. */
  const sticky = new Map();
  /** Orders finished during an action, paid once its wage is in (folkActionDone). */
  const due = [];
  let nextId = 0;
  const makeId = () => `wo${Date.now().toString(36)}${(nextId++).toString(36)}`;

  let dirty = true;
  let block = null;
  let grid = null;
  let clock = null;
  let rerollButton = null;
  let lastClockText = '';

  const level = () => hiring?.level ?? 0;
  const media = (path) => hiring.getMediaURL(path);
  const sizeIcon = (size) => media(`assets/work_order_${size.toLowerCase()}.webp`);
  const n = (v) => numberWithCommas(Math.floor(v));
  const markDirty = () => { dirty = true; };

  // ---- what can be asked for ------------------------------------------------------------------------------------

  const productsOf = (action) => {
    const items = [];
    if (action.product instanceof Item) items.push(action.product);
    // A cooked food's perfect version counts too; a potion's every tier (the tier follows the Folk's mastery).
    if (action.perfectCook instanceof Item) items.push(action.perfectCook);
    if (Array.isArray(action.potions)) action.potions.forEach((p) => { if (p instanceof Item) items.push(p); });
    return items;
  };
  const intervalOf = (skill, action) => {
    const own = Number(action.baseInterval);
    if (own > 0) return own;
    const lo = Number(action.baseMinInterval);
    const hi = Number(action.baseMaxInterval);
    if (lo > 0 && hi > 0) return (lo + hi) / 2;
    const base = Number(skill.baseInterval);
    return base > 0 ? base : 0;
  };
  const unlocked = (skill, action) => {
    try {
      if (typeof skill.isMasteryActionUnlocked === 'function' && !skill.isMasteryActionUnlocked(action)) return false;
      if (typeof skill.canMineOre === 'function' && !skill.canMineOre(action)) return false;
      if (typeof skill.isTreeUnlocked === 'function' && !skill.isTreeUnlocked(action)) return false;
      // A tablet needs its mark found first.
      if (typeof skill.getMarkLevel === 'function' && !(skill.getMarkLevel(action) > 0)) return false;
      // A fish in a secret area or one that needs a worn item isn't something to ask every player for.
      if (action.area !== undefined && (action.area.isSecret || action.area.requiredItem !== undefined)) return false;
      return true;
    } catch { return false; }
  };
  /** Recipes you have unlocked, on skills a Folk may work, in the normal realm (no Abyssal products for now). */
  const candidates = () => {
    const out = [];
    for (const skill of hiring.delegableSkills ?? []) {
      if (skill?.actions === undefined) continue;
      skill.actions.forEach((action) => {
        if (action.realm !== undefined && action.realm !== game.defaultRealm) return;
        const items = productsOf(action);
        if (items.length === 0 || !unlocked(skill, action)) return;
        const intervalMs = intervalOf(skill, action);
        if (!(intervalMs > 0)) return;
        out.push({
          skillId: skill.id,
          itemId: items[0].id,
          itemIds: items.map((i) => i.id),
          level: action.level ?? 0,
          intervalMs,
          perAction: Math.max(1, Number(action.baseQuantity) || 1),
        });
      });
    }
    return out;
  };
  const diplomaId = () => {
    const tier = hiring.highestLicence;
    return hiring.diplomaItem(tier === null || tier === undefined || tier === 'Newbie' ? 'Junior' : tier)?.id ?? null;
  };
  const rollOpts = () => ({
    candidates: candidates(),
    level: level(),
    makeId,
    diplomaId: diplomaId(),
    junkIds: (game.fishing?.junkItems ?? []).map((i) => i.id),
  });

  // ---- the board ---------------------------------------------------------------------------------------------------

  const ensureBoard = () => {
    if (board !== null || model.slotsFor(level()) === 0) return;
    board = model.createBoard();
    hiring.crew.board = board;
  };
  const fillNow = () => {
    ensureBoard();
    if (board === null) return;
    if (model.fill(board, rollOpts()).length > 0) markDirty();
  };
  const refreshNow = () => {
    if (board === null) return;
    const { expired } = model.refresh(board, rollOpts());
    expired.forEach((order) => hiring.events.emit('orderExpired', { order, offline: !game._isInOnlineLoop }));
    if (expired.length > 0 && game._isInOnlineLoop) {
      expired.forEach((order) => game.notifications.createErrorNotification('worker_folks:order', templateLangString('MOD_WF_ORDER_EXPIRED', { what: askText(order) })));
    }
    markDirty();
  };

  const itemOf = (id) => game.items.getObjectByID(id);
  const askText = (order) => templateLangString('MOD_WF_ORDER_ASK', { qty: n(order.qty), item: itemOf(order.itemId)?.name ?? order.itemId });
  const xpToNext = () => {
    const lv = level();
    try { return Math.max(0, exp.levelToXP(lv + 1) - exp.levelToXP(lv)); } catch { return 0; }
  };
  const wagesOn = () => hiring.payroll?.enabled !== false;
  const rewardOf = (order) => model.rewardFor(order, { xpToNext: xpToNext(), wagesOn: wagesOn() });

  const rewardParts = (r, order) => {
    const parts = [];
    if (r.gp > 0) parts.push(templateLangString('MOD_WF_ORDER_REWARD_GP', { gp: n(r.gp) }));
    parts.push(templateLangString('MOD_WF_ORDER_REWARD_XP', { xp: n(r.xp) }));
    if (r.tokens > 0) parts.push(r.tokens === 1 ? getLangString('MOD_WF_ORDER_REWARD_TOKEN') : templateLangString('MOD_WF_ORDER_REWARD_TOKENS', { count: `${r.tokens}` }));
    r.items.forEach(({ itemId, qty }) => parts.push(templateLangString('MOD_WF_ORDER_REWARD_ITEM', { qty: n(qty), item: itemOf(itemId)?.name ?? itemId })));
    if (r.gems > 0) parts.push(templateLangString('MOD_WF_ORDER_REWARD_GEMS', { count: `${r.gems}` }));
    return parts;
  };

  /** Pays a delivered order: GP, Hiring XP, tokens and items, shown even with Folks' gain popups hidden. */
  const payout = (order) => {
    const r = rewardOf(order);
    const turn = hiring.folkTurn;
    paying = true;
    hiring.folkTurn = false;
    try {
      if (r.gp > 0) game.gp.add(r.gp);
      hiring.addXP(r.xp);
      const token = hiring.masteryTokens?.get(game.defaultRealm)?.[0];
      if (r.tokens > 0 && token !== undefined) game.bank.addItem(token, r.tokens, true, true, true, true, `Skill.${hiring.id}`);
      r.items.forEach(({ itemId, qty }) => {
        const item = itemOf(itemId);
        if (item !== undefined) game.bank.addItem(item, qty, true, true, true, true, `Skill.${hiring.id}`);
      });
      if (r.gems > 0 && game.randomGemTable !== undefined) {
        const gems = new Map();
        for (let i = 0; i < r.gems; i += 1) {
          const { item, quantity } = game.randomGemTable.getDrop();
          gems.set(item, (gems.get(item) ?? 0) + quantity);
        }
        gems.forEach((qty, item) => game.bank.addItem(item, qty, true, true, true, true, `Skill.${hiring.id}`));
      }
    } finally {
      paying = false;
      hiring.folkTurn = turn;
    }
    order.paid = { gp: r.gp, xp: r.xp };
    const text = templateLangString('MOD_WF_ORDER_DELIVERED', { what: askText(order), rewards: rewardParts(r, order).join(', ') });
    if (game._isInOnlineLoop) game.notifications.createSuccessNotification('worker_folks:order', text, sizeIcon(order.size));
    hiring.events.emit('orderDelivered', { order, reward: r, text, offline: !game._isInOnlineLoop });
    log(`work order delivered: ${order.id} ${order.itemId} ×${order.qty}`, r);
    markDirty();
  };

  // ---- counting ------------------------------------------------------------------------------------------------------

  const onMade = ({ folk, item, quantity }) => {
    if (paying || folk === undefined || board === null || item === undefined) return;
    const folkId = folk.id;
    let a = actions.get(folkId);
    if (a === undefined) { a = { matched: new Set(), added: false }; actions.set(folkId, a); }
    a.added = true;
    const order = model.orderFor(board, item.id);
    if (order === undefined) return;
    const { added: counted, done } = model.deliver(order, quantity);
    if (counted > 0) {
      a.matched.add(order.id);
      markDirty();
    }
    if (done) due.push(order);
  };

  const onPaid = ({ folk, currencyId, amount }) => {
    if (board === null || currencyId !== GP_ID || !(amount > 0) || folk === undefined) return;
    const a = actions.get(folk.id);
    let ids = a?.matched.size > 0 ? [...a.matched] : [];
    // A failed action: its wage goes to the order this Folk was filling.
    if (ids.length === 0 && a?.added !== true && sticky.has(folk.id)) ids = [sticky.get(folk.id)];
    if (ids.length === 0) return;
    const share = amount / ids.length;
    ids.forEach((id) => {
      const order = board.orders.find((o) => o.id === id);
      if (order !== undefined) order.wages += share;
    });
    markDirty();
  };

  const onActionDone = ({ folk }) => {
    if (folk !== undefined) {
      const a = actions.get(folk.id);
      if (a?.matched.size > 0) sticky.set(folk.id, [...a.matched][a.matched.size - 1]);
      else if (a?.added === true) sticky.delete(folk.id);
      actions.delete(folk.id);
      const s = sticky.get(folk.id);
      if (s !== undefined && !board?.orders.some((o) => o.id === s && o.state === 'open')) sticky.delete(folk.id);
    }
    while (due.length > 0) payout(due.shift());
  };

  // ---- the clock ---------------------------------------------------------------------------------------------------

  ctx.patch(Game, 'tick').after(function () {
    if (hiring === undefined || this.isGolbinRaid) return;
    const lv = level();
    if (lv !== seenLevel) {
      seenLevel = lv;
      fillNow();
    }
    if (board === null) return;
    if (model.advance(board)) refreshNow();
  });

  // ---- the block ---------------------------------------------------------------------------------------------------

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const img = (src, cls) => {
    const i = el('img', cls);
    i.src = src ?? '';
    i.alt = '';
    return i;
  };

  const openHelp = () => {
    const body = el('div', 'text-center wf-help-body');
    for (const k of [1, 2, 3]) {
      const b = el('div', 'wf-band');
      b.append(el('div', 'wf-help-head', getLangString(`MOD_WF_ORDERS_HELP_${k}_HEAD`)));
      getLangString(`MOD_WF_ORDERS_HELP_${k}`).split(/(?<=[.!?])\s+/).filter(Boolean).forEach((line) => b.append(el('p', 'wf-help-p', line)));
      body.append(b);
    }
    const cls = { popup: 'wf-ui', confirmButton: 'btn btn-success m-1' };
    SwalLocale.fire({
      didRender: popupDidRender,
      title: getLangString('MOD_WF_ORDERS_TITLE'),
      width: '38rem',
      html: body,
      confirmButtonText: getLangString('MOD_WF_BUTTON_GOT_IT'),
      customClass: typeof createSwalCustomClass === 'function' ? createSwalCustomClass(cls) : cls,
    });
  };

  const openReroll = () => {
    if (board === null || !model.rerollUnlocked(level())) return;
    const short = game.gp.amount < model.REROLL_COST;
    const none = !model.canReroll(board);
    const fee = `<img class="skill-icon-xs mr-1" src="${game.gp.media}" alt="GP"><span class="font-w600 ${short ? 'text-danger' : 'text-warning'}">${n(model.REROLL_COST)}</span>`;
    const band = `<div class="wf-band text-left mt-2"><span class="${short ? 'text-danger' : 'text-success'}">${short ? '✗' : '✓'}</span> ${templateLangString('MOD_WF_ORDERS_REROLL_COST', { cost: fee })}</div>`;
    const why = none ? getLangString('MOD_WF_ORDERS_REROLL_NONE') : short ? templateLangString('MOD_WF_ORDERS_REROLL_SHORT', { cost: n(model.REROLL_COST) }) : '';
    const cls = { popup: 'wf-ui', confirmButton: 'btn btn-warning m-1' };
    SwalLocale.fire({
      didRender: popupDidRender,
      title: getLangString('MOD_WF_ORDERS_REROLL_TITLE'),
      html: `<div class="text-center">${getLangString('MOD_WF_ORDERS_REROLL_TEXT')}</div>${band}${why === '' ? '' : `<div class="text-danger mt-2">${why}</div>`}`,
      imageUrl: media('assets/work_order_board.webp'),
      imageWidth: 64,
      imageHeight: 64,
      imageAlt: '',
      showCancelButton: true,
      focusCancel: why !== '',
      confirmButtonText: getLangString('MOD_WF_ORDERS_REROLL'),
      customClass: typeof createSwalCustomClass === 'function' ? createSwalCustomClass(cls) : cls,
      didOpen: () => { if (why !== '') { const b = Swal.getConfirmButton(); if (b) b.disabled = true; } },
    }).then((result) => {
      if (!result.isConfirmed || board === null) return;
      // Asked again: the GP or the board may have changed while the popup was open.
      if (game.gp.amount < model.REROLL_COST || !model.canReroll(board)) {
        game.notifications.createErrorNotification('worker_folks:order', !model.canReroll(board) ? getLangString('MOD_WF_ORDERS_REROLL_NONE') : templateLangString('MOD_WF_ORDERS_REROLL_SHORT', { cost: n(model.REROLL_COST) }));
        return;
      }
      game.gp.remove(model.REROLL_COST);
      model.reroll(board, rollOpts());
      markDirty();
    });
  };

  const wire = () => {
    if (block !== null) return;
    const column = document.getElementById(CONTAINER_ID)?.querySelector('[data-wf="blocks"]');
    if (column === undefined || column === null) return;
    block = el('div', 'block block-rounded border-top border-worker-folks border-4x');
    block.id = BLOCK_ID;
    const content = el('div', 'block-content wf-dash-content');
    // Title row as the Overview's: icon, title, "?"; right side the refresh clock and the reroll. layout.mjs adds the
    // fold caret and the grip.
    const head = el('div', 'd-flex align-items-center flex-wrap mb-3 wf-dash-title');
    head.append(img(media('assets/work_order_board.webp'), 'skill-icon-sm mr-2'));
    head.append(el('h5', 'font-w600 mb-0', getLangString('MOD_WF_ORDERS_TITLE')));
    const help = el('button', 'btn btn-sm wf-help');
    help.type = 'button';
    help.setAttribute('aria-label', getLangString('MOD_WF_HELP_LABEL_orders'));
    const q = el('i', 'fa fa-question-circle');
    q.setAttribute('aria-hidden', 'true');
    help.append(q);
    help.addEventListener('click', openHelp);
    head.append(help);
    const right = el('div', 'ml-auto d-flex align-items-center wf-dash-right');
    clock = el('span', 'wf-subtle wf-orders-clock');
    rerollButton = el('button', 'btn btn-sm btn-outline-warning d-none', getLangString('MOD_WF_ORDERS_REROLL'));
    rerollButton.type = 'button';
    rerollButton.addEventListener('click', openReroll);
    tips?.set(rerollButton, templateLangString('MOD_WF_ORDERS_REROLL_TIP', { cost: n(model.REROLL_COST) }));
    right.append(clock, rerollButton);
    head.append(right);
    grid = el('div', 'wf-orders-grid');
    content.append(head, grid);
    block.append(content);
    column.append(block);
    markDirty();
  };

  const orderCard = (order) => {
    const done = order.state === 'done';
    const card = el('div', `wf-band wf-order${done ? ' wf-order-done' : ''}`);
    const top = el('div', 'd-flex align-items-center wf-order-head');
    top.append(img(sizeIcon(order.size), 'wf-order-icon mr-2'));
    const who = el('div', 'wf-min0 flex-fill');
    who.append(el('div', 'font-w600', getLangString(`MOD_WF_ORDER_SIZE_${order.size}`)));
    const skill = game.skills.getObjectByID(order.skillId);
    const skillLine = el('small', 'wf-subtle d-flex align-items-center');
    if (skill !== undefined) skillLine.append(img(skill.media, 'skill-icon-xs mr-1'), document.createTextNode(hiring.skillName(skill)));
    who.append(skillLine);
    top.append(who);
    const badge = el('span', `badge ${done ? 'badge-success' : order.aged > 0 ? 'badge-warning' : 'badge-info'} wf-order-state`,
      getLangString(done ? 'MOD_WF_ORDER_DONE' : order.aged > 0 ? 'MOD_WF_ORDER_LAST_DAY' : 'MOD_WF_ORDER_OPEN'));
    top.append(badge);
    if (order.aged > 0 && !done) tips?.set(badge, getLangString('MOD_WF_ORDER_LAST_DAY_TIP'));
    card.append(top);

    const ask = el('div', 'd-flex align-items-center mt-2 font-w600');
    const item = itemOf(order.itemId);
    ask.append(img(item?.media, 'skill-icon-xs mr-1'), document.createTextNode(askText(order)));
    card.append(ask);
    const bar = el('div', 'progress wf-order-bar mt-2');
    const fillBar = el('div', `progress-bar ${done ? 'bg-success' : 'bg-info'}`);
    fillBar.setAttribute('role', 'progressbar');
    fillBar.style.width = `${Math.min(100, (order.delivered / order.qty) * 100)}%`;
    bar.append(fillBar);
    card.append(bar);
    card.append(el('small', 'd-block text-center', templateLangString('MOD_WF_ORDER_PROGRESS', { done: n(order.delivered), qty: n(order.qty) })));

    // A delivered order shows what it paid; an open one what it would pay at today's level.
    const r = done && order.paid !== null ? { ...rewardOf(order), ...order.paid } : rewardOf(order);
    const list = el('div', 'wf-order-rewards mt-2');
    const line = (icon, text, cls = '') => {
      const row = el('div', `d-flex align-items-center wf-order-reward ${cls}`);
      row.append(img(icon, 'skill-icon-xs mr-1'), el('span', '', text));
      list.append(row);
    };
    if (done && order.paid !== null) line(game.gp.media, templateLangString('MOD_WF_ORDER_GP_PAID', { rate: numberWithCommas(order.gpRate), gp: numbers.shortNumber(order.paid.gp) }));
    else if (wagesOn()) line(game.gp.media, templateLangString('MOD_WF_ORDER_GP', { rate: numberWithCommas(order.gpRate), gp: numbers.shortNumber(order.wages * order.gpRate) }));
    line(hiring.media, templateLangString('MOD_WF_ORDER_REWARD_XP', { xp: n(r.xp) }));
    const token = hiring.masteryTokens?.get(game.defaultRealm)?.[0];
    if (r.tokens > 0) line(token?.media, r.tokens === 1 ? getLangString('MOD_WF_ORDER_REWARD_TOKEN') : templateLangString('MOD_WF_ORDER_REWARD_TOKENS', { count: `${r.tokens}` }));
    r.items.forEach(({ itemId, qty }) => line(itemOf(itemId)?.media, templateLangString('MOD_WF_ORDER_REWARD_ITEM', { qty: n(qty), item: itemOf(itemId)?.name ?? itemId })));
    if (r.gems > 0) line(game.randomGemTable?.sortedDropsArray?.[0]?.item?.media, templateLangString('MOD_WF_ORDER_REWARD_GEMS', { count: `${r.gems}` }));
    card.append(list);
    return card;
  };

  const viewKey = () => JSON.stringify({
    lv: level(),
    wages: wagesOn(),
    orders: board?.orders.map((o) => [o.id, o.delivered, o.state, o.aged, Math.floor(o.wages)]) ?? null,
  });
  let shownKey = '';

  const drawBoard = () => {
    const nodes = [];
    const slots = model.slotsFor(level());
    if (slots === 0 || board === null) {
      nodes.push(el('div', 'wf-band wf-orders-locked', templateLangString('MOD_WF_ORDERS_LOCKED', { level: `${model.BOARD_LEVEL}` })));
    } else {
      board.orders.forEach((o) => nodes.push(orderCard(o)));
      for (let i = board.orders.length; i < slots; i += 1) nodes.push(el('div', 'wf-band wf-order wf-order-empty wf-subtle', getLangString('MOD_WF_ORDER_EMPTY')));
    }
    grid.replaceChildren(...nodes);
    tips?.sweep?.();
  };

  const drawClock = () => {
    const on = board !== null && model.slotsFor(level()) > 0;
    const text = on ? templateLangString('MOD_WF_ORDERS_REFRESH', { time: time.shortTime(model.ticksLeft(board) * TICK_INTERVAL) }) : '';
    if (text !== lastClockText) {
      clock.textContent = text;
      lastClockText = text;
    }
    rerollButton.classList.toggle('d-none', !(on && model.rerollUnlocked(level())));
  };

  let lastDraw = 0;
  const render = () => {
    if (hiring === undefined || grid === null) return;
    if (document.getElementById(CONTAINER_ID)?.classList.contains('d-none')) return; // drawn when the page shows
    const now = Date.now();
    if (!dirty && now - lastDraw < 1000) return;
    lastDraw = now;
    try {
      drawClock();
      if (!dirty) return;
      dirty = false;
      const key = viewKey();
      if (key === shownKey) return;
      shownKey = key;
      drawBoard();
    } catch (err) { log('work orders failed', err); }
  };

  const api = {
    get board() { return board; },
    wire,
    render,
    markDirty,
    candidates: () => candidates(),
    refreshNow: () => { refreshNow(); },
    /** Dev aid: the board's clock moved by `ticks`. */
    advance: (ticks) => { if (board !== null && model.advance(board, ticks)) refreshNow(); markDirty(); },
  };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.workOrders = api;
  });

  ctx.onCharacterLoaded(() => {
    // The saved board (null before it opened, or in a save from an older build).
    const saved = hiring.crew.board;
    board = saved === null ? null : model.normalizeBoard(saved);
    hiring.crew.board = board;
    seenLevel = level();
    fillNow();
    // After payroll's: the wage of the action that just ran is in by then.
    hiring.events.on('folkPaid', onPaid);
    hiring.events.on('folkActionDone', onActionDone);
    hiring.events.on('folkMade', onMade);
    hiring.events.on('folkFired', ({ folk }) => { sticky.delete(folk.id); actions.delete(folk.id); });
    hiring.events.on('folkAssigned', ({ folk }) => sticky.delete(folk.id));
    ['crewChanged', 'folkPromoted'].forEach((name) => hiring.events.on(name, markDirty));
    log('work orders ready', board === null ? 'board locked' : `${board.orders.length} order(s)`);
  });

  return api;
}
