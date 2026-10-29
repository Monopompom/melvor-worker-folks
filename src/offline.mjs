// Offline progress for delegated skills. The engine's offline loop runs
// Game.tick, which (patched in delegation.mjs) already ticks delegated skills.
// This module: opens the summary modal when only Folks were working, appends a
// per-Folk block to the summary, and emits `offlineTicks` for later timers.

export function install(ctx, { getHiring, time, log }) {
  let hiring;
  /** Per offline session: actions completed and skills released, by skill id; wages paid, by currency id. */
  let tracker = { actions: new Map(), released: new Set(), died: [], debts: [], struck: [], traits: [], wages: new Map(), wageMs: new Map(), orders: [], active: false };
  const reset = () => {
    tracker = { actions: new Map(), released: new Set(), died: [], debts: [], struck: [], traits: [], wages: new Map(), wageMs: new Map(), orders: [], active: true };
  };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
  });

  // Summary modal when the main slot is idle but Folks are working.
  ctx.patch(Game, 'enterOfflineLoop').after(function () {
    if (hiring === undefined) return;
    reset();
    hiring.delegated.forEach((skill) => skill.createOfflineSnapshot?.());
    const info = this._offlineInfo;
    if (info.action !== undefined || hiring.delegated.size === 0) return;
    const [first] = hiring.delegated;
    info.action = first;
    const offlineProgress = createElement('offline-progress');
    addModalToQueue({
      title: getLangString('MISC_STRING_3'),
      html: offlineProgress,
      imageUrl: hiring.media,
      imageWidth: 64,
      imageHeight: 64,
      imageAlt: getLangString('CHARACTER_SELECT_88'),
      allowOutsideClick: false,
      allowEscapeKey: false,
    });
    info.offlineProgress = offlineProgress;
  });

  let exiting;
  ctx.patch(Game, 'exitOfflineLoop').before(function () {
    exiting = this._offlineInfo;
  });
  ctx.patch(Game, 'exitOfflineLoop').after(function () {
    if (hiring === undefined || exiting === undefined) return;
    const info = exiting;
    exiting = undefined;
    const ms = info.timeProcessed;
    const ticks = Math.floor(ms / TICK_INTERVAL);
    tracker.active = false;
    hiring.events.emit('offlineTicks', { ticks, ms });
    if (info.offlineProgress === undefined || (tracker.actions.size === 0 && tracker.released.size === 0 && tracker.died.length === 0 && tracker.debts.length === 0 && tracker.struck.length === 0 && tracker.traits.length === 0 && tracker.wages.size === 0 && tracker.orders.length === 0 && !hiring.crew.all.some((f) => (hiring.room?.heldList(f).length ?? 0) > 0))) return;
    const container = info.offlineProgress.messageContainer;
    if (container === undefined) return;
    // Welcome Back lines in the game's own style (scan C-08, C-09, C-10, build .112):
    // h5 600 like the game's, the skill's icon just before the skill's name (the user, .114: an icon at the front of
    // a wrapped line sat apart from it), a gain green, what was lost or owed red, and the advice on its own plain line
    // under it.
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    /** The language line as HTML, the marked values in their colour. */
    const fill = (key, vars, marks = {}, media) => {
      // In brackets, "(Woodcutting)": the icon's 4 px margin after "(" is matched before ")" (the user, 20 Oct 2026).
      const boxed = getLangString(key).includes('(${skill})');
      return templateLangString(key, Object.fromEntries(Object.entries(vars)
        .map(([k, v]) => [k, k === 'skill' && media ? icon(media, v, boxed) : marks[k] ? `<span class="${marks[k]}">${esc(v)}</span>` : esc(v)])));
    };
    /** The skill's name with its icon in front: icon, a plain space, the name, as the game writes "8 [icon] Normal Logs"
     *  (no margin class), kept together on one line. */
    const icon = (media, name, boxed = false) => `<span class="text-nowrap${boxed ? ' pr-1' : ''}"><img class="skill-icon-xs" src="${media}" alt=""> ${esc(name)}</span>`;
    const lines = [];
    const describe = (skillId) => {
      const folk = hiring.crew.bySkill(skillId);
      const skill = this.skills.getObjectByID(skillId);
      return { name: folk?.name ?? '?', skill: skill !== undefined ? hiring.skillName(skill) : skillId, media: skill?.media };
    };
    tracker.actions.forEach((count, skillId) => {
      const d = describe(skillId);
      lines.push({ media: d.media, html: fill(count === 1 ? 'MOD_WF_OFFLINE_LINE_ONE' : 'MOD_WF_OFFLINE_LINE', { name: d.name, skill: d.skill, count: numberWithCommas(count) }, { count: 'text-success' }, d.media) });
    });
    // The wages paid while you were away, one line a currency, its icon before the amount (the game's own "You spent"
    // line says the total without the reason); the hours as the Payroll band writes them (the user, 22 Oct 2026): the
    // Folks' hours of work in that currency (build .151), not the time away, which a Folk that stopped didn't work.
    tracker.wages.forEach((amount, currencyId) => {
      const currency = this.currencies.getObjectByID(currencyId);
      const paid = numberWithCommas(Math.floor(amount));
      const worked = (tracker.wageMs.get(currencyId) ?? 0) / 3600000;
      // A few minutes of work read "<0.1", never "0.0" (as the room's band).
      const hours = worked > 0 && worked < 0.1 ? '<0.1' : time.hoursText(worked);
      lines.push({ media: currency?.media, html: templateLangString('MOD_WF_OFFLINE_WAGES', { amount: currency?.media ? icon(currency.media, paid) : esc(paid), currency: esc(currency?.name ?? currencyId), hours }) });
    });
    // Work Orders: a delivered one green with what it paid, one gone undelivered red; the order's size icon first.
    tracker.orders.forEach(({ order, text, delivered }) => {
      const media = hiring.getMediaURL(`assets/work_order_${order.size.toLowerCase()}.webp`);
      const what = templateLangString('MOD_WF_ORDER_ASK', { qty: numberWithCommas(order.qty), item: this.items.getObjectByID(order.itemId)?.name ?? order.itemId });
      const line = delivered ? text : templateLangString('MOD_WF_ORDER_EXPIRED', { what });
      lines.push({ media, html: `<span class="text-nowrap"><img class="skill-icon-xs" src="${media}" alt=""></span> <span class="${delivered ? 'text-success' : 'text-danger'}">${esc(line)}</span>` });
    });
    // A skill a strike or a death released already has its own line: no "stopped: restock" line for it (C-10).
    const explained = new Set([...tracker.struck.map((t) => t.skillId), ...tracker.died.map((t) => t.skillId)]);
    tracker.released.forEach((skillId) => {
      if (explained.has(skillId)) return;
      // Delegated again by now: the skill went from one Folk to another (Voyage's walker taking it over), not stopped.
      const skill = this.skills.getObjectByID(skillId);
      if (skill !== undefined && hiring.isDelegated(skill)) return;
      const d = describe(skillId);
      // Stopped by a full bank and room (build .151): that reason and its fix, not "out of materials".
      const full = hiring.room?.isFull(hiring.crew.bySkill(skillId)) === true;
      lines.push({ media: d.media, html: fill('MOD_WF_OFFLINE_STOPPED', { name: d.name, skill: d.skill, why: getLangString(full ? 'MOD_WF_OFFLINE_STOPPED_ROOM_WHY' : 'MOD_WF_OFFLINE_STOPPED_WHY') }, { why: 'text-danger' }, d.media), fix: getLangString(full ? 'MOD_WF_OFFLINE_STOPPED_ROOM_FIX' : 'MOD_WF_OFFLINE_STOPPED_FIX') });
    });
    // What a Folk's room holds on your return, its skill's icon first: kept there while the bank had no free slot.
    if (hiring.room !== undefined) hiring.crew.all.forEach((folk) => {
      const held = hiring.room.heldList(folk);
      if (held.length === 0) return;
      const skill = hiring.skillOf(folk);
      const media = skill?.media;
      lines.push({ media, html: `${media ? `<span class="text-nowrap"><img class="skill-icon-xs" src="${media}" alt=""></span> ` : ''}${templateLangString('MOD_WF_OFFLINE_ROOM', { name: esc(folk.name), items: esc(hiring.room.kindsText(held)) })}` });
    });
    tracker.died.forEach(({ name, skill, media, lost }) => {
      lines.push({ media, html: `<span class="text-danger">${fill('MOD_WF_OFFLINE_DIED', { name, skill }, {}, media)}</span>` });
      // What its gear and room lost to the full bank, red under the death, as a count: the frozen slot's card lists it.
      if (lost.length > 0) lines.push({ html: `<span class="text-danger">${templateLangString('MOD_WF_OFFLINE_DIED_LOST', { name: esc(name), items: esc(hiring.room.kindsText(lost)) })}</span>` });
    });
    // Debt and strikes are reported with their state on return (a strike may have settled itself).
    tracker.debts.forEach(({ folk, skill, media }) => {
      const d = hiring.debtText(folk);
      if (d !== null) lines.push({ media, html: fill(d.loyal ? 'MOD_WF_OFFLINE_DEBT_LOYAL' : 'MOD_WF_OFFLINE_DEBT', { name: folk.name, skill, amount: d.amount, minutes: d.minutes }, { amount: 'text-danger' }, media) });
    });
    tracker.struck.forEach(({ folk, skill, media }) => {
      const currency = this.currencies.getObjectByID(folk.debtCurrency ?? 'melvorD:GP');
      // Still on strike: the amount red and how to fix it; settled itself from the bank: plain, nothing to do (build .55).
      if (folk.onStrike) {
        lines.push({ media, html: fill('MOD_WF_OFFLINE_STRUCK', { name: folk.name, skill, amount: `${numberWithCommas(folk.debt)} ${currency?.name ?? ''}`.trim() }, { amount: 'text-danger' }, media), fix: getLangString('MOD_WF_OFFLINE_STRUCK_FIX') });
      } else lines.push({ media, html: fill('MOD_WF_OFFLINE_STRUCK_SETTLED', { name: folk.name, skill }, {}, media) });
    });
    // Traits: what a Folk learned or lost while you were away, the trait's own icon first; a good one green, a bad one
    // red, a fade green (a bad trait gone).
    tracker.traits.forEach(({ folk, type, trait }) => {
      const t = hiring.traits;
      if (t === undefined) return;
      const kind = t.kindOf(trait);
      const tone = type === 'faded' ? 'text-success' : type === 'waiting' ? '' : kind === 'good' ? 'text-success' : kind === 'bad' ? 'text-danger' : '';
      const key = { learned: 'MOD_WF_TRAIT_LEARNED', waiting: 'MOD_WF_TRAIT_WAITING', slotted: 'MOD_WF_TRAIT_SLOTTED', faded: 'MOD_WF_TRAIT_FADED' }[type];
      if (key === undefined) return;
      const text = fill(key, { name: folk.name, trait: t.nameOf(trait), effect: (t.effectAfter ?? t.effectOf)(trait) }, tone === '' ? {} : { trait: tone });
      lines.push({ html: `<span class="text-nowrap"><img class="skill-icon-xs" src="${t.mediaOf(trait)}" alt=""></span> ${text}` });
    });
    // The header: icon and text on one centred flex row. The lines: plain centred text that wraps, the icon inline.
    const header = createElement('h5', { className: 'd-flex align-items-center justify-content-center font-w600 mb-1 mt-3', parent: container });
    header.innerHTML = `<img class="skill-icon-xs mr-1" src="${hiring.media}" alt=""><span>${esc(getLangString('MOD_WF_OFFLINE_HEADER'))}</span>`;
    const row = (className, html) => { createElement('h5', { className, parent: container }).innerHTML = html; };
    lines.forEach((line) => {
      row('font-w600 mb-1', line.html);
      if (line.fix) row('font-w400 mb-2', esc(line.fix));
    });
    log(`offline: ${ticks} ticks, ${tracker.actions.size} delegated skill(s) acted`);
  });

  ctx.onCharacterLoaded(() => {
    hiring.events.on('folkActionDone', ({ skill, intervalMs }) => {
      if (!tracker.active) return;
      tracker.actions.set(skill.id, (tracker.actions.get(skill.id) ?? 0) + 1);
      // The hours of work wages are paid for, by the currency they're paid in.
      const currencyId = hiring.payroll?.enabled !== false ? hiring.payroll?.currencyIdFor(skill) : undefined;
      if (currencyId !== undefined && intervalMs > 0) tracker.wageMs.set(currencyId, (tracker.wageMs.get(currencyId) ?? 0) + intervalMs);
    });
    hiring.events.on('folkReleased', ({ skill }) => {
      if (!tracker.active) return;
      tracker.released.add(skill.id);
    });
    hiring.events.on('folkDied', ({ folk, skill }) => {
      if (!tracker.active) return;
      // The room was emptied on folkFired, just before this event: what it lost is noted on the frozen slot.
      const lost = hiring.room === undefined ? [] : hiring.crew.lostAt(folk.slot);
      tracker.died.push({ name: folk.name, skill: skill === undefined ? '' : hiring.skillName(skill), media: skill?.media, skillId: skill?.id, lost });
    });
    hiring.events.on('folkInDebt', ({ folk, skill }) => {
      if (!tracker.active) return;
      tracker.debts.push({ folk, skill: hiring.skillName(skill), media: skill?.media });
    });
    hiring.events.on('folkStruck', ({ folk, skill }) => {
      if (!tracker.active) return;
      tracker.struck.push({ folk, skill: hiring.skillName(skill), media: skill?.media, skillId: skill?.id });
    });
    hiring.events.on('folkTrait', ({ folk, type, trait }) => {
      if (!tracker.active) return;
      tracker.traits.push({ folk, type, trait });
    });
    hiring.events.on('folkPaid', ({ currencyId, amount }) => {
      if (!tracker.active) return;
      tracker.wages.set(currencyId, (tracker.wages.get(currencyId) ?? 0) + amount);
    });
    // Work Orders delivered (green) or gone undelivered (red) while you were away.
    hiring.events.on('orderDelivered', ({ order, text }) => {
      if (tracker.active) tracker.orders.push({ order, text, delivered: true });
    });
    hiring.events.on('orderExpired', ({ order }) => {
      if (tracker.active) tracker.orders.push({ order, delivered: false });
    });
  });
}
