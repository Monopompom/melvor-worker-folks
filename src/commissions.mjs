// Township Commissions on the Hiring page (build .163): the town's board, sending a Folk, runs to town, paying the
// town's rewards. Game-facing; the rules are in commissions-model.mjs, passed in from setup.mjs.
//
// Only with Township in the game (the full game), once your town is founded and Hiring reaches 30. A Folk sent on a
// commission is the one that holds its skill; from then on every item of the commission it makes goes to its room's
// town side (room.mjs asks `claim`). After each of its actions, when the room holds the rest of the amount or has no
// space for one more action, the Folk stops at the next tick and sets off: for 45 minutes of game time it makes
// nothing, the 'work' guard refuses a start ("On its way to the Miller"), and at the end what it carried is delivered,
// its time is paid as wages, anything past the amount goes home and the Folk starts its skill again on what it was
// doing. The clocks (the board's day, each commission's deadline, runs, Standing's fading) are our own tick count on
// Game.tick, so offline time counts.
//
// What it does not do yet (H1): switch a Folk's recipe to the asked item (the card says when it makes something else);
// remember what a Folk was doing across a reload in the middle of a run (it then waits to be started again).

const CONTAINER_ID = 'worker-folks-container';
export const BLOCK_ID = 'worker-folks-commissions';
const CHECK_TICKS = 20;
/** How often the board looks whether the town still owes the charter (every 10 s). */
const CHARTER_CHECK_TICKS = 200;

