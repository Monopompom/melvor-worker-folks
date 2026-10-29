// The Payroll band in the Overview block (build .98, the user, 18 Oct 2026: the Payroll Reserve merged into the
// Overview, with the Wages band folded in). Game-facing (DOM only); the Overview (dashboard.mjs) owns the band's box,
// this fills it.
//
// What it shows: nothing but "Wages are off" on No sweat; before the reserve unlocks (Hiring 5) the crew's cost an
// hour per currency and "Paid from your bank"; after, one compact block per currency (amount / capacity, a fill bar,
// "Covers N h at …/h", the amount field with its presets, Deposit). Owed wages go last, in amber.
//
// The page redraws about once a second while the bank changes. Rebuilding the band each time would blur the amount
// field under the player's cursor, so the band is rebuilt only when its shape changes (which currencies, locked or
// open, a currency that can't take a deposit, owed lines) and otherwise updates its numbers in place.

export const BAND_SELECTOR = '#worker-folks-overview [data-wf="payroll"]';
export const MINI_SELECTOR = '#worker-folks-overview [data-wf="paymini"]';

/**
 * The folded Overview's Payroll mini bar in its title row (CSS shows it only while folded): per currency an icon, a
 * fill bar and the hours covered (the amount while nobody is paid from it), toned like the band; before the reserve
 * unlocks, the cost an hour. Updated in place.
 */
function renderMini(model, shown, hoursText) {
  const mini = document.querySelector(MINI_SELECTOR);
  if (mini === null) return;
  const key = JSON.stringify([model.off, model.locked, shown.map((c) => c.id)]);
  if (mini.dataset.wfKey !== key) {
    mini.dataset.wfKey = key;
    mini.replaceChildren(...(model.off ? [] : shown.map((c) => {
      const part = document.createElement('span');
      part.className = 'wf-dash-pill wf-dash-paymini-cur'; // styled as the Next unlock pill beside it (the user, build .98)
      part.dataset.wfCurrency = c.id;
      // A word, never an icon alone (scan A-27, build .112); the tooltip says what the hours are.
      if (!model.locked) {
        const word = document.createElement('span');
        word.textContent = getLangString('MOD_WF_DASH_MINI_RESERVE');
        part.append(word);
      }
      const img = document.createElement('img');
      img.className = 'wf-line-icon';
      img.src = c.media;
      img.alt = c.name;
      part.append(img);
      if (!model.locked && c.capacity !== undefined && c.capacity !== Infinity && c.capacity > 0) {
        const bar = document.createElement('div');
        bar.className = 'progress wf-dash-bar';
        const fill = document.createElement('div');
        fill.className = 'progress-bar';
        bar.append(fill);
        part.append(bar);
      }
      part.append(document.createElement('span'));
      return part;
    })));
  }
  for (const c of shown) {
    const part = mini.querySelector(`[data-wf-currency="${c.id}"]`);
    if (part === null) continue;
    const fill = part.querySelector('.progress-bar');
    if (fill !== null) {
      fill.style.width = `${Math.max(0, Math.min(100, (c.amount / c.capacity) * 100))}%`;
      fill.className = `progress-bar ${c.amount <= 0 ? 'bg-danger' : c.low ? 'bg-warning' : 'bg-success'}`;
    }
    const text = part.lastElementChild;
    const put = (el, cls, t) => { if (el.className !== cls) el.className = cls; if (el.textContent !== t) el.textContent = t; };
    if (model.locked) {
      put(text, 'font-w600', `${formatNumber(Math.floor(c.perHour))} ${c.name}/h`);
    } else {
      // Nobody paid from it right now: the amount in it, not an empty hours count.
      put(text, c.amount <= 0 && c.perHour > 0 && c.bank < c.perHour ? 'text-danger font-w600' : c.low ? 'text-warning font-w600' : 'font-w600',
        c.hours === Infinity ? formatNumber(Math.floor(c.amount)) : `${hoursText(c.hours)}\u00a0h`);
      model.tip?.(part, c.hours === Infinity
        ? templateLangString('MOD_WF_DASH_MINI_TIP_IDLE', { amount: numberWithCommas(Math.floor(c.amount)), currency: c.name })
        : templateLangString('MOD_WF_DASH_MINI_TIP', { amount: numberWithCommas(Math.floor(c.amount)), currency: c.name, hours: hoursText(c.hours) }));
    }
  }
}

/**
 * `model`: { off, locked, noCrew, currencies: [{ id, name, media, amount, perHour, hours, low, capacity, room, bank }],
 *   owed: [{ name, amount }], tip?(el, content), onDeposit(id, amount) }
 * onDeposit reports its own outcome (notifications) and returns true when something went in.
 */
