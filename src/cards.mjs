// Folk card rendering on the Hiring page. Game-facing (DOM only).

export const LIST_ID = 'worker-folks-folks';
export const EMPTY_ID = 'worker-folks-empty';
const CARD_TEMPLATE_ID = 'wf-folk-card-template';
const FROZEN_TEMPLATE_ID = 'wf-frozen-slot-template';

/**
 * Cards are updated in place: one element per Folk (keyed by id) is created once and its
 * fields are refreshed on every render, so hover states, tooltips and the unfolded Details
 * survive the per-action re-renders (no flicker). Cards of Folks that left are removed and
 * the order follows `folks`, then the frozen slots.
 * `view` supplies: roleName(tier), portrait(tier), status(folk), statusIcon(key),
 * statusText(key), assignmentText(folk), skillMedia(folk), rateText(folk),
 * effects(folk), detailText(folk), isWorking(folk), onStop(folk), stopText(), ...
 * Returns false when the page is not in the DOM yet.
 */
export function renderFolkCards(folks, view) {
  const list = document.getElementById(LIST_ID);
  const template = document.getElementById(CARD_TEMPLATE_ID);
  if (list === null || template === null) return false;
  const empty = document.getElementById(EMPTY_ID);
  // While nobody is hired the grid (with the empty card) goes above the Overview (scan A-23, build .112).
  list.classList.toggle('wf-crew-empty', folks.length === 0);
  if (empty !== null) {
    empty.classList.toggle('d-none', folks.length > 0);
    // What to buy next depends on the licence (build .55); the button opens the Shop.
    const desc = empty.querySelector('[data-wf="empty-desc"]');
    if (desc !== null && typeof view.emptyText === 'function') {
      const text = view.emptyText();
      if (desc.textContent !== text) desc.textContent = text;
    }
    const shop = empty.querySelector('[data-wf="open-shop"]');
    if (shop !== null && typeof view.onOpenShop === 'function') shop.onclick = () => view.onOpenShop();
  }

  const existing = new Map();
  list.querySelectorAll(':scope > [data-wf-folk]').forEach((el) => existing.set(el.dataset.wfFolk, el));
  const ordered = [];
  const take = (key, templateEl) => {
    let col = existing.get(key);
    if (col === undefined) {
      // importNode (not cloneNode) so <mastery-display> is upgraded to its custom element class.
      col = document.importNode(templateEl.content, true).firstElementChild;
      col.dataset.wfFolk = key;
    }
    existing.delete(key);
    ordered.push(col);
    return col;
  };

  for (const folk of folks) fillCard(take(folk.id, template), folk, view);

  const frozenTemplate = document.getElementById(FROZEN_TEMPLATE_ID);
  if (frozenTemplate !== null && typeof view.frozenSlots === 'function') {
    // Written only when changed: the countdown redraws every second (scan C-36, build .112).
    view.frozenSlots().forEach((f) => {
      const col = take(`frozen-${f.slot}`, frozenTemplate);
      const portrait = col.querySelector('[data-wf="portrait"]');
      if (portrait !== null && portrait.getAttribute('src') !== view.portrait('Newbie')) portrait.src = view.portrait('Newbie');
      const title = col.querySelector('[data-wf="title-text"]');
      if (title !== null && title.textContent !== view.frozenTitle()) title.textContent = view.frozenTitle();
      const help = col.querySelector('[data-wf-help]');
      const label = view.helpLabel?.('frozen') ?? '?';
      if (help !== null && help.getAttribute('aria-label') !== label) help.setAttribute('aria-label', label);
      const text = col.querySelector('[data-wf="text"]');
      if (text !== null && text.textContent !== f.text) text.textContent = f.text;
      const lost = col.querySelector('[data-wf="lost"]');
      if (lost !== null && lost.dataset.html !== (f.lostHtml ?? '')) {
        lost.dataset.html = f.lostHtml ?? '';
        lost.innerHTML = f.lostHtml ?? '';
        lost.classList.toggle('d-none', !f.lostHtml);
        view.tipItems?.(lost);
      }
    });
  }

  existing.forEach((el) => el.remove());
  // Re-attach only when the order changed (a hire, a firing, a thaw): moving nodes is what breaks hover.
  const current = Array.from(list.querySelectorAll(':scope > [data-wf-folk]'));
  const sameOrder = current.length === ordered.length && current.every((el, i) => el === ordered[i]);
  if (!sameOrder) ordered.forEach((col) => list.append(col));
  dreamSpare = view.dreamSpare ?? Infinity;
  scheduleEqualize(list);
  return true;
}

