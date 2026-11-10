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
      // A gathering skill (Fishing, Woodcutting…) has no recipe costs: there is nothing to restock it with.
      noInputs: skill !== undefined && typeof skill.getCurrentRecipeCosts !== 'function',
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
    const noInputs = [];
    for (const r of rows()) {
      if (!r.ownStock || r.onHaul) continue;
      // Said apart: "room full or no inputs in your bank" would send you to the bank for a skill that takes nothing.
      if (r.noInputs) { noInputs.push(r); continue; }
      const plan = room().restockPlanOf(r.folk, bank.qty);
      if (plan === undefined || plan.actions === 0) { nothing.push(r.folk); continue; }
      plan.items.forEach(({ itemId, qty }) => bank.take(itemId, qty));
      fill.push({ folk: r.folk, actions: plan.actions, ms: plan.ms, items: plan.items.map(({ itemId, qty }) => ({ id: itemId, qty })) });
    }
    return { fill, nothing, noInputs, total: model.mergeItems(fill.map((f) => f.items)) };
  };

  const line = (text, cls = '') => el('div', `wf-bulk-line ${cls}`.trim(), text);
  // Under 0.1 h the time is said in whole minutes ("+4 min"), never "+<0.1 h", which read as two signs in a row.
  const workTime = (ms) => {
    const h = ms / 3_600_000;
    if (h > 0 && h < 0.1) return templateLangString('MOD_WF_BULK_RESTOCK_MIN', { minutes: `${Math.max(1, Math.ceil(ms / 60_000))}` });
    return templateLangString('MOD_WF_BULK_RESTOCK_TIME', { hours: time.hoursText(h) });
  };

  // A bill that can change while it is open (watch) is asked again this often; it is drawn again only when it changed.
  const WATCH_MS = 500;

  const confirm = ({ title, body, go, ok, onConfirm, watch }) => {
    let timer;
    const clearTips = () => Swal.getHtmlContainer()?.querySelectorAll('[data-wf-item]').forEach((e) => tips?.clear(e));
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
        if (typeof watch === 'function') {
          timer = setInterval(() => {
            try {
              // Another popup fired over this one: stop watching, never draw into it.
              const box = Swal.getHtmlContainer();
              if (!Swal.isVisible() || !box?.querySelector('.wf-bulk')) { clearInterval(timer); return; }
              const next = watch();
              if (next === null) return;
              clearTips();
              box.replaceChildren(next.body);
              room()?.tipTiles?.(box);
              const b = Swal.getConfirmButton();
              if (b) b.disabled = !next.ok;
            } catch (err) {
              clearInterval(timer);
              log('bulk bill refresh failed', err);
            }
          }, WATCH_MS);
        }
      },
      // A tile's tooltip shown as the popup closes would stay on screen once its tile is gone.
      willClose: () => { clearInterval(timer); clearTips(); },
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
      // A name bold, a time bold blue, as message popups write them.
      for (const f of bill.fill) {
        const time = esc(workTime(f.ms));
        body.append(richLine('MOD_WF_BULK_RESTOCK_LINE', { name: `<span class="font-w600">${esc(f.folk.name)}</span>`, time: `<span class="font-w600 text-info">${time}</span>` }));
      }
    }
    if (bill.nothing.length > 0) body.append(line(templateLangString('MOD_WF_BULK_RESTOCK_SKIP', { names: names(bill.nothing) }), 'wf-subtle'));
    for (const r of bill.noInputs) body.append(line(templateLangString('MOD_WF_BULK_RESTOCK_NO_INPUTS', { name: r.folk.name, skill: hiring.skillName(r.skill) }), 'wf-subtle'));
    confirm({
      title: getLangString('MOD_WF_BULK_RESTOCK'),
      body,
      go: getLangString('MOD_WF_BUTTON_RESTOCK'),
      ok: bill.fill.length > 0,
      onConfirm: () => {
        // Each Folk's own Restock, capped at the bill's actions: the bank may have changed while the popup was open. A
        // Folk let go meanwhile is left out.
        const still = bill.fill.filter((f) => hiring.crew.all.includes(f.folk));
        const filled = still.filter((f) => room().restockResult(f.folk, f.actions, { quiet: true }).ok).map((f) => f.folk);
        if (filled.length > 0) notify('success', done('MOD_WF_BULK_RESTOCKED', filled));
        if (filled.length < still.length) notify('error', templateLangString('MOD_WF_BULK_RESTOCK_FAILED', { names: names(still.map((f) => f.folk).filter((f) => !filled.includes(f))) }));
        log(`restock all: ${filled.length} of ${bill.fill.length}`);
      },
    });
  };

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  /** A price as message popups write it: the currency's icon, then the amount bold amber ("[GP] 91,400 + [SC] 12"). */
  const amountHtml = (parts) => Object.entries(parts).map(([id, amount]) => {
    const c = hiring.game.currencies.getObjectByID(id);
    const icon = c?.media ? `<img class="skill-icon-xs mr-1" src="${esc(c.media)}" alt="${esc(c.name)}">` : '';
    return `${icon}<span class="font-w600 text-warning">${numberWithCommas(Math.ceil(amount))}</span>${c?.media ? '' : ` ${esc(c?.name ?? id)}`}`;
  }).join(' + ');
  /** A line from a language string whose values are HTML (names bold, prices as above); the string itself is escaped. */
  const richLine = (key, values, cls = '') => {
    const e = el('div', `wf-bulk-line ${cls}`.trim());
    const marks = Object.keys(values).map((k, i) => [k, `\u0001${i}\u0001`]);
    let text = esc(templateLangString(key, Object.fromEntries(marks)));
    marks.forEach(([k, m]) => { text = text.split(m).join(values[k]); });
    e.innerHTML = text;
    return e;
  };

  /** Who Settle all pays now, in crew order, and who it can't; `key` changes whenever the bill would read differently. */
  const settleBill = () => {
    const payroll = hiring.payroll;
    const strikers = rows().filter((r) => r.onStrike).map((r) => r.folk);
    // Only what can be paid now: demands met, nothing refusing it (Voyage: you stand by the Folk), the money there.
    const open = strikers.filter((f) => payroll.canSettle(f) && hiring.refusal('staff', { action: 'settle', folk: f }) === '');
    const parts = new Map(open.map((f) => [f, payroll.settlementOf(f).parts]));
    const { pay } = model.payable(open.map((f) => ({ key: f, parts: parts.get(f) })), (id) => hiring.game.currencies.getObjectByID(id)?.amount ?? 0);
    // Each one left out says why (an in-game test, 10 Nov 2026: it named them and never said why).
    const left = strikers.filter((f) => !pay.includes(f)).map((f) => ({
      folk: f,
      why: model.settleWhy({
        refused: hiring.refusal('staff', { action: 'settle', folk: f }) !== '',
        walking: f.travel === 'walking',
        demandsPending: payroll.demandsPending(f),
      }),
    }));
    const at = (f) => hiring.crew.all.indexOf(f);
    const key = JSON.stringify([pay.map((f) => [at(f), parts.get(f), (f.demand?.length ?? 0) > 0]), left.map((l) => [at(l.folk), l.why])]);
    return { pay, left, parts, key };
  };

  const settleBody = ({ pay, left, parts }) => {
    const body = el('div', 'text-center wf-help-body wf-bulk');
    // With someone left out, its heading and reasons say it all; the "can't pay any" line only for a bill of nothing.
    if (pay.length === 0 && left.length === 0) body.append(line(getLangString('MOD_WF_BULK_SETTLE_NOTHING'), 'wf-subtle'));
    else if (pay.length > 0) {
      body.append(line(getLangString('MOD_WF_BULK_SETTLE_HEAD'), 'font-w600'));
      // A table centred on its middle line (the user, 10 Nov 2026): names flush right against the amounts, amounts flush
      // left, so the amounts start in one column however long the names are.
      const table = el('table', 'wf-bulk-table');
      const row = (nameHtml, amount, cls = '') => {
        const tr = el('tr', cls);
        const name = el('td', 'wf-bulk-name');
        name.innerHTML = nameHtml;
        const pays = el('td', 'wf-bulk-amount');
        pays.innerHTML = amount;
        tr.append(name, pays);
        table.append(tr);
      };
      for (const f of pay) {
        const demands = (f.demand?.length ?? 0) > 0 ? ` ${esc(getLangString('MOD_WF_BULK_SETTLE_DEMANDS'))}` : '';
        row(esc(f.name), `${amountHtml(parts.get(f))}${demands}`);
      }
      const total = model.payable(pay.map((f) => ({ key: f, parts: parts.get(f) })), () => Infinity).total;
      if (pay.length > 1) row(esc(getLangString('MOD_WF_BULK_SETTLE_TOTAL')), amountHtml(total), 'wf-bulk-total');
      body.append(table);
    }
    // Who it leaves out, under a heading like "You pay:" (the user, 10 Nov 2026): one row a Folk, the name flush right
    // and its reason flush left, as the table above.
    if (left.length > 0) {
      body.append(line(getLangString('MOD_WF_BULK_SETTLE_LEFT_HEAD'), 'font-w600 wf-bulk-head'));
      const table = el('table', 'wf-bulk-table');
      for (const { folk, why } of left) {
        const tr = el('tr');
        tr.append(el('td', 'wf-bulk-name', folk.name), el('td', 'wf-bulk-why wf-subtle', getLangString(`MOD_WF_BULK_SETTLE_WHY_${why}`)));
        table.append(tr);
      }
      body.append(table);
    }
    return body;
  };

  const settleAll = () => {
    const payroll = hiring.payroll;
    let bill = settleBill();
    confirm({
      title: getLangString('MOD_WF_BULK_SETTLE'),
      body: settleBody(bill),
      go: getLangString('MOD_WF_BUTTON_SETTLE'),
      ok: bill.pay.length > 0,
      // A strike settled while the bill is open (the mastery pool's self-settle, or the card), a new strike, a Folk let
      // go or a wallet that changed: the bill is drawn again, so its lines and Confirm say what Confirm will do.
      watch: () => {
        const next = settleBill();
        if (next.key === bill.key) return null;
        bill = next;
        return { body: settleBody(bill), ok: bill.pay.length > 0 };
      },
      onConfirm: () => {
        // The bill may be up to one refresh old: a Folk settled or let go since is left out (its own notice already
        // said so), and payroll.settle asks again, so a settlement the bank no longer covers is left as it is.
        const pay = bill.pay;
        const still = pay.filter((f) => f.onStrike === true && hiring.crew.all.includes(f));
        const settled = still.filter((f) => payroll.settle(f));
        if (settled.length > 0) notify('success', done('MOD_WF_BULK_SETTLED', settled));
        if (settled.length < still.length) notify('error', templateLangString('MOD_WF_BULK_SETTLE_FAILED', { names: names(still.filter((f) => !settled.includes(f))) }));
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