export function renderReservePanel(model) {
  const band = document.querySelector(BAND_SELECTOR);
  if (band === null) return false;
  const state = band.wfPayroll ?? (band.wfPayroll = { key: '', refs: new Map(), latest: new Map(), owed: null });
  model.currencies.forEach((c) => state.latest.set(c.id, c));
  const n = (v) => numberWithCommas(Math.floor(v));
  // As time-format.mjs hoursText: rounded down, so "Covers 1.0 h" is never 0.96 h; the game's own formatters.
  const hoursText = (h) => (h >= 100 ? numberWithCommas(Math.floor(h)) : formatFixed(Math.floor(h * 10) / 10, 1));
  const roomOf = (c) => (c.room === undefined ? Infinity : c.room);
  const mostOf = (c) => Math.max(0, Math.floor(Math.min(c.bank, roomOf(c))));
  // No crew: the capacity is 0 because there are no wages to hold, not because it is full (scan A-04, build .112).
  const whyOf = (c) => (model.noCrew ? 'nocrew' : roomOf(c) <= 0 ? 'full' : !(c.bank >= 1) ? 'nothing' : '');
  const shown = model.locked ? model.currencies.filter((c) => c.perHour > 0) : model.currencies;
  const key = JSON.stringify({
    off: model.off,
    locked: model.locked,
    cur: shown.map((c) => [c.id, model.locked ? 0 : whyOf(c), c.perHour > 0, c.capacity !== undefined && c.capacity !== Infinity && c.capacity > 0]),
    owed: model.owed.length,
  });

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  if (key !== state.key) {
    state.key = key;
    state.refs.clear();
    const head = el('div', 'wf-dash-head d-flex align-items-center');
    head.append(el('span', '', getLangString('MOD_WF_DASH_PAYROLL')));
    if (!model.off && !model.locked) {
      // The reserve's help ("?"): the page's help listener opens it (hiring-skill.mjs wireHelp, topic "reserve").
      const help = el('button', 'btn btn-sm wf-help');
      help.type = 'button';
      help.dataset.wfHelp = 'reserve';
      help.setAttribute('aria-label', getLangString('MOD_WF_HELP_LABEL_reserve'));
      const q = el('i', 'fa fa-question-circle');
      q.setAttribute('aria-hidden', 'true');
      help.append(q);
      head.append(help);
    }
    const body = [head];
    if (model.off) body.push(el('div', 'wf-subtle', getLangString('MOD_WF_DASH_WAGES_OFF')));
    else if (model.locked) {
      if (shown.length === 0) body.push(el('div', 'wf-subtle', getLangString('MOD_WF_DASH_UNPAID')));
      for (const c of shown) {
        const line = el('div', 'wf-dash-line font-w600');
        const img = el('img', 'wf-line-icon');
        img.src = c.media;
        img.alt = '';
        const text = el('span');
        line.append(img, text);
        body.push(line, el('div', 'wf-subtle wf-dash-sub', getLangString('MOD_WF_DASH_FROM_BANK')));
        state.refs.set(c.id, { perHourText: text });
      }
    } else {
      for (const c of shown) body.push(currencyBlock(c));
    }
    const owed = el('div', 'text-warning font-w600 wf-dash-line');
    state.owed = owed;
    if (model.owed.length > 0) body.push(owed);
    band.replaceChildren(...body);
  }

  // Numbers, in place, and only when they changed (scan C-36: the band rewrote the same lines every second).
  const put = (target, text, cls) => {
    if (cls !== undefined && target.className !== cls) target.className = cls;
    if (target.textContent !== text) target.textContent = text;
  };
  for (const c of shown) {
    const r = state.refs.get(c.id);
    if (r === undefined) continue;
    if (r.perHourText) put(r.perHourText, templateLangString('MOD_WF_DASH_PER_HOUR', { amount: n(c.perHour), currency: c.name }));
    if (r.amount) put(r.amount, n(c.amount));
    if (r.capacity) put(r.capacity, ` / ${n(c.capacity)}`);
    if (r.fill) {
      const width = `${Math.max(0, Math.min(100, (c.amount / c.capacity) * 100))}%`;
      if (r.fill.style.width !== width) r.fill.style.width = width;
      const cls = `progress-bar ${c.amount <= 0 ? 'bg-danger' : c.low ? 'bg-warning' : 'bg-success'}`;
      if (r.fill.className !== cls) r.fill.className = cls;
    }
    if (r.covers) {
      // Empty while the bank pays is no fault: grey, and says where wages come from; red only when the bank can't pay
      // either (scan A-26, C-35, build .112). Rates "GP/h" everywhere (A-17).
      const vars = { hours: hoursText(c.hours), perHour: n(c.perHour), currency: c.name };
      if (c.hours === Infinity) put(r.covers, getLangString('MOD_WF_RESERVE_IDLE'), 'wf-pay-covers wf-subtle');
      else if (c.amount <= 0 && c.perHour > 0) {
        const broke = c.bank < c.perHour;
        put(r.covers, templateLangString(broke ? 'MOD_WF_RESERVE_EMPTY_BROKE' : 'MOD_WF_RESERVE_EMPTY', vars), `wf-pay-covers ${broke ? 'text-danger font-w600' : 'wf-subtle'}`);
      } else put(r.covers, templateLangString('MOD_WF_RESERVE_COVERS', vars), `wf-pay-covers ${c.low ? 'text-warning font-w600' : 'wf-subtle'}`);
    }
    if (r.why) {
      const why = whyOf(c);
      put(r.why, why === 'nocrew' ? getLangString('MOD_WF_RESERVE_NO_CREW')
        : why === 'full' ? templateLangString('MOD_WF_RESERVE_FULL', { capacity: n(c.capacity ?? 0), currency: c.name })
          : templateLangString('MOD_WF_RESERVE_NOTHING', { currency: c.name }), why === 'nocrew' ? 'wf-subtle wf-pay-why' : 'text-warning wf-pay-why');
    }
  }
  renderMini(model, shown, hoursText);
  if (state.owed !== null) put(state.owed, model.owed.map((o) => templateLangString('MOD_WF_DASH_OWED', { amount: `${n(o.amount)} ${o.name}` })).join(' · '));
  return true;

  /** One currency: name and amount / capacity, bar, Covers, then the field, presets and Deposit (or why not). */
  function currencyBlock(c) {
    const refs = {};
    const block = el('div', 'wf-pay-cur');
    block.dataset.wfCurrency = c.id;
    const head = el('div', 'wf-reserve-head');
    const name = el('span', 'font-w600');
    const img = el('img', 'skill-icon-xs mr-1');
    img.src = c.media;
    img.alt = '';
    name.append(img, document.createTextNode(c.name));
    const amounts = el('span');
    refs.amount = el('span', 'font-w600');
    amounts.append(refs.amount);
    const bounded = c.capacity !== undefined && c.capacity !== Infinity && c.capacity > 0;
    if (bounded) {
      refs.capacity = el('span', 'wf-subtle');
      amounts.append(refs.capacity);
    }
    head.append(name, amounts);
    block.append(head);
    if (bounded) {
      const bar = el('div', 'progress wf-reserve-bar');
      refs.fill = el('div', 'progress-bar');
      refs.fill.setAttribute('role', 'progressbar');
      bar.append(refs.fill);
      block.append(bar);
    }
    refs.covers = el('div', 'wf-pay-covers');
    block.append(refs.covers);
    if (whyOf(c) !== '') {
      refs.why = el('div', 'text-warning wf-pay-why');
      block.append(refs.why);
      state.refs.set(c.id, refs);
      return block;
    }
    const controls = el('div', 'wf-reserve-controls');
    const input = el('input', 'form-control wf-reserve-input');
    input.type = 'number';
    input.min = '0';
    input.inputMode = 'numeric';
    input.placeholder = getLangString('MOD_WF_RESERVE_AMOUNT');
    input.setAttribute('aria-label', `${getLangString('MOD_WF_RESERVE_AMOUNT')} (${c.name})`);
    const presets = el('div', 'wf-reserve-presets');
    // Presets fill the field (the bank's All / All but 1 do the same); Deposit commits. They read the latest numbers.
    const now = () => state.latest.get(c.id) ?? c;
    const current = () => Math.max(0, Math.floor(Number(input.value) || 0));
    const addPreset = (label, value) => {
      const b = el('button', 'btn btn-sm btn-info', label);
      b.type = 'button';
      b.onclick = () => { input.value = `${value()}`; };
      presets.append(b);
    };
    if (c.perHour > 0) {
      addPreset(templateLangString('MOD_WF_RESERVE_QUICK_HOURS', { hours: '1' }), () => Math.min(mostOf(now()), current() + Math.ceil(now().perHour)));
      addPreset(templateLangString('MOD_WF_RESERVE_QUICK_HOURS', { hours: '10' }), () => Math.min(mostOf(now()), current() + Math.ceil(now().perHour * 10)));
    }
    addPreset(getLangString('MOD_WF_RESERVE_QUICK_ALL'), () => mostOf(now()));
    controls.append(input, presets);
    const deposit = el('button', 'btn btn-success d-block wf-reserve-deposit', getLangString('MOD_WF_BUTTON_DEPOSIT')); // the block's main action: a normal button (A-05)
    deposit.type = 'button';
    deposit.onclick = () => { if (model.onDeposit(c.id, input.value)) input.value = ''; };
    block.append(controls, deposit);
    state.refs.set(c.id, refs);
    return block;
  }
}