/**
 * Closed cards in one row share one height, so their action bands line up; an open Details grows only its own card
 * (user, build .61: "while details are expanded - do not pull other blocks"). The list no longer stretches its
 * columns (CSS), so each row's height is measured here: the tallest card without its open Details sets the row.
 */
/**
 * A tier's effects as one wrapping row of pieces, the value in its tone's colour (build .73): used by the cards and
 * the worker popup. Each piece keeps together where it can; pieces wrap between them, no dots.
 */
export function effectsFragment(effects) {
  const frag = document.createDocumentFragment();
  for (const e of effects) {
    const span = document.createElement('span');
    span.className = 'wf-effect';
    const value = document.createElement('span');
    value.className = `font-w600 ${e.tone === 'bad' ? 'text-warning' : 'text-success'}`;
    value.textContent = e.value;
    span.append(document.createTextNode(e.before), value, document.createTextNode(e.after));
    frag.append(span);
  }
  return frag;
}

export function equalizeCards(list, minSpare = Infinity) {
  const cols = Array.from(list.querySelectorAll(':scope > [data-wf-folk]')).filter((col) => col.offsetParent !== null);
  const cards = cols.map((col) => col.querySelector('.block'));
  // Measured without their daydreams: a daydream only fills height another card in the row already gives (build .155).
  const dreamOf = (card) => card?.querySelector('[data-wf="dream"]') ?? null;
  cards.forEach((card) => { if (card) card.style.minHeight = ''; dreamOf(card)?.classList.add('d-none'); });
  const rows = new Map();
  cols.forEach((col, i) => {
    const card = cards[i];
    if (!card) return;
    const details = card.querySelector('[data-wf="details"]');
    const extra = details !== null && !details.classList.contains('d-none')
      ? details.offsetHeight + (parseFloat(getComputedStyle(details).marginTop) || 0) : 0;
    const top = Math.round(col.offsetTop);
    if (!rows.has(top)) rows.set(top, []);
    rows.get(top).push({ card, base: card.offsetHeight - extra, extra });
  });
  rows.forEach((row) => {
    const base = Math.max(...row.map((c) => c.base));
    row.forEach((c) => {
      c.card.style.minHeight = `${base + c.extra}px`;
      const dream = dreamOf(c.card);
      const alert = c.card.querySelector('[data-wf="alert"]');
      const quiet = alert === null || alert.classList.contains('d-none');
      if (dream !== null && dream.dataset.wfReady === '1' && quiet && base - c.base >= minSpare) dream.classList.remove('d-none');
    });
  });
}

let pending = false;
let dreamSpare = Infinity; // the spare height a daydream needs, from the view (no daydreams without one)
/** Once per frame at most; again whenever the list's width changes (a resize, the page shown, the menu opened). */
function scheduleEqualize(list) {
  if (!list.dataset.wfEqualize && typeof ResizeObserver === 'function') {
    list.dataset.wfEqualize = '1';
    let width = -1;
    new ResizeObserver(() => { if (list.clientWidth !== width) { width = list.clientWidth; scheduleEqualize(list); } }).observe(list);
  }
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; try { equalizeCards(list, dreamSpare); } catch {} });
}

/** A one-line text that slides to its end and back while it is longer than its box (build .154). */
function fitMarquee(el) {
  const text = el.firstElementChild;
  if (text === null) return;
  const shift = Math.ceil(text.offsetWidth - el.clientWidth);
  const run = el.clientWidth > 0 && shift > 1;
  el.classList.toggle('wf-marquee-run', run);
  if (!run) return;
  el.style.setProperty('--wf-marquee-shift', `${-shift}px`);
  el.style.setProperty('--wf-marquee-time', `${Math.max(4, Math.round(shift / 30) + 3)}s`);
}