export function install(ctx, { getHiring, model, resume, time, numbers, tips, popupDidRender, log }) {
  let hiring;
  let state = null;
  let ticks = 0;
  /** Folks whose run starts at the next tick (decided after an action, started outside it). */
  const due = new Set();
  /** What a Folk was working on when it set off, to start it again on its return (not saved). */
  const picks = new Map();
  let nextId = 0;
  const makeId = () => `tc${Date.now().toString(36)}${(nextId++).toString(36)}`;

  let dirty = true;
  let block = null;
  let grid = null;
  let clock = null;
  let standingEl = null;
  let lastClockText = '';

  const township = () => game.township;
  const exists = () => township() !== undefined;
  const founded = () => exists() && township().isUnlocked !== false && township().townData?.townCreated === true;
  const level = () => hiring?.level ?? 0;
  const isOpen = () => founded() && level() >= model.BOARD_LEVEL;
  const tier = () => model.tierOf(state?.standing.points ?? 0);
  const slots = () => model.slotsFor(tier());
  const media = (path) => hiring.getMediaURL(path);
  const portraitOf = (figure) => media(`assets/figure_${figure.toLowerCase()}.webp`);
  const figureName = (id) => getLangString(`MOD_WF_FIGURE_${id}`);
  const itemOf = (id) => game.items.getObjectByID(id);
  const resourceOf = (id) => township()?.resources?.getObjectByID(id);
  // Shown numbers: the short form past 9,999 ("540K", "169.5K"), built on the game's formatters; the exact one in
  // tooltips. Amounts here are hours of work, so a big recipe yield reaches six digits.
  const n = (v) => numbers.shortNumber(Math.floor(v));
  const full = (v) => numberWithCommas(Math.floor(v));
  const isShort = (v) => n(v) !== full(v);
  const markDirty = () => { dirty = true; };
  const online = () => game._isInOnlineLoop;
  const byId = (id) => (id === null ? undefined : hiring.crew.byId(id));
  const commissionById = (id) => state?.commissions.find((c) => c.id === id);
  const xpToNext = () => {
    const lv = level();
    try { return Math.max(0, exp.levelToXP(lv + 1) - exp.levelToXP(lv)); } catch { return 0; }
  };

  // ---- the board ---------------------------------------------------------------------------------------------------

  const rollOpts = () => ({
    candidates: hiring.workOrders?.candidates() ?? [],
    townshipLevel: township()?.level ?? 1,
    stock: Object.fromEntries(model.FIGURES.map((f) => [f.resource, resourceOf(f.resource)?.amount ?? 0])),
    season: township()?.townData?.season?.localID ?? null,
    makeId,
  });
  const fillNow = () => {
    if (!isOpen()) return;
    if (state === null) {
      state = model.createState();
      hiring.crew.commissions = state;
    }
    if (model.fill(state, rollOpts(), slots()).length > 0) markDirty();
  };

  // ---- the Guild Charter (Known) -----------------------------------------------------------------------------------

  const charterItem = () => game.items.getObjectByID(`worker_folks:${model.CHARTER_ID}`);
  const hallOf = () => township()?.buildings?.getObjectByID(`worker_folks:${model.HALL_ID}`);
  const charterFound = () => {
    const item = charterItem();
    try { return item !== undefined && game.stats.itemFindCount(item) > 0; } catch { return false; }
  };
  /**
   * The town hands over the charter once Known is reached, and again if it was never found (lost to a full bank in an
   * older build, say). Bank space or not: it is one item, and Township's Guild Hall asks for it.
   */
  const grantCharter = () => {
    const item = charterItem();
    if (item === undefined || hallOf() === undefined || !model.charterDue(state, charterFound())) return;
    try {
      game.bank.addItem(item, 1, true, true, true, true, 'worker_folks.Commissions');
    } catch (err) { log('charter not given', err); return; }
    notify('success', getLangString('MOD_WF_COMM_CHARTER_GIVEN'), item.media);
    log('Guild Charter given');
    markDirty();
  };
  /** Guild Halls built in Grasslands and the wage relief they give now (efficiency counted), or null without them. */
  const halls = () => {
    const hall = hallOf();
    const biome = township()?.biomes?.getObjectByID(model.HALL_BIOME);
    if (hall === undefined || biome === undefined) return null;
    let built = 0;
    let relief = 0;
    try {
      built = biome.getBuildingCount(hall);
      relief = built > 0 ? Math.max(1, built * (biome.getBuildingEfficiency(hall) / 100)) * model.HALL_WAGE_DISCOUNT : 0;
    } catch { return null; }
    return { built, relief: Math.round(relief * 10) / 10 };
  };
  /**
   * Township recomputes the player's modifiers only on some events (a season change, worship), not when a building is
   * built, destroyed or wears down, so a new Hall's wage relief would wait for an unrelated stat change. When the Halls
   * change, recompute once. The first check after load only records them: loading computes every stat already.
   */
  let hallKey;
  const syncHalls = () => {
    const h = halls();
    const key = h === null ? '' : `${h.built}:${h.relief}`;
    if (hallKey !== undefined && key !== hallKey) {
      try { township().computeProvidedStats(true); } catch (err) { log('hall stats not updated', err); }
    }
    hallKey = key;
  };

  const notify = (kind, text, icon) => {
    if (!online()) return;
    if (kind === 'error') game.notifications.createErrorNotification('worker_folks:commission', text);
    else game.notifications.createSuccessNotification('worker_folks:commission', text, icon);
  };
  const line = (c, kind, index) => getLangString(`MOD_WF_FIGURE_${c.figure}_${kind}_${index}`);
  const askText = (c) => templateLangString('MOD_WF_COMM_ASK', { qty: n(c.qty), item: itemOf(c.itemId)?.name ?? c.itemId });

  /** Room left in the town's storage (all resources share it); Infinity when it can't be read. */
  const storageFree = () => {
    const ts = township();
    if (ts === undefined) return Infinity;
    try { return Math.max(0, Math.floor(ts.getMaxStorage() - ts.getUsedStorage())); } catch { return Infinity; }
  };

  /** Township resources, as far as the town's storage takes them; returns what went in. */
  const addResources = (id, amount) => {
    const ts = township();
    const resource = resourceOf(id);
    if (ts === undefined || resource === undefined || !(amount > 0)) return 0;
    const add = Math.min(Math.floor(amount), storageFree());
    if (add > 0) {
      resource.amount += add;
      try { ts.onResourceAmountChange(); } catch {}
    }
    return add;
  };
  const resourceText = (id, amount) => templateLangString('MOD_WF_COMM_REWARD_RESOURCE', { qty: n(amount), resource: resourceOf(id)?.name ?? id });

  /** Pays a delivered commission: resources, Standing, Hiring XP; shown even with Folks' gain popups hidden. */
  const payDelivered = (c, folk) => {
    const p = model.payout(c);
    const added = addResources(c.resourceId, p.resources);
    const tiers = model.gainStanding(state.standing, p.standing);
    model.noteReached(state);
    const xp = Math.max(1, Math.ceil(p.xpLevels * xpToNext()));
    const turn = hiring.folkTurn;
    hiring.folkTurn = false;
    try { hiring.addXP(xp); } finally { hiring.folkTurn = turn; }
    state.delivered += 1;
    // lost: what the town's full storage turned away, so the card can say so rather than show "0 Food".
    c.paid = { resources: added, lost: Math.max(0, Math.floor(p.resources) - added), standing: p.standing, late: p.late };
    const thanks = line(c, p.late ? 'LATE' : 'THANKS', 1 + Math.floor(Math.random() * (p.late ? model.LINES.late : model.LINES.thanks)));
    const parts = [...(added > 0 ? [resourceText(c.resourceId, added)] : []), templateLangString('MOD_WF_COMM_REWARD_STANDING', { points: n(p.standing) }), templateLangString('MOD_WF_COMM_REWARD_XP', { xp: n(xp) })];
    notify('success', templateLangString('MOD_WF_COMM_DELIVERED', { figure: figureName(c.figure), name: folk?.name ?? '', what: askText(c), line: thanks, rewards: parts.join(', ') }), portraitOf(c.figure));
    if (added < p.resources) notify('error', templateLangString('MOD_WF_COMM_STORAGE_FULL', { lost: resourceText(c.resourceId, p.resources - added) }));
    if (tiers.after > tiers.before) notify('success', templateLangString('MOD_WF_COMM_TIER_UP', { tier: getLangString(`MOD_WF_STANDING_${model.TIERS[tiers.after].id}`) }), township()?.media);
    grantCharter();
    hiring.events.emit('commissionDelivered', { commission: c, folk, reward: { ...p, resources: added, xp }, offline: !online() });
    log(`commission delivered: ${c.id} ${c.figure} ${c.itemId} ×${c.qty}`, p);
    markDirty();
  };

  /** A figure withdraws a commission a day past its deadline: what came is paid without the bonus, the rest goes home. */
  const onWithdrawn = (c) => {
    const folk = byId(c.folkId);
    c.folkId = null;
    if (folk !== undefined && state.runs[folk.id] === undefined) hiring.room?.townHome(folk);
    const due = Math.floor(model.proRata(c).resources);
    const paid = addResources(c.resourceId, due);
    const lost = Math.max(0, due - paid);
    c.paid = { resources: paid, lost, standing: 0, late: true };
    const key = due <= 0 ? 'MOD_WF_COMM_WITHDRAWN_NONE' : paid > 0 ? 'MOD_WF_COMM_WITHDRAWN' : 'MOD_WF_COMM_WITHDRAWN_LOST';
    notify('error', templateLangString(key, { figure: figureName(c.figure), what: askText(c), paid: resourceText(c.resourceId, paid), lost: resourceText(c.resourceId, lost) }));
    if (paid > 0 && lost > 0) notify('error', templateLangString('MOD_WF_COMM_STORAGE_FULL', { lost: resourceText(c.resourceId, lost) }));
    hiring.events.emit('commissionWithdrawn', { commission: c, folk, offline: !online() });
    hiring.renderQueue.folks = true;
    markDirty();
  };

  // ---- sending a Folk, runs ----------------------------------------------------------------------------------------

  /** The commission this Folk's action fills with `item`, or undefined (room.mjs diverts the item when there is one). */
  const claim = (folk, item) => {
    if (state === null || folk === undefined || item === undefined || state.runs[folk.id] !== undefined) return undefined;
    const c = model.commissionOf(state, folk.id);
    return c !== undefined && c.itemIds.includes(item.id) ? c : undefined;
  };

  const send = (c) => {
    if (state === null || c.state !== 'open' || c.folkId !== null) return;
    const folk = hiring.crew.bySkill(c.skillId);
    const skillName = hiring.skillName(c.skillId);
    if (folk === undefined) { notify('error', templateLangString('MOD_WF_COMM_NO_FOLK', { skill: skillName })); return; }
    const other = model.commissionOf(state, folk.id);
    if (other !== undefined) { notify('error', templateLangString('MOD_WF_COMM_BUSY', { name: folk.name, figure: figureName(other.figure) })); return; }
    c.folkId = folk.id;
    notify('success', templateLangString('MOD_WF_COMM_SENT', { name: folk.name, figure: figureName(c.figure), item: itemOf(c.itemId)?.name ?? c.itemId }), portraitOf(c.figure));
    log(`commission ${c.id}: ${folk.name} sent`);
    hiring.renderQueue.folks = true;
    markDirty();
  };

  /** Takes a Folk off its commission: the commission waits for another, what its room holds for the town goes home. */
  const recall = (c) => {
    const folk = byId(c.folkId);
    c.folkId = null;
    if (folk !== undefined && state.runs[folk.id] === undefined) hiring.room?.townHome(folk);
    hiring.renderQueue.folks = true;
    markDirty();
  };

  const nextMs = (folk, intervalMs) => (intervalMs > 0 ? intervalMs : (hiring.skillOf(folk)?.actionTimer?.maxTicks ?? 0) * TICK_INTERVAL);

  const afterAction = ({ folk, intervalMs }) => {
    if (state === null || folk === undefined || state.runs[folk.id] !== undefined) return;
    const c = model.commissionOf(state, folk.id);
    if (c === undefined || hiring.room === undefined) return;
    const townQty = hiring.room.townQty(folk, c.itemIds);
    if (model.runDue({ townQty, remaining: model.remaining(c), usedMs: hiring.room.usedMs(folk), capMs: hiring.room.capMs(folk), nextMs: nextMs(folk, intervalMs) })) due.add(folk.id);
  };

  const startRun = (folkId) => {
    const folk = byId(folkId);
    const c = folk === undefined ? undefined : model.commissionOf(state, folkId);
    if (c === undefined || state.runs[folkId] !== undefined) return;
    const skill = hiring.skillOf(folk);
    const working = skill !== undefined && hiring.delegated.has(skill);
    const pick = working ? resume.selectionOf(skill) : null;
    if (working) {
      picks.set(folkId, pick);
      hiring.forceStop(skill);
    }
    // The pick goes into the save as ids too, so the Folk starts on the same thing after a reload.
    state.runs[folkId] = { ticks: model.RUN_TICKS, commissionId: c.id, restart: working, pick: resume.toSaved(pick) };
    const carried = hiring.room?.townQty(folk, c.itemIds) ?? 0;
    notify('success', templateLangString('MOD_WF_COMM_RUN_START', { name: folk.name, figure: figureName(c.figure), qty: n(carried), item: itemOf(c.itemId)?.name ?? c.itemId }), portraitOf(c.figure));
    hiring.events.emit('commissionRun', { commission: c, folk, qty: carried, offline: !online() });
    hiring.renderQueue.folks = true;
    markDirty();
  };

  /** Back at work after a run: the skill started again on what it was doing, as an auto-restart would. */
  const restart = (folk, saved) => {
    const skill = hiring.skillOf(folk);
    const pick = picks.get(folk.id) ?? resume.fromSaved(skill, saved, game);
    picks.delete(folk.id);
    if (skill === undefined || skill.isActive || hiring.delegated.has(skill) || !hiring.folkAvailable(folk)) return;
    if (hiring.workRefusal(folk, skill) !== '') return;
    try {
      resume.startAgain(skill, pick ?? resume.selectionOf(skill));
    } catch (err) {
      log('commission restart failed', err);
    }
    if (!hiring.delegated.has(skill) && skill.isActive && game.activeAction !== skill) {
      try { skill.stop(); } catch { skill.isActive = false; }
    }
  };

  const finishRun = (folkId) => {
    const run = state.runs[folkId];
    delete state.runs[folkId];
    const folk = byId(folkId);
    if (folk === undefined) return;
    const c = commissionById(run.commissionId);
    const skill = hiring.skillOf(folk);
    if (c !== undefined && c.state === 'open' && c.folkId === folk.id) {
      const taken = hiring.room?.takeTown(folk, c.itemIds, model.remaining(c)) ?? 0;
      const { added, done } = model.deliver(c, taken);
      hiring.room?.townHome(folk);
      if (done) payDelivered(c, folk);
      else if (added > 0) notify('success', templateLangString('MOD_WF_COMM_RUN_DONE', { name: folk.name, figure: figureName(c.figure), qty: n(added), left: n(model.remaining(c)) }), portraitOf(c.figure));
    } else {
      hiring.room?.townHome(folk);
    }
    if (skill !== undefined) hiring.payroll?.chargeTime?.(folk, skill, model.RUN_TICKS * TICK_INTERVAL);
    if (run.restart) restart(folk, run.pick);
    hiring.renderQueue.folks = true;
    markDirty();
  };

  // ---- the clock ---------------------------------------------------------------------------------------------------

  ctx.patch(Game, 'tick').after(function () {
    if (hiring === undefined || this.isGolbinRaid) return;
    ticks += 1;
    if (state === null) {
      if (ticks % CHECK_TICKS === 0) fillNow();
      return;
    }
    const r = model.advance(state, 1);
    r.late.forEach((c) => notify('error', templateLangString('MOD_WF_COMM_LATE', { figure: figureName(c.figure), what: askText(c) })));
    r.withdrawn.forEach(onWithdrawn);
    if (r.refresh && isOpen()) {
      model.refresh(state, rollOpts(), slots());
      markDirty();
    }
    for (const [folkId, run] of Object.entries(state.runs)) {
      run.ticks -= 1;
      if (run.ticks <= 0) finishRun(folkId);
    }
    if (due.size > 0) {
      const ids = [...due];
      due.clear();
      ids.forEach(startRun);
    }
    if (ticks % CHECK_TICKS === 0 && state.commissions.length < slots()) fillNow();
    if (ticks % CHARTER_CHECK_TICKS === 0) {
      grantCharter();
      syncHalls();
    }
  });

  // ---- the card line -----------------------------------------------------------------------------------------------

  /** What the commission's item is made by now, as far as the skill says (undefined: can't tell). */
  const makesItem = (folk, c) => {
    const skill = hiring.skillOf(folk);
    if (skill === undefined || !hiring.delegated.has(skill)) return undefined;
    try {
      const action = skill.masteryAction;
      const ids = [action?.product?.id, action?.perfectCook?.id, ...(Array.isArray(action?.potions) ? action.potions.map((p) => p?.id) : [])].filter(Boolean);
      return ids.length === 0 ? undefined : ids.some((id) => c.itemIds.includes(id));
    } catch { return undefined; }
  };

  const cardView = (folk) => {
    if (state === null || folk === undefined) return undefined;
    const c = model.commissionOf(state, folk.id);
    if (c === undefined) return undefined;
    const figure = figureName(c.figure);
    const run = state.runs[folk.id];
    if (run !== undefined) {
      return { icon: portraitOf(c.figure), text: templateLangString('MOD_WF_COMM_CARD_RUN', { figure, time: time.shortTime(run.ticks * TICK_INTERVAL) }), warn: false, tip: [askText(c)] };
    }
    // Actions a room holds; one item each (a guess: double drops and multi-item recipes make it fewer runs).
    const perRun = Math.max(0, Math.floor((hiring.room?.capMs(folk) ?? 0) / Math.max(1, nextMs(folk, 0))));
    const runs = model.runsLeft({ rest: model.remaining(c), perRunQty: perRun });
    const left = model.deadlineLeft(c);
    const when = left > 0 ? templateLangString('MOD_WF_COMM_DUE', { time: time.shortTime(left * TICK_INTERVAL) }) : getLangString('MOD_WF_COMM_LATE_SHORT');
    const makes = makesItem(folk, c);
    return {
      icon: portraitOf(c.figure),
      text: templateLangString('MOD_WF_COMM_CARD', { figure, done: n(c.delivered + (hiring.room?.townQty(folk, c.itemIds) ?? 0)), qty: n(c.qty), item: itemOf(c.itemId)?.name ?? c.itemId }),
      sub: makes === false ? templateLangString('MOD_WF_COMM_CARD_WRONG', { skill: hiring.skillName(c.skillId), item: itemOf(c.itemId)?.name ?? c.itemId })
        : `${templateLangString(runs === 1 ? 'MOD_WF_COMM_RUNS_ONE' : 'MOD_WF_COMM_RUNS', { count: full(runs) })} · ${when}`,
      warn: makes === false || left <= 0,
      tip: [templateLangString('MOD_WF_COMM_ASK', { qty: full(c.qty), item: itemOf(c.itemId)?.name ?? c.itemId }), templateLangString('MOD_WF_COMM_CARD_TIP', { figure })],
    };
  };

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
      b.append(el('div', 'wf-help-head', getLangString(`MOD_WF_COMM_HELP_${k}_HEAD`)));
      getLangString(`MOD_WF_COMM_HELP_${k}`).split(/(?<=[.!?])\s+/).filter(Boolean).forEach((l) => b.append(el('p', 'wf-help-p', l)));
      body.append(b);
    }
    const cls = { popup: 'wf-ui', confirmButton: 'btn btn-success m-1' };
    SwalLocale.fire({
      didRender: popupDidRender,
      title: getLangString('MOD_WF_COMM_TITLE'),
      width: '38rem',
      html: body,
      confirmButtonText: getLangString('MOD_WF_BUTTON_GOT_IT'),
      customClass: typeof createSwalCustomClass === 'function' ? createSwalCustomClass(cls) : cls,
    });
  };

  const wire = () => {
    if (block !== null || !exists()) return;
    const column = document.getElementById(CONTAINER_ID)?.querySelector('[data-wf="blocks"]');
    if (column === undefined || column === null) return;
    block = el('div', 'block block-rounded border-top border-worker-folks border-4x');
    block.id = BLOCK_ID;
    const content = el('div', 'block-content wf-dash-content');
    const head = el('div', 'd-flex align-items-center flex-wrap mb-3 wf-dash-title');
    head.append(img(township().media, 'skill-icon-sm mr-2'));
    head.append(el('h5', 'font-w600 mb-0', getLangString('MOD_WF_COMM_TITLE')));
    const help = el('button', 'btn btn-sm wf-help');
    help.type = 'button';
    help.setAttribute('aria-label', getLangString('MOD_WF_HELP_LABEL_commissions'));
    const q = el('i', 'fa fa-question-circle');
    q.setAttribute('aria-hidden', 'true');
    help.append(q);
    help.addEventListener('click', openHelp);
    head.append(help);
    const right = el('div', 'ml-auto d-flex align-items-center wf-dash-right');
    standingEl = el('span', 'badge badge-info wf-comm-standing');
    clock = el('span', 'wf-subtle wf-orders-clock ml-2');
    right.append(standingEl, clock);
    head.append(right);
    grid = el('div', 'wf-orders-grid');
    content.append(head, grid);
    block.append(content);
    column.append(block);
    markDirty();
  };

  /** One reward a line; `exact`: the full number's text, a tooltip when the line shows the short one. */
  const rewardRow = (list, icon, text, exact, cls = '') => {
    const row = el('div', `d-flex align-items-center wf-order-reward${cls === '' ? '' : ` ${cls}`}`);
    row.append(img(icon, 'skill-icon-xs mr-1'), el('span', '', text));
    if (exact !== undefined && exact !== text) tips?.set(row, exact);
    list.append(row);
  };

  const commissionCard = (c) => {
    const done = c.state !== 'open';
    const card = el('div', `wf-band wf-order wf-comm${done ? ' wf-order-done' : ''}`);
    const top = el('div', 'd-flex align-items-center wf-order-head');
    top.append(img(portraitOf(c.figure), 'wf-comm-portrait mr-2'));
    const who = el('div', 'wf-min0 flex-fill');
    who.append(el('div', 'font-w600', templateLangString('MOD_WF_COMM_FIGURE_TITLE', { figure: figureName(c.figure) })));
    top.append(who);
    const stateKey = c.state === 'done' ? 'MOD_WF_COMM_STATE_DONE' : c.state === 'withdrawn' ? 'MOD_WF_COMM_STATE_WITHDRAWN' : c.late ? 'MOD_WF_COMM_STATE_LATE' : 'MOD_WF_COMM_STATE_OPEN';
    const badgeCls = c.state === 'done' ? 'badge-success' : c.state === 'withdrawn' ? 'badge-secondary' : c.late ? 'badge-warning' : 'badge-info';
    top.append(el('span', `badge ${badgeCls} wf-order-state`, getLangString(stateKey)));
    card.append(top);
    // The figure's asking line on its own row under the head, the card's full width (a narrow column beside the
    // portrait wrapped it to five lines).
    card.append(el('small', 'wf-subtle d-block mt-1 wf-comm-line', line(c, 'ASK', c.line)));

    const ask = el('div', 'd-flex align-items-center mt-2 font-w600');
    ask.append(img(itemOf(c.itemId)?.media, 'skill-icon-xs mr-1'), document.createTextNode(askText(c)));
    if (isShort(c.qty)) tips?.set(ask, templateLangString('MOD_WF_COMM_ASK', { qty: full(c.qty), item: itemOf(c.itemId)?.name ?? c.itemId }));
    card.append(ask);
    const skill = game.skills.getObjectByID(c.skillId);
    const skillLine = el('small', 'wf-subtle d-flex align-items-center');
    if (skill !== undefined) skillLine.append(img(skill.media, 'skill-icon-xs mr-1'), document.createTextNode(templateLangString('MOD_WF_COMM_HOURS', { skill: hiring.skillName(skill), hours: full(c.hours) })));
    card.append(skillLine);

    const folk = byId(c.folkId);
    const held = folk === undefined ? 0 : (hiring.room?.townQty(folk, c.itemIds) ?? 0);
    const bar = el('div', 'progress wf-order-bar mt-2');
    const fillBar = el('div', `progress-bar ${done ? 'bg-success' : 'bg-info'}`);
    fillBar.setAttribute('role', 'progressbar');
    fillBar.style.width = `${Math.min(100, (c.delivered / c.qty) * 100)}%`;
    const heldBar = el('div', 'progress-bar bg-info wf-comm-held');
    heldBar.style.width = `${Math.min(100 - Math.min(100, (c.delivered / c.qty) * 100), (held / c.qty) * 100)}%`;
    bar.append(fillBar, heldBar);
    card.append(bar);
    const progressKey = held > 0 ? 'MOD_WF_COMM_PROGRESS_HELD' : 'MOD_WF_COMM_PROGRESS';
    const progress = el('small', 'd-block text-center', templateLangString(progressKey, { done: n(c.delivered), qty: n(c.qty), held: n(held) }));
    if (isShort(c.qty)) tips?.set(progress, templateLangString(progressKey, { done: full(c.delivered), qty: full(c.qty), held: full(held) }));
    card.append(progress);

    if (!done) {
      const left = model.deadlineLeft(c);
      const due = left > 0
        ? templateLangString('MOD_WF_COMM_DUE', { time: time.shortTime(left * TICK_INTERVAL) })
        : templateLangString('MOD_WF_COMM_OVERDUE', { time: time.shortTime((left + model.OVERDUE_TICKS) * TICK_INTERVAL) });
      card.append(el('small', `d-block text-center ${left > 0 ? 'wf-subtle' : 'text-warning'}`, due));
    }

    const list = el('div', 'wf-order-rewards mt-2');
    const shown = done && c.paid !== null ? c.paid : model.payout(c);
    const resource = resourceOf(c.resourceId);
    const exactResource = (qty) => templateLangString('MOD_WF_COMM_REWARD_RESOURCE', { qty: full(qty), resource: resource?.name ?? c.resourceId });
    if (!done) {
      // Amber with the room left when the town's storage couldn't take the whole reward now.
      const free = storageFree();
      const short = free < Math.floor(shown.resources);
      const roomTip = free > 0 ? templateLangString('MOD_WF_COMM_REWARD_ROOM', { free: full(free) }) : getLangString('MOD_WF_COMM_REWARD_ROOM_NONE');
      const tip = short ? roomTip : exactResource(shown.resources);
      rewardRow(list, resource?.media, resourceText(c.resourceId, shown.resources), tip, short ? 'text-warning' : '');
    } else {
      // What went in, and apart from it what a full storage turned away; no row at all when nothing was paid
      // (a withdrawn commission nothing came for), never a "0 Food" line.
      if (shown.resources > 0) rewardRow(list, resource?.media, resourceText(c.resourceId, shown.resources), exactResource(shown.resources));
      if (shown.lost > 0) {
        rewardRow(list, resource?.media, templateLangString('MOD_WF_COMM_REWARD_LOST', { qty: n(shown.lost), resource: resource?.name ?? c.resourceId }),
          getLangString('MOD_WF_COMM_REWARD_LOST_TIP'), 'text-warning');
      }
    }
    if (c.state !== 'withdrawn') rewardRow(list, township()?.media, templateLangString('MOD_WF_COMM_REWARD_STANDING', { points: n(shown.standing) }));
    if (!done) {
      const xp = Math.max(1, Math.ceil(c.xpLevels * xpToNext()));
      rewardRow(list, hiring.media, templateLangString('MOD_WF_COMM_REWARD_XP', { xp: n(xp) }), templateLangString('MOD_WF_COMM_REWARD_XP', { xp: full(xp) }));
    }
    card.append(list);

    if (!done) {
      const foot = el('div', 'd-flex align-items-center flex-wrap mt-2 wf-comm-foot');
      if (folk !== undefined) {
        const run = state.runs[folk.id];
        const text = run !== undefined
          ? templateLangString('MOD_WF_COMM_FOLK_RUN', { name: folk.name, time: time.shortTime(run.ticks * TICK_INTERVAL) })
          : templateLangString('MOD_WF_COMM_FOLK_ON', { name: folk.name });
        foot.append(img(hiring.portrait(folk.tier), 'skill-icon-xs mr-1'), el('small', 'flex-fill', text));
        const back = el('button', 'btn btn-sm btn-outline-secondary', getLangString('MOD_WF_COMM_RECALL'));
        back.type = 'button';
        back.addEventListener('click', () => recall(c));
        tips?.set(back, getLangString('MOD_WF_COMM_RECALL_TIP'));
        foot.append(back);
      } else {
        const holder = hiring.crew.bySkill(c.skillId);
        const busy = holder === undefined ? undefined : model.commissionOf(state, holder.id);
        if (holder === undefined) {
          foot.append(el('small', 'wf-subtle', templateLangString('MOD_WF_COMM_NO_FOLK', { skill: hiring.skillName(c.skillId) })));
        } else if (busy !== undefined) {
          foot.append(el('small', 'wf-subtle', templateLangString('MOD_WF_COMM_BUSY', { name: holder.name, figure: figureName(busy.figure) })));
        } else {
          const go = el('button', 'btn btn-sm btn-info', templateLangString('MOD_WF_COMM_SEND', { name: holder.name }));
          go.type = 'button';
          go.addEventListener('click', () => send(c));
          tips?.set(go, templateLangString('MOD_WF_COMM_SEND_TIP', { name: holder.name, figure: figureName(c.figure) }));
          foot.append(go);
        }
      }
      card.append(foot);
    }
    return card;
  };

  const lockedText = () => {
    if (!founded()) return getLangString('MOD_WF_COMM_LOCKED_TOWN');
    return templateLangString('MOD_WF_COMM_LOCKED', { level: full(model.BOARD_LEVEL) });
  };

  const viewKey = () => JSON.stringify({
    open: isOpen(),
    lv: level(),
    tier: tier(),
    crew: hiring.crew.all.map((f) => [f.id, f.skillId]),
    c: state?.commissions.map((c) => [c.id, c.delivered, c.state, c.late, c.folkId, Math.floor(model.deadlineLeft(c) / 72000),
      c.folkId === null ? 0 : (hiring.room?.townQty(byId(c.folkId), c.itemIds) ?? 0)]) ?? null,
    runs: state === null ? null : Object.entries(state.runs).map(([id, r]) => [id, Math.floor(r.ticks / 1200)]),
    room: state?.commissions.some((c) => c.state === 'open' && storageFree() < Math.floor(model.payout(c).resources)) ?? false,
  });
  let shownKey = '';

  const drawBoard = () => {
    const nodes = [];
    if (!isOpen() || state === null) nodes.push(el('div', 'wf-band wf-orders-locked', lockedText()));
    else {
      state.commissions.forEach((c) => nodes.push(commissionCard(c)));
      for (let i = state.commissions.length; i < slots(); i += 1) nodes.push(el('div', 'wf-band wf-order wf-order-empty wf-subtle', getLangString('MOD_WF_COMM_EMPTY')));
    }
    grid.replaceChildren(...nodes);
    tips?.sweep?.();
  };

  let lastHallLine = null;
  const drawHead = () => {
    const on = isOpen() && state !== null;
    const text = on ? templateLangString('MOD_WF_COMM_REFRESH', { time: time.shortTime(model.ticksLeft(state) * TICK_INTERVAL) }) : '';
    if (text !== lastClockText) {
      clock.textContent = text;
      lastClockText = text;
    }
    standingEl.classList.toggle('d-none', !on);
    if (!on) return;
    const points = state.standing.points;
    const next = model.nextTierPoints(points);
    const label = templateLangString(next === null ? 'MOD_WF_COMM_STANDING_TOP' : 'MOD_WF_COMM_STANDING', {
      tier: getLangString(`MOD_WF_STANDING_${model.TIERS[tier()].id}`), points: n(points), next: next === null ? '' : n(next),
    });
    const h = state.reached >= model.CHARTER_TIER ? halls() : null;
    const hallLine = h === null ? '' : templateLangString('MOD_WF_COMM_HALLS', { built: full(h.built), max: full(model.HALL_MAX), relief: h.relief });
    if (standingEl.textContent !== label || hallLine !== lastHallLine) {
      standingEl.textContent = label;
      lastHallLine = hallLine;
      tips?.set(standingEl, [getLangString('MOD_WF_COMM_STANDING_TIP'), ...(hallLine === '' ? [] : [hallLine])]);
    }
  };

  let lastDraw = 0;
  const render = () => {
    if (hiring === undefined || grid === null) return;
    if (document.getElementById(CONTAINER_ID)?.classList.contains('d-none')) return;
    const now = Date.now();
    if (!dirty && now - lastDraw < 1000) return;
    lastDraw = now;
    try {
      drawHead();
      const key = viewKey();
      if (!dirty && key === shownKey) return;
      dirty = false;
      if (key === shownKey) return;
      shownKey = key;
      drawBoard();
    } catch (err) { log('commissions failed', err); }
  };

  const api = {
    get state() { return state; },
    claim,
    cardView,
    wire,
    render,
    markDirty,
    /** Why a Folk can't work now ('' when nothing here stops it): on its way to town. */
    runText(folk) {
      const run = state?.runs[folk?.id];
      if (run === undefined) return '';
      const c = commissionById(run.commissionId);
      return templateLangString('MOD_WF_COMM_RUN_REFUSAL', { figure: c === undefined ? '' : figureName(c.figure), time: time.shortTime(run.ticks * TICK_INTERVAL) });
    },
    /** Dev aid: every clock moved by `ticks` (the board's day, deadlines, runs, fading). */
    advance(n = 1) {
      if (state === null) return;
      const r = model.advance(state, n);
      r.late.forEach((c) => notify('error', templateLangString('MOD_WF_COMM_LATE', { figure: figureName(c.figure), what: askText(c) })));
      r.withdrawn.forEach(onWithdrawn);
      if (r.refresh && isOpen()) model.refresh(state, rollOpts(), slots());
      for (const [folkId, run] of Object.entries(state.runs)) { run.ticks -= n; if (run.ticks <= 0) finishRun(folkId); }
      markDirty();
    },
    /** Dev aid: a run that ends now. */
    finishRuns() { if (state !== null) Object.keys(state.runs).forEach(finishRun); },
    /** Dev aid: a new board now. */
    reroll() { if (state !== null && isOpen()) { state.commissions = state.commissions.filter((c) => c.folkId !== null); model.fill(state, rollOpts(), slots()); markDirty(); } },
  };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.commissions = api;
    hiring.ownGuards.register('work', ({ folk }) => {
      const reason = api.runText(folk);
      return reason === '' ? undefined : { reason };
    });
  });

  ctx.onCharacterLoaded(() => {
    const saved = hiring.crew.commissions;
    state = saved === null ? null : model.normalizeState(saved);
    hiring.crew.commissions = state;
    // A commission for a Folk no longer hired, or no longer on its skill, waits for another.
    state?.commissions.forEach((c) => {
      const folk = byId(c.folkId);
      if (c.folkId !== null && (folk === undefined || folk.skillId !== c.skillId)) c.folkId = null;
    });
    due.clear();
    picks.clear();
    fillNow();
    hiring.events.on('folkActionDone', afterAction);
    hiring.events.on('folkFired', ({ folk }) => {
      if (state === null) return;
      delete state.runs[folk.id];
      due.delete(folk.id);
      state.commissions.forEach((c) => { if (c.folkId === folk.id) c.folkId = null; });
      markDirty();
    });
    hiring.events.on('folkAssigned', ({ folk, skillId }) => {
      const c = state === null ? undefined : model.commissionOf(state, folk.id);
      if (c !== undefined && c.skillId !== skillId) recall(c);
      markDirty();
    });
    ['crewChanged', 'folkPromoted', 'folkStarted', 'folkReleased'].forEach((name) => hiring.events.on(name, markDirty));
    log('commissions ready', state === null ? (exists() ? 'board locked' : 'no Township') : `${state.commissions.length} commission(s)`);
  });

  return api;
}
