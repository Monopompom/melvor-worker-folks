// Folk moments on the game side (joint order round 5, API v13): the registry of moments, ours and other mods'; the
// crew-wide clock that opens one now and then; answering one, from the card or the away popup, or its default when it
// runs out; and the "While you were away" queue that opens each waiting item once the game's own popups have closed.
// The rules are in moments-model.mjs. Game-facing.

/** How often the away queue looks whether the game's popups have closed. */
const IDLE_POLL_MS = 300;
/** It waits this long after a push, so the game's Welcome Back, queued just after, goes first. */
const SETTLE_MS = 1000;
/** The game's tick. */
const TICK_MS = 50;
const AWAY_ID = 'worker_folks:moments';
const BUTTON_CLASS = { go: 'btn-success', risk: 'btn-warning', no: 'btn-outline-info' };

export function install(ctx, { getHiring, model, time, tips, swalClass, popupDidRender, rand = Math.random, log }) {
  let hiring;
  /** Ticks since the last look (each CHECK_MS of game time). */
  let ticks = 0;
  const checkTicks = Math.round(model.CHECK_MS / TICK_MS);
  /** Away from the game: what ran out ({ name, text, label, hint }) and how many opened. */
  let awayLog = [];
  let awayOpened = 0;
  /** Registered moments by id. */
  const defs = new Map();
  /** Waiting away items: [{ item, rank }] (model.queueAway). */
  let away = [];
  let draining = false;

  /** No popup of the game's is open or queued, and no other Swal shows. */
  const idle = () => {
    try {
      // modalQueue and modalIsOpen are the game's own top-level names (main.js).
      // eslint-disable-next-line no-undef
      const queued = typeof modalQueue !== 'undefined' ? modalQueue.length : 0;
      // eslint-disable-next-line no-undef
      const open = typeof modalIsOpen !== 'undefined' && modalIsOpen === true;
      const swal = typeof Swal !== 'undefined' && Swal.isVisible();
      return queued === 0 && !open && !swal && globalThis.game?._isInOnlineLoop !== false;
    } catch {
      return false;
    }
  };
  const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
  /** Resolves once the game has been idle for two looks in a row. */
  const untilIdle = async () => {
    let calm = 0;
    while (calm < 2) {
      await wait(IDLE_POLL_MS);
      calm = idle() ? calm + 1 : 0;
    }
  };
  /** Opens each waiting item in turn, each after the last one's board has closed. */
  const drain = async () => {
    if (draining) return;
    draining = true;
    try {
      await wait(SETTLE_MS);
      while (away.length > 0) {
        await untilIdle();
        const [{ item }] = away;
        away = away.slice(1);
        try {
          await item.open();
        } catch (e) {
          log(`away item ${item.id} failed: ${e?.message ?? e}`);
        }
      }
    } finally {
      draining = false;
    }
  };

  // ---- Reading a moment ------------------------------------------------------

  const safeText = (value, folk) => {
    try {
      return String((typeof value === 'function' ? value(folk) : value) ?? '');
    } catch (e) {
      log(`moment text failed: ${e?.message ?? e}`);
      return '';
    }
  };
  /** The Folk's open moment and its def, or undefined (none, or its mod isn't loaded: it waits). */
  const openOf = (folk) => {
    const m = folk?.moment;
    if (m === null || m === undefined) return undefined;
    const def = defs.get(m.id);
    return def === undefined ? undefined : { moment: m, def };
  };
  const answersOf = (folk, def) => def.answers.map((a, i) => ({
    id: a.id,
    label: safeText(a.label, folk),
    hint: safeText(a.hint, folk),
    why: a.why === undefined ? '' : safeText(a.why, folk),
    tone: model.toneOf(a, i),
  }));
  const notify = (kind, text, folk) => {
    try {
      game.notifications[kind]('worker_folks:moment', text, hiring.portraitOf(folk));
    } catch (e) {
      log(`moment notice failed: ${e?.message ?? e}`);
    }
  };
  const changed = (folk) => {
    hiring.markCard(folk);
    hiring.crew.touch?.();
  };

  // ---- Opening, answering, running out --------------------------------------

  /** Opens `def` on `folk` (its one moment). */
  const open = (folk, def) => {
    const offline = !game._isInOnlineLoop;
    const moment = { id: def.id, leftMs: def.lifeMs };
    if (typeof def.partner === 'function') {
      const other = def.partner(folk);
      if (typeof other === 'string' && other !== '') moment.with = other;
    }
    folk.moment = moment;
    log(`${folk.name}: moment ${def.id} opens`);
    hiring.events.emit('momentOpened', { folk, id: def.id, offline });
    if (offline) awayOpened += 1;
    else notify('createInfoNotification', templateLangString('MOD_WF_MOMENT_NOTICE', { name: folk.name }), folk);
    changed(folk);
  };

  /** A Folk that fits some moment, picked by the moments' weights; opened. False when none fits. */
  const openOne = () => {
    const candidates = [];
    for (const folk of hiring.crew.all) {
      if (folk.moment !== null && folk.moment !== undefined) continue;
      for (const def of defs.values()) {
        try {
          if (def.fits(folk) === true) candidates.push({ folk, def, weight: def.weight });
        } catch (e) {
          log(`moment ${def.id} fits failed: ${e?.message ?? e}`);
        }
      }
    }
    const pick = model.pickWeighted(candidates, rand);
    if (pick === undefined) return false;
    open(pick.folk, pick.def);
    return true;
  };

  /**
   * Takes answer `answerId` of the Folk's open moment: the moment closes, then its effect applies. A greyed answer is
   * refused unless it is the default taken when the moment runs out. Returns true when it was taken.
   */
  const answer = (folk, answerId, { expired = false } = {}) => {
    const found = openOf(folk);
    if (found === undefined) return false;
    const { moment, def } = found;
    const a = def.answers.find((x) => x.id === answerId);
    if (a === undefined) return false;
    if (!expired && a.why !== undefined && safeText(a.why, folk) !== '') return false;
    const offline = !game._isInOnlineLoop;
    folk.moment = null;
    try {
      a.apply(folk, { offline, expired, with: moment.with });
    } catch (e) {
      log(`moment ${def.id} answer ${a.id} failed: ${e?.message ?? e}`);
    }
    log(`${folk.name}: moment ${def.id} answered ${a.id}${expired ? ' (ran out)' : ''}`);
    hiring.events.emit('momentAnswered', { folk, id: def.id, answer: a.id, expired, offline });
    changed(folk);
    return true;
  };

  /** A moment ran out: its default answer, said in a notice or kept for the away popup. One whose mod is gone just closes. */
  const runOut = (folk) => {
    const found = openOf(folk);
    if (found === undefined) {
      folk.moment = null;
      changed(folk);
      return;
    }
    const { def } = found;
    const a = def.answers.find((x) => x.id === def.defaultAnswer);
    const line = { name: folk.name, text: safeText(def.text, folk), label: safeText(a.label, folk), hint: safeText(a.hint, folk) };
    if (!answer(folk, def.defaultAnswer, { expired: true })) return;
    if (!game._isInOnlineLoop) awayLog.push(line);
    else notify('createInfoNotification', templateLangString('MOD_WF_MOMENT_RAN_OUT', { name: line.name, answer: line.label }), folk);
  };

  /** Each CHECK_MS of game time: open moments age and run out; a used-up gap looks for a Folk. */
  const check = () => {
    const folks = hiring.crew.all;
    if (folks.length === 0) return;
    for (const folk of folks) {
      if (folk.moment === null || folk.moment === undefined) continue;
      const aged = model.ageMoment(folk.moment, model.CHECK_MS);
      if (aged.expired) runOut(folk);
      else {
        folk.moment = aged.moment;
        hiring.markCard(folk); // its time left
      }
    }
    const clock = hiring.crew.moments;
    const next = model.runClock(clock.gapMs, model.CHECK_MS, rand);
    const gapMs = next.due ? (openOne() ? model.rollGap(rand) : 0) : next.gapMs;
    hiring.crew.moments = { ...clock, gapMs };
  };

  ctx.patch(Game, 'tick').after(function () {
    if (hiring?.crew === undefined) return;
    ticks += 1;
    if (ticks < checkTicks) return;
    ticks = 0;
    try {
      check();
    } catch (e) {
      log(`moments check failed: ${e?.message ?? e}`);
    }
  });

  // ---- What the card and the popup show -------------------------------------

  /** One answer's button: its label, what it does under it, its colour; greyed with its reason as a tooltip and toast. */
  const answerButton = (folk, a, after) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn btn-sm ${BUTTON_CLASS[a.tone]} wf-pay`;
    const label = document.createElement('span');
    label.textContent = a.label;
    b.append(label);
    if (a.hint !== '') {
      const hint = document.createElement('small');
      hint.textContent = a.hint;
      b.append(hint);
    }
    const off = a.why !== '';
    b.classList.toggle('disabled', off);
    b.setAttribute('aria-disabled', `${off}`);
    tips?.set(b, a.why);
    b.onclick = () => {
      if (off) { notify('createErrorNotification', a.why, folk); return; }
      if (answer(folk, a.id)) after?.();
    };
    return b;
  };

  /** The card's alert row: { text, left, answers, key, fill(box) }, or null. */
  const cardView = (folk) => {
    const found = openOf(folk);
    if (found === undefined) return null;
    const { moment, def } = found;
    const answers = answersOf(folk, def);
    const fallback = answers.find((a) => a.id === def.defaultAnswer);
    return {
      text: safeText(def.text, folk),
      left: templateLangString('MOD_WF_MOMENT_LEFT', { time: time.shortTime(moment.leftMs), answer: fallback?.label ?? '' }),
      // Buttons are rebuilt only when what they show changes.
      key: JSON.stringify([folk.id, moment.id, answers]),
      fill: (box) => {
        box.replaceChildren(...answers.map((a) => answerButton(folk, a)));
        box.classList.toggle('wf-pay-row-3', answers.length === 3);
      },
    };
  };

  /** The popup's body: what ran out while away, then each moment still open with its buttons. */
  const awayBody = (lines, rerender) => {
    const box = document.createElement('div');
    box.className = 'text-left wf-moments-away';
    const head = (key) => {
      const h = document.createElement('div');
      h.className = 'font-w600 wf-subtle mt-2 mb-1';
      h.textContent = getLangString(key);
      return h;
    };
    const row = (name, text) => {
      const r = document.createElement('div');
      r.className = 'wf-alert-row';
      const who = document.createElement('div');
      who.className = 'font-w600';
      who.textContent = name;
      const q = document.createElement('div');
      q.textContent = text;
      r.append(who, q);
      return r;
    };
    if (lines.length > 0) {
      box.append(head('MOD_WF_MOMENTS_ANSWERED'));
      const list = document.createElement('div');
      lines.forEach((l) => {
        const r = row(l.name, l.text);
        const took = document.createElement('small');
        took.className = 'd-block text-warning';
        took.textContent = templateLangString('MOD_WF_MOMENT_TOOK', { answer: l.hint === '' ? l.label : `${l.label} (${l.hint})` });
        r.append(took);
        list.append(r);
      });
      box.append(list);
    }
    const waiting = hiring.crew.all.filter((f) => openOf(f) !== undefined);
    if (waiting.length > 0) {
      box.append(head('MOD_WF_MOMENTS_WAITING'));
      const list = document.createElement('div');
      waiting.forEach((folk) => {
        const { def } = openOf(folk);
        const r = row(folk.name, safeText(def.text, folk));
        const answers = answersOf(folk, def);
        const buttons = document.createElement('div');
        buttons.className = `wf-pay-row mt-2${answers.length === 3 ? ' wf-pay-row-3' : ''}`;
        buttons.append(...answers.map((a) => answerButton(folk, a, rerender)));
        r.append(buttons);
        list.append(r);
      });
      box.append(list);
    }
    return box;
  };

  /** The away popup's own item (rank 0): resolves when it closes. */
  const awayItem = (lines) => ({
    id: AWAY_ID,
    title: () => getLangString('MOD_WF_MOMENTS_AWAY_TITLE'),
    open: () => new Promise((resolve) => {
      let shown;
      const rerender = () => {
        const html = typeof Swal !== 'undefined' ? Swal.getHtmlContainer?.() : null;
        if (html === null || html === undefined) return;
        shown = awayBody(lines, rerender);
        html.replaceChildren(shown);
      };
      shown = awayBody(lines, rerender);
      SwalLocale.fire({
        title: getLangString('MOD_WF_MOMENTS_AWAY_TITLE'),
        html: shown,
        width: '32rem',
        confirmButtonText: getLangString(away.length > 0 ? 'MOD_WF_BUTTON_NEXT' : 'MOD_WF_BUTTON_CLOSE'),
        customClass: swalClass?.(),
        didRender: popupDidRender,
      }).then(() => resolve(), () => resolve());
    }),
  });

  ctx.patch(Game, 'enterOfflineLoop').after(function () {
    awayLog = [];
    awayOpened = 0;
  });
  ctx.patch(Game, 'exitOfflineLoop').after(function () {
    if (hiring?.crew === undefined) return;
    const lines = awayLog;
    const opened = awayOpened;
    awayLog = [];
    awayOpened = 0;
    if (lines.length === 0 && opened === 0) return;
    api.awayPush(awayItem(lines), 0);
  });

  const api = {
    /**
     * Registers a moment. `wrap(folk)` gives what the def's callbacks see (the API passes a Folk view); our own
     * moments pass none and see the record. Throws on a bad def. Returns the function that removes it.
     */
    register(def, wrap) {
      const problem = model.checkMomentDef(def);
      if (problem !== undefined) throw new Error(problem);
      const see = typeof wrap === 'function' ? wrap : (folk) => folk;
      const call = (fn) => (typeof fn === 'function' ? (folk, ...rest) => fn(see(folk), ...rest) : fn);
      const clean = model.momentDef({
        ...def,
        fits: call(def.fits),
        text: call(def.text),
        partner: call(def.partner),
        answers: def.answers.map((a) => ({ ...a, label: call(a.label), hint: call(a.hint), why: call(a.why), apply: call(a.apply) })),
      });
      defs.set(def.id, clean);
      log(`moment ${def.id} registered`);
      return () => { if (defs.get(def.id) === clean) defs.delete(def.id); };
    },
    /** The registered moment with this id, or undefined (a saved one waits for its mod). */
    get(id) {
      return defs.get(id);
    },
    get all() {
      return [...defs.values()];
    },
    /**
     * Queues an item for the "While you were away" popup: opened after the game's popups and Worker Folks' own
     * moments, in the order pushed. `rank` 0 is Worker Folks' own. Returns false for a bad item.
     */
    awayPush(item, rank = 1) {
      const problem = model.checkAwayItem(item);
      if (problem !== undefined) {
        log(`away item refused: ${problem}`);
        return false;
      }
      away = model.queueAway(away, item, rank);
      drain();
      return true;
    },
    /** The ids waiting in the away queue, in order. */
    get awayIds() {
      return away.map((e) => e.item.id);
    },
    answer,
    cardView,
    /** True when the Folk has a moment open whose mod is loaded. */
    isOpen: (folk) => openOf(folk) !== undefined,
    /** How many Folks have a moment waiting for an answer. */
    openCount: () => (hiring?.crew?.all ?? []).filter((f) => openOf(f) !== undefined).length,
    /** Each CHECK_MS of game time's look, at once (tests, the dev panel). */
    check,
    /** Closes the Folk's moment `id` with no answer and nothing applied (a warning that no longer holds). */
    dismiss(folk, id) {
      if (folk?.moment?.id !== id) return false;
      folk.moment = null;
      changed(folk);
      return true;
    },
    /** Opens `id` on the Folk now if it has none and the moment is registered, skipping the gap and `fits`. */
    force(folk, id) {
      const def = defs.get(id);
      if (def === undefined || (folk.moment !== null && folk.moment !== undefined)) return false;
      open(folk, def);
      return true;
    },
  };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    hiring.moments = api;
  });

  return api;
}