/** Writes the text and measures it again whenever it or the box's width changes (shown, resized). */
function setMarquee(el, value) {
  const text = el.firstElementChild;
  if (text === null) return;
  if (el.wfMarquee !== true && typeof ResizeObserver === 'function') {
    el.wfMarquee = true;
    new ResizeObserver(() => fitMarquee(el)).observe(el);
  }
  if (text.textContent === value) return;
  text.textContent = value;
  requestAnimationFrame(() => fitMarquee(el));
}

function fillCard(col, folk, view) {
  const set = (key, fn) => {
    const el = col.querySelector(`[data-wf="${key}"]`);
    if (el !== null) fn(el);
  };
  const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
  // Attributes too are written only when they change (scan C-36: unchanged values were rewritten every second).
  const setAttr = (el, name, value) => { if (el.getAttribute(name) !== value) el.setAttribute(name, value); };
  set('portrait', (el) => { if (el.getAttribute('src') !== view.portrait(folk.tier)) el.src = view.portrait(folk.tier); setAttr(el, 'alt', folk.name); });
  set('name', (el) => {
    setText(el, folk.name);
    // The card is a labelled group, so a screen reader's button list says whose Fire it is (scan C-33).
    const id = `wf-folk-name-${String(folk.id).replace(/[^A-Za-z0-9_-]/g, '_')}`;
    setAttr(el, 'id', id);
    const card = col.querySelector('.wf-card');
    if (card !== null) setAttr(card, 'aria-labelledby', id);
  });
  set('role', (el) => setText(el, view.roleName(folk.tier)));
  set('slot', (el) => setText(el, view.slotText(folk)));
  set('rate', (el) => setText(el, view.rateText(folk)));
  set('effects', (el) => {
    const effects = view.effects(folk);
    const key = JSON.stringify(effects);
    if (el.dataset.wfKey !== key) { el.dataset.wfKey = key; el.replaceChildren(effectsFragment(effects)); }
  });
  set('traits', (el) => {
    const icons = view.traits?.(folk)?.icons ?? [];
    const key = JSON.stringify(icons.map((t) => [t.media, t.name, t.kind, t.tip]));
    if (el.dataset.wfKey !== key) {
      el.dataset.wfKey = key;
      el.replaceChildren(...icons.map((t) => {
        const img = document.createElement('img');
        img.className = `wf-trait-icon wf-trait-${t.kind}`;
        img.src = t.media;
        img.alt = t.name;
        return img;
      }));
      icons.forEach((t, i) => view.tip(el.children[i], t.tip));
    }
    el.classList.toggle('d-none', icons.length === 0);
  });
  set('skill', (el) => {
    const media = view.skillMedia(folk);
    const text = folk.skillId === null ? (view.unassignedText?.() ?? '') : view.assignmentText(folk);
    const working = view.isWorking(folk);
    const className = `font-w700 wf-card-skill ${working ? 'text-success' : ''}`.trim();
    if (el.className !== className) el.className = className;
    // While Stop shows, the skill sits in an outline joined to it: one control (the user, 29 Oct 2026).
    el.parentElement?.classList.toggle('wf-skill-joined', working);
    let img = el.querySelector('img');
    if (media === undefined) {
      if (img !== null) img.remove();
    } else {
      if (img === null) {
        img = document.createElement('img');
        img.className = 'skill-icon-xs mr-1';
        img.alt = '';
        el.prepend(img);
      }
      if (img.getAttribute('src') !== media) img.src = media;
    }
    let label = el.querySelector('span');
    if (label === null) {
      label = document.createElement('span');
      el.append(label);
    }
    setText(label, text);
  });
  set('detail', (el) => {
    const cooldown = view.cooldownText(folk);
    setText(el, cooldown !== '' ? cooldown : view.detailText(folk));
    el.classList.toggle('text-warning', cooldown === '' && view.workRefused?.(folk) === true);
  });
  set('where', (el) => {
    const text = view.whereText?.(folk) ?? '';
    setText(el, text);
    el.classList.toggle('d-none', text === '');
  });
  // Health is always shown, so cards in a row keep one height (user, build .55). Food matters on Thieving only:
  // muted elsewhere, amber when low, red with an amber card border when there is none.
  let foodAlert = false;
  set('hp', (el) => {
    const hp = view.hp?.(folk);
    el.classList.toggle('d-none', hp === undefined);
    if (hp === undefined) return;
    const bar = el.querySelector('[data-wf="hp-bar"]');
    if (bar !== null) {
      bar.style.width = `${hp.percent}%`;
      bar.className = `progress-bar ${hp.percent > 50 ? 'bg-success' : hp.percent > 25 ? 'bg-warning' : 'bg-danger'}`;
    }
    const text = el.querySelector('[data-wf="hp-text"]');
    if (text !== null) setText(text, hp.text);
    const food = el.querySelector('[data-wf="food"]');
    if (food !== null && hp.food !== undefined) {
      setText(food, hp.food.text);
      const tone = { off: 'wf-subtle', ok: '', low: 'text-warning', none: 'text-danger font-w600' }[hp.food.state] ?? '';
      const className = `wf-hp-food ${tone}`.trim();
      if (food.className !== className) food.className = className;
      foodAlert = hp.food.state === 'none';
    }
  });
  // The room: shown while it holds something, bank and room are both full, or the Folk works from its own stock
  // (src/room.mjs). Its list is the tooltip of the bar and its line; Restock has its own. A meter in the work band
  // (build .153); while bank and room are full or the stock is out, the alert band says so and holds Restock.
  const room = view.room?.(folk);
  /**
   * Restock as a split button (build .153): the word fills the free room, the caret opens a panel with a slider from
   * what the room holds to full, what that takes from the bank, and its own Restock. The panel's open state and the
   * slider's value live in the DOM, so a re-render (every action) keeps them; `preview` is the room bar's second
   * segment, the part the slider would add.
   */
  const restockControl = (group, panel, { show, solid, preview }) => {
    if (group === null || panel === null) return;
    const fill = group.querySelector('.wf-restock-fill');
    const more = group.querySelector('.wf-restock-more');
    group.classList.toggle('d-none', !show);
    const rv = show ? view.restockView?.(folk) : undefined;
    const canPick = rv !== undefined && rv.space > 1;
    if (!canPick) panel.classList.add('d-none');
    const open = !panel.classList.contains('d-none');
    if (preview) preview.style.width = open ? `${rv.percentAt(Number(panel.querySelector('.wf-restock-range').value))}%` : '0%';
    if (!show) { view.tip(fill, []); return; }
    const tone = solid ? 'btn-info' : 'btn-outline-info';
    for (const [b, cls] of [[fill, 'wf-restock-fill'], [more, 'wf-restock-more']]) {
      const className = `btn btn-sm ${tone} ${cls}${b === more && !canPick ? ' d-none' : ''}`;
      if (b.className !== className) b.className = className;
    }
    setText(fill, room.restock.text);
    view.tip(fill, room.restock.tip);
    fill.onclick = () => view.onRestock(folk);
    setAttr(more, 'aria-label', view.text('MOD_WF_RESTOCK_AMOUNT'));
    setAttr(more, 'aria-expanded', `${open}`);
    if (!canPick) return;
    panel.wfRestock = rv;
    const range = panel.querySelector('.wf-restock-range');
    const go = panel.querySelector('.wf-restock-go');
    const refresh = () => {
      const v = panel.wfRestock;
      setAttr(range, 'max', `${v.space}`);
      setAttr(range, 'aria-label', view.text('MOD_WF_RESTOCK_UP_TO'));
      const n = Math.min(v.space, Math.max(1, Math.round(Number(range.value) || 1)));
      if (Number(range.value) !== n) range.value = `${n}`;
      const full = n >= v.space;
      const put = (sel, text) => { const e = panel.querySelector(sel); if (e !== null) setText(e, text); };
      put('.wf-restock-up-to', view.text('MOD_WF_RESTOCK_UP_TO'));
      put('.wf-restock-value', `${v.hoursAt(n)}\u00a0h`);
      put('.wf-restock-now', view.text('MOD_WF_RESTOCK_NOW', { hours: v.nowText }));
      put('.wf-restock-full', view.text('MOD_WF_RESTOCK_FULL', { hours: v.fullText }));
      put('.wf-restock-cost', v.costText(n));
      const bank = panel.querySelector('.wf-restock-bank');
      if (bank !== null) { setText(bank, v.bankText); bank.classList.toggle('d-none', v.bankText === '' || n <= v.bank); }
      setText(go, full ? view.text('MOD_WF_RESTOCK_FILL') : view.text('MOD_WF_RESTOCK_TO', { hours: v.hoursAt(n) }));
      if (preview) preview.style.width = `${v.percentAt(n)}%`;
    };
    range.oninput = refresh;
    go.onclick = () => {
      panel.classList.add('d-none');
      view.onRestock(folk, Math.round(Number(range.value)));
    };
    more.onclick = () => {
      const opening = panel.classList.contains('d-none');
      panel.classList.toggle('d-none', !opening);
      setAttr(more, 'aria-expanded', `${opening}`);
      // Opens halfway between what it holds and what the bank covers (or full, whichever is less).
      if (opening) {
        setAttr(range, 'max', `${panel.wfRestock.space}`);
        range.value = `${Math.max(1, Math.round(Math.min(panel.wfRestock.space, panel.wfRestock.bank || panel.wfRestock.space) / 2))}`;
      }
      if (opening) refresh();
      else if (preview) preview.style.width = '0%';
      if (col.parentElement !== null) scheduleEqualize(col.parentElement);
    };
    if (open) refresh();
  };
  set('room', (el) => {
    el.classList.toggle('d-none', room === undefined);
    const bar = el.querySelector('[data-wf="room-bar"]');
    const text = el.querySelector('[data-wf="room-text"]');
    // Here as an outline while nothing waits for it; the alert row's solid one while the Folk does.
    restockControl(el.querySelector('[data-wf="restock"]'), el.querySelector('[data-wf="restock-panel"]'), {
      show: room !== undefined && room.restock !== undefined && !room.restock.attention,
      solid: false,
      preview: el.querySelector('[data-wf="room-preview"]'),
    });
    if (room === undefined) {
      [bar?.parentElement, text].forEach((t) => { if (t) view.tip(t, []); });
      return;
    }
    if (bar !== null) {
      bar.style.width = `${room.percent}%`;
      const className = `progress-bar ${room.full ? 'bg-danger' : room.out ? 'bg-warning' : 'bg-info'}`;
      if (bar.className !== className) bar.className = className;
      view.tip(bar.parentElement, room.tip);
    }
    if (text !== null) {
      setText(text, room.text);
      view.tip(text, room.tip);
    }
  });
  // The switches under the work, always in sight (build .153; they were in Details): Overtime once unlocked, Own stock.
  const ot = view.overtime(folk);
  set('overtime', (el) => {
    el.classList.toggle('d-none', !ot.unlocked);
    el.classList.toggle('wf-switch-on', ot.on);
    el.classList.add('wf-switch-warn');
    setAttr(el, 'aria-checked', `${ot.on}`);
    const label = el.querySelector('[data-wf="overtime-label"]');
    if (label !== null) setText(label, ot.text);
    const sub = el.querySelector('[data-wf="overtime-sub"]');
    if (sub !== null) {
      setText(sub, ot.sub ?? '');
      // Gold while on, like Own stock's note: the switch changes what the Folk costs.
      sub.classList.toggle('text-warning', ot.on);
      sub.classList.toggle('wf-subtle', !ot.on);
    }
    el.onclick = () => view.onToggleOvertime(folk);
  });
  const stock = view.ownStock?.(folk);
  set('own-stock', (el) => {
    el.classList.toggle('d-none', stock === undefined);
    if (stock === undefined) return;
    el.classList.toggle('wf-switch-on', stock.on);
    setAttr(el, 'aria-checked', `${stock.on}`);
    el.disabled = stock.disabled === true;
    const label = el.querySelector('[data-wf="own-stock-label"]');
    if (label !== null) setText(label, stock.text);
    view.tip(el, stock.tip);
    el.onclick = () => view.onToggleOwnStock(folk);
    const note = el.querySelector('[data-wf="own-stock-note"]');
    if (note !== null) {
      setText(note, stock.note);
      note.classList.toggle('d-none', stock.note === '');
      note.classList.toggle('text-danger', stock.on && stock.noteLost);
      note.classList.toggle('text-warning', stock.on && !stock.noteLost);
      note.classList.toggle('wf-subtle', !stock.on);
    }
  });
  set('mastery', (el) => {
    const slot = view.masterySlot(folk);
    if (slot === undefined) return;
    if (typeof el.setMastery !== 'function') customElements.upgrade(el);
    if (typeof el.setMastery !== 'function') return;
    if (el.wfShortValues !== true && typeof view.shortNumber === 'function') {
      // The game redraws this display on its own (each mastery gain), in full numbers: this card's copy writes the
      // XP short ("511K / 547K").
      const draw = el.updateValues;
      el.updateValues = function (progress) {
        draw.call(this, progress);
        const xp = view.shortNumber(Math.floor(progress.xp));
        this.xpProgress.textContent = progress.level >= 99 ? xp : `${xp} / ${view.shortNumber(progress.nextLevelXP)}`;
      };
      el.wfShortValues = true;
    }
    if (el.dataset.wfMasterySlot !== slot.id) {
      el.setMastery(view.skill, slot);
      el.dataset.wfMasterySlot = slot.id;
    }
    el.updateValues(view.masteryProgress(folk));
  });
  const expanded = view.isExpanded(folk);
  // ▸ closed, ▾ open, before the word, as the gear bonuses and the game's folds (scan A-32); the glyph
  // is hidden from screen readers, aria-expanded says it (C-33).
  set('expand', (el) => {
    const key = `${expanded}|${view.detailsText()}`;
    if (el.dataset.wfKey !== key) {
      el.dataset.wfKey = key;
      const glyph = document.createElement('span');
      glyph.setAttribute('aria-hidden', 'true');
      glyph.textContent = expanded ? '▾ ' : '▸ ';
      el.replaceChildren(glyph, document.createTextNode(view.detailsText()));
    }
    setAttr(el, 'aria-expanded', `${expanded}`);
    el.onclick = () => view.onToggleExpand(folk);
  });
  // Another mod's refusals (Voyage): the button greys, the reason is the line under the buttons.
  const refusals = view.refusals?.(folk) ?? { promote: '', fire: '', gear: '' };
  // Gear and Traits on a phone (build .136): the icon and the count, the word hidden but read out; the button's text
  // "Gear 2/5" splits at its last space when it ends in a count.
  const iconAndWords = (el, icon, text) => {
    const m = /^(\S+)\s+(.+)$/.exec(text);
    const word = m === null ? text : m[1];
    const count = m === null ? '' : ` ${m[2]}`;
    const key = `${icon}|${text}`;
    if (el.dataset.wfIconText === key) return;
    el.dataset.wfIconText = key;
    const i = document.createElement('i');
    i.className = `fa fa-fw ${icon} wf-btn-ico`;
    i.setAttribute('aria-hidden', 'true');
    const w = document.createElement('span');
    w.className = 'wf-btn-word';
    w.textContent = word;
    el.replaceChildren(i, w, document.createTextNode(count));
  };
  set('gear', (el) => {
    const gear = view.gear(folk);
    iconAndWords(el, 'fa-shield-alt', gear.text);
    // Melvor's tooltip, one line per worn item with its icon (src/tips.mjs; build .91).
    view.tip(el, gear.tip);
    // Amber when a worn item ran out (needs attention); blue outline otherwise, like Details.
    const className = `btn btn-sm ${gear.out ? 'btn-outline-warning' : 'btn-outline-info'}`;
    if (el.className !== className) el.className = className;
    el.disabled = refusals.gear !== '';
    el.onclick = () => view.onGear(folk);
  });
  set('traits-button', (el) => {
    const traits = view.traits?.(folk);
    el.classList.toggle('d-none', traits === undefined);
    if (traits === undefined) return;
    iconAndWords(el, 'fa-star', traits.buttonText);
    el.onclick = () => view.onTraits(folk);
  });
  set('promote', (el) => {
    const possible = view.canPromote(folk);
    setText(el, view.promoteText());
    // Ready: the upgrade blue. Not yet: the grey outline of a button that does nothing for now (a blue outline is
    // the cancel colour; build .136). It stays clickable: the click opens the requirements, the only place that
    // says what is still missing.
    const className = `btn btn-sm btn-block ${view.promoteReady(folk) ? 'btn-primary' : 'btn-outline-secondary'}`;
    el.closest('[data-wf="promote-row"]')?.classList.toggle('d-none', !possible);
    if (el.className !== className) el.className = className;
    el.disabled = refusals.promote !== '';
    el.onclick = () => view.onPromote(folk);
  });
  set('fire', (el) => {
    setText(el, view.fireText());
    el.disabled = refusals.fire !== '';
    el.onclick = () => view.onFire(folk);
  });
  set('staff-why', (el) => {
    const promotable = view.canPromote(folk);
    const text = [...new Set([promotable ? refusals.promote : '', refusals.gear, refusals.fire].filter((r) => r !== ''))].join(' ');
    setMarquee(el, text);
    el.classList.toggle('d-none', text === '');
  });
  set('details', (el) => {
    el.classList.toggle('d-none', !expanded);
    if (!expanded) return;
    const pt = el.querySelector('[data-wf="perks-title"]');
    if (pt !== null) setText(pt, view.perksTitle());
    const perks = el.querySelector('[data-wf="perks"]');
    if (perks !== null) {
      const lines = view.perkLines(folk);
      while (perks.children.length > lines.length) perks.lastElementChild.remove();
      lines.forEach((line, i) => {
        let li = perks.children[i];
        if (li === undefined) {
          li = document.createElement('li');
          perks.append(li);
        }
        // 'info' lines (the wage, a cut that is none yet) in body ink; green only for what applies (scan A-16).
        const className = line.tone === 'info' ? '' : line.met ? 'text-success' : 'wf-subtle';
        if (li.className !== className) li.className = className;
        setText(li, line.text);
      });
    }
  });
  set('wage', (el) => {
    const text = view.wageText(folk);
    setText(el, text);
    el.classList.toggle('d-none', text === '');
  });
  const info = view.strikeInfo(folk);
  set('strike', (el) => {
    el.classList.toggle('d-none', info === null);
    if (info === null) return;
    const debtOnly = info.debtOnly === true;
    const owed = el.querySelector('[data-wf="strike-owed"]');
    if (owed !== null) {
      setText(owed, info.owedText);
      const cls = `d-block font-w600 ${debtOnly ? 'text-warning' : 'text-danger'}`;
      if (owed.className !== cls) owed.className = cls;
    }
    // The second line: the severance on a strike, what happens next on a debt (amber like the debt).
    const sev = el.querySelector('[data-wf="strike-severance"]');
    if (sev !== null) {
      const text = (debtOnly ? info.noteText : info.severanceText) ?? '';
      setText(sev, text);
      sev.classList.toggle('d-none', text === '');
      sev.classList.toggle('text-danger', !debtOnly);
      sev.classList.toggle('text-warning', debtOnly);
    }
    const settle = el.querySelector('[data-wf="settle"]');
    if (settle !== null) {
      settle.classList.toggle('d-none', debtOnly);
      if (!debtOnly) {
        const label = settle.querySelector('[data-wf="settle-label"]');
        if (label !== null) setText(label, info.settleLabel);
        const amount = settle.querySelector('[data-wf="settle-amount"]');
        if (amount !== null) setText(amount, info.settleAmount);
        // Grey but still hoverable (aria-disabled, not disabled), so its tooltip can say what is missing.
        settle.classList.toggle('disabled', !info.canSettle);
        setAttr(settle, 'aria-disabled', `${!info.canSettle}`);
        view.tip(settle, info.settleWhy ?? '');
        settle.onclick = () => { if (info.canSettle) info.onSettle(); };
      }
    }
    const apology = el.querySelector('[data-wf="apologise"]');
    if (apology !== null) {
      apology.classList.toggle('d-none', debtOnly);
      if (!debtOnly) {
        const label = apology.querySelector('[data-wf="apologise-label"]');
        if (label !== null) setText(label, info.apologyLabel);
        const amount = apology.querySelector('[data-wf="apologise-amount"]');
        if (amount !== null) setText(amount, info.apologyAmount);
        apology.classList.toggle('disabled', !info.canApologise);
        setAttr(apology, 'aria-disabled', `${!info.canApologise}`);
        view.tip(apology, info.apologyTip ?? info.apologyWhy ?? '');
        apology.onclick = () => { if (info.canApologise) info.onApologise(); };
      }
    }
    // Another mod's refusal greys both buttons and is said under them; what is missing is in each button's tooltip.
    const why = el.querySelector('[data-wf="strike-why"]');
    if (why !== null) {
      // The away reason is said once, under the buttons (build .136): the strike line keeps only its own.
      const r0 = debtOnly ? '' : info.reason ?? '';
      const reason = r0 !== '' && [refusals.promote, refusals.gear, refusals.fire].includes(r0) ? '' : r0;
      setText(why, reason);
      why.classList.toggle('d-none', reason === '');
    }
  });
  // Bank and room full, or the stock out: what it is, what to do, and the solid Restock while the Folk waits for it.
  const roomAlert = room !== undefined && (room.full || room.out);
  set('room-alert', (el) => {
    el.classList.toggle('d-none', !roomAlert);
    restockControl(el.querySelector('[data-wf="alert-restock"]'), el.querySelector('[data-wf="alert-restock-panel"]'), {
      show: roomAlert && room.restock?.attention === true,
      solid: true,
      preview: null,
    });
    if (!roomAlert) return;
    const status = el.querySelector('[data-wf="room-status"]');
    if (status !== null) {
      setText(status, room.status);
      status.classList.toggle('text-danger', room.full);
      status.classList.toggle('text-warning', !room.full);
    }
    const why = el.querySelector('[data-wf="room-why"]');
    if (why !== null) { setText(why, room.why ?? ''); view.tip(why, room.tip); }
  });
  // A strike stops everything and comes first; a debt is paid by work, so it follows the room's row.
  // The daydream's picture and line; equalizeCards decides whether there is room to show it.
  set('dream', (el) => view.dream?.(el, folk));
  set('alert', (el) => {
    const strike = el.querySelector('[data-wf="strike"]');
    const roomRow = el.querySelector('[data-wf="room-alert"]');
    const struck = info !== null && info.debtOnly !== true;
    const order = struck ? [strike, roomRow] : [roomRow, strike];
    if (order.every((r) => r !== null) && el.firstElementChild !== order[0]) el.prepend(order[0]);
    el.classList.toggle('d-none', info === null && !roomAlert);
    el.classList.toggle('wf-alert-strike', struck || (roomAlert && room.full));
  });
  set('stop', (el) => {
    const working = view.isWorking(folk);
    el.classList.toggle('d-none', !working);
    setText(el, view.stopText());
    el.onclick = () => view.onStop(folk);
  });
  const status = view.status(folk);
  set('status-icon', (el) => { if (el.getAttribute('src') !== view.statusIcon(status)) el.src = view.statusIcon(status); });
  set('status-text', (el) => setText(el, view.statusText(status)));
  const badge = col.querySelector('.wf-status');
  if (badge !== null) {
    // wf-card-status keeps the badge clear of a long name; rewriting the class used to drop it (build .83).
    const className = `badge wf-status wf-card-status wf-badge-${status}`;
    if (badge.className !== className) badge.className = className;
  }
  const card = col.querySelector('.wf-card');
  card?.classList.toggle('wf-status-strike', status === 'strike');
  card?.classList.toggle('wf-card-alert', status !== 'strike' && foodAlert);
}
