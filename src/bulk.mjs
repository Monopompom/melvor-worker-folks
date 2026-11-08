// Stop all, Restart all, Restock all and Settle all: four buttons under the Overview's At work list (build .218, joint
// order round 2). Each does for the whole crew what a card's own button does for one Folk, through the same code:
// stopFolk, the room's start and Restock, payroll's settle. Stop and Restart act at once (Restart all undoes Stop
// all: each skill starts again on what its Folk last started on); Restock all and Settle all show their bill first.
// Nothing goes in the save. Game-facing; the rules are in bulk-model.mjs.

export function install(ctx, { getHiring, model, time, popupDidRender, tips, log }) {
  let hiring;
  /** Called once a bulk action has run (the Overview redraws). */
  let after = () => {};
  ctx.onModsLoaded(() => { hiring = getHiring(); });

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const notify = (kind, text) => {
    const n = hiring.game.notifications;
    if (kind === 'success') n.createSuccessNotification('worker_folks:bulk', text, hiring.media);
    else if (kind === 'error') n.createErrorNotification('worker_folks:bulk', text);
    else n.createInfoNotification('worker_folks:bulk', text, hiring.media);
  };
  /** "Ingrid stopped." for one, "3 Folks stopped." for more. */
  const done = (key, folks) => (folks.length === 1
    ? templateLangString(`${key}_ONE`, { name: folks[0].name })
    : templateLangString(key, { count: `${folks.length}` }));
  const names = (folks) => folks.map((f) => f.name).join(', ');
  const swalClass = (cls) => (typeof createSwalCustomClass === 'function' ? createSwalCustomClass(cls) : cls);
  const room = () => hiring.room;

  const rowOf = (folk) => {
    const skill = hiring.skillOf(folk);
    const working = skill !== undefined && hiring.delegated.has(skill);
    return {
      folk,
      skill,
      working,
      hasSkill: skill !== undefined,
      // May start now: not on strike or cooldown, its skill free (not yours) and nothing refusing it there.
      available: skill !== undefined && !working && !skill.isActive && hiring.folkAvailable(folk) && hiring.workRefusal(folk, skill) === '',
      onStrike: folk.onStrike === true,
      ownStock: room()?.usesStock(folk) === true,
      onHaul: room()?.onHaul(folk) === true,
    };
  };
  const rows = () => hiring.crew.all.map(rowOf);

  /** What the buttons show: counts, and whether Restock all and Settle all have a place at all. */
  const view = () => {
    const all = rows();
    const c = model.counts(all);
    return {
      ...c,
      // Restock all only once some Folk works from its own stock; Settle all only while wages are on.
      showRestock: all.some((r) => r.ownStock),
      showSettle: hiring.payroll?.enabled !== false,
    };
  };

  // ---- Stop all, Restart all: at once ----

  const stopAll = () => {
    const stopped = [];
    for (const r of rows()) {
      if (!r.working) continue;
      try { hiring.stopFolk(r.folk); } catch (err) { log('stop all: stop failed', r.folk.name, err); }
      if (!hiring.delegated.has(r.skill)) stopped.push(r.folk);
    }
    if (stopped.length > 0) notify('info', done('MOD_WF_BULK_STOPPED', stopped));
    log(`stop all: ${stopped.length} stopped`);
  };

  const restartAll = () => {
    const started = [];
    const misses = [];
    for (const r of rows()) {
      if (r.working || !r.hasSkill || !hiring.folkAvailable(r.folk)) continue;
      const why = room()?.startFolk(r.folk, hiring.lastPick?.(r.skill) ?? null) ?? 'notStarted';
      if (why === '') started.push(r.folk);
      else misses.push({ why, name: r.folk.name });
    }
    if (started.length > 0) notify('success', done('MOD_WF_BULK_STARTED', started));
    if (misses.length > 0) {
      const lines = model.byReason(misses).map(([why, list]) => templateLangString(`MOD_WF_BULK_WHY_${why}`, { names: list.join(', ') }));
      notify(started.length > 0 ? 'info' : 'error', lines.join(' '));
    }
    log(`restart all: ${started.length} started, ${misses.length} not`);
  };

  // ---- Restock all, Settle all: the bill first ----

  /** Each Folk's Restock in crew order, every later one reading the bank the earlier ones left. */
  const restockBill = () => {
    const bank = model.runningBank((id) => hiring.game.bank.getQty(hiring.game.items.getObjectByID(id)));
    const fill = [];
    const nothing = [];
    for (const r of rows()) {
      if (!r.ownStock || r.onHaul) continue;
      const plan = room().restockPlanOf(r.folk, bank.qty);
      if (plan === undefined || plan.actions === 0) { nothing.push(r.folk); continue; }
      plan.items.forEach(({ itemId, qty }) => bank.take(itemId, qty));
      fill.push({ folk: r.folk, actions: plan.actions, ms: plan.ms, items: plan.items.map(({ itemId, qty }) => ({ id: itemId, qty })) });
    }
    return { fill, nothing, total: model.mergeItems(fill.map((f) => f.items)) };
  };

  const line = (text, cls = '') => el('div', `wf-bulk-line ${cls}`.trim(), text);
  const hoursOf = (ms) => { const h = ms / 3_600_000; return h > 0 && h < 0.1 ? '<0.1' : time.hoursText(h); };

  const confirm = ({ title, body, go, ok, onConfirm }) => {
    SwalLocale.fire({
      didRender: popupDidRender,
      title,
      width: '32rem',
      html: body,
      showCancelButton: true,
      focusCancel: !ok,
      confirmButtonText: go,
      cancelButtonText: getLangString('MOD_WF_BUTTON_CANCEL'),
      customClass: swalClass({ popup: 'wf-ui', confirmButton: 'btn btn-success m-1', cancelButton: 'btn btn-outline-primary m-1' }),
      didOpen: () => {
        room()?.tipTiles?.(Swal.getHtmlContainer());
        if (!ok) { const b = Swal.getConfirmButton(); if (b) b.disabled = true; }
      },
      // A tile's tooltip shown as the popup closes would stay on screen once its tile is gone.
      willClose: () => Swal.getHtmlContainer()?.querySelectorAll('[data-wf-item]').forEach((e) => tips?.clear(e)),
    }).then((result) => {
      if (!result.isConfirmed) return;
      try { onConfirm(); } catch (err) { log('bulk confirm failed', err); }
      hiring.renderQueue.folks = true;
      after();
    });
  };

  const restockAll = () => {
    const bill = restockBill();
    const body = el('div', 'text-center wf-help-body wf-bulk');
    if (bill.fill.length === 0) body.append(line(getLangString('MOD_WF_BULK_RESTOCK_NOTHING'), 'wf-subtle'));
    else {
      body.append(line(getLangString('MOD_WF_BULK_RESTOCK_HEAD'), 'font-w600'));
      const tiles = el('div');
      tiles.innerHTML = room().itemTiles(bill.total, { small: true });
      body.append(tiles);
      for (const f of bill.fill) body.append(line(templateLangString('MOD_WF_BULK_RESTOCK_LINE', { name: f.folk.name, hours: hoursOf(f.ms) })));
    }
    if (bill.nothing.length > 0) body.append(line(templateLangString('MOD_WF_BULK_RESTOCK_SKIP', { names: names(bill.nothing) }), 'wf-subtle'));
    confirm({
      title: getLangString('MOD_WF_BULK_RESTOCK'),
      body,
      go: getLangString('MOD_WF_BUTTON_RESTOCK'),
      ok: bill.fill.length > 0,
      onConfirm: () => {
        // Each Folk's own Restock, capped at the bill's actions: the bank may have changed while the popup was open.
        const filled = bill.fill.filter((f) => room().restockResult(f.folk, f.actions, { quiet: true }).ok).map((f) => f.folk);
        if (filled.length > 0) notify('success', done('MOD_WF_BULK_RESTOCKED', filled));
        if (filled.length < bill.fill.length) notify('error', templateLangString('MOD_WF_BULK_RESTOCK_FAILED', { names: names(bill.fill.map((f) => f.folk).filter((f) => !filled.includes(f))) }));
        log(`restock all: ${filled.length} of ${bill.fill.length}`);
      },
    });
  };

  const amountText = (parts) => Object.entries(parts)
    .map(([id, amount]) => `${numberWithCommas(Math.ceil(amount))} ${hiring.game.currencies.getObjectByID(id)?.name ?? id}`).join(' + ');

  const settleAll = () => {
    const payroll = hiring.payroll;
    const strikers = rows().filter((r) => r.onStrike).map((r) => r.folk);
    // Only what can be paid now: demands met, nothing refusing it (Voyage: you stand by the Folk), the money there.
    const open = strikers.filter((f) => payroll.canSettle(f) && hiring.refusal('staff', { action: 'settle', folk: f }) === '');
    const parts = new Map(open.map((f) => [f, payroll.settlementOf(f).parts]));
    const { pay } = model.payable(open.map((f) => ({ key: f, parts: parts.get(f) })), (id) => hiring.game.currencies.getObjectByID(id)?.amount ?? 0);
    const left = strikers.filter((f) => !pay.includes(f));
    const body = el('div', 'text-center wf-help-body wf-bulk');
    if (pay.length === 0) body.append(line(getLangString('MOD_WF_BULK_SETTLE_NOTHING'), 'wf-subtle'));
    else {
      body.append(line(getLangString('MOD_WF_BULK_SETTLE_HEAD'), 'font-w600'));
      for (const f of pay) {
        const demands = (f.demand?.length ?? 0) > 0 ? getLangString('MOD_WF_BULK_SETTLE_DEMANDS') : '';
        body.append(line(templateLangString('MOD_WF_BULK_SETTLE_LINE', { name: f.name, amount: amountText(parts.get(f)), demands })));
      }
      const total = model.payable(pay.map((f) => ({ key: f, parts: parts.get(f) })), () => Infinity).total;
      if (pay.length > 1) body.append(line(templateLangString('MOD_WF_BULK_SETTLE_TOTAL', { amount: amountText(total) }), 'font-w600 wf-bulk-total'));
    }
    if (left.length > 0) body.append(line(templateLangString('MOD_WF_BULK_SETTLE_LEFT', { names: names(left) }), 'wf-subtle'));
    confirm({
      title: getLangString('MOD_WF_BULK_SETTLE'),
      body,
      go: getLangString('MOD_WF_BUTTON_SETTLE'),
      ok: pay.length > 0,
      onConfirm: () => {
        // payroll.settle asks again, so a settlement the bank no longer covers is left as it is.
        const settled = pay.filter((f) => payroll.settle(f));
        if (settled.length > 0) notify('success', done('MOD_WF_BULK_SETTLED', settled));
        if (settled.length < pay.length) notify('error', templateLangString('MOD_WF_BULK_SETTLE_FAILED', { names: names(pay.filter((f) => !settled.includes(f))) }));
        log(`settle all: ${settled.length} of ${pay.length}`);
      },
    });
  };

  const run = (kind, onDone) => {
    if (hiring === undefined) return;
    after = typeof onDone === 'function' ? onDone : () => {};
    try {
      ({ stop: stopAll, restart: restartAll, restock: restockAll, settle: settleAll })[kind]?.();
    } catch (err) {
      log(`bulk ${kind} failed`, err);
    }
    hiring.renderQueue.folks = true;
    after();
  };

  return { view, run };
}
