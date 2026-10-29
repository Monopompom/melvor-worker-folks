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

export function equalizeCards(list) {
  const cols = Array.from(list.querySelectorAll(':scope > [data-wf-folk]')).filter((col) => col.offsetParent !== null);
  const cards = cols.map((col) => col.querySelector('.block'));
  cards.forEach((card) => { if (card) card.style.minHeight = ''; });
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
    row.forEach((c) => { c.card.style.minHeight = `${base + c.extra}px`; });
  });
}

let pending = false;
/** Once per frame at most; again whenever the list's width changes (a resize, the page shown, the menu opened). */
function scheduleEqualize(list) {
  if (!list.dataset.wfEqualize && typeof ResizeObserver === 'function') {
    list.dataset.wfEqualize = '1';
    let width = -1;
    new ResizeObserver(() => { if (list.clientWidth !== width) { width = list.clientWidth; scheduleEqualize(list); } }).observe(list);
  }
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; try { equalizeCards(list); } catch {} });
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
      const className = `d-block ${tone}`.trim();
      if (food.className !== className) food.className = className;
      foodAlert = hp.food.state === 'none';
    }
  });
  // The room: shown only while it holds something or bank and room are both full (src/room.mjs).
  set('room', (el) => {
    const room = view.room?.(folk);
    el.classList.toggle('d-none', room === undefined);
    if (room === undefined) { view.tip(el, []); return; }
    const bar = el.querySelector('[data-wf="room-bar"]');
    if (bar !== null) {
      bar.style.width = `${room.percent}%`;
      const className = `progress-bar ${room.full ? 'bg-danger' : 'bg-info'}`;
      if (bar.className !== className) bar.className = className;
    }
    const text = el.querySelector('[data-wf="room-text"]');
    if (text !== null) setText(text, room.text);
    const status = el.querySelector('[data-wf="room-status"]');
    if (status !== null) {
      setText(status, room.status);
      status.classList.toggle('d-none', room.status === '');
    }
    view.tip(el, room.tip);
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
    setText(el, text);
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
    const ot = view.overtime(folk);
    const otButton = el.querySelector('[data-wf="overtime"]');
    if (otButton !== null) {
      setText(otButton, ot.text);
      const className = `btn btn-sm ${ot.on ? 'btn-warning' : 'btn-outline-warning'} mr-2`;
      if (otButton.className !== className) otButton.className = className;
      otButton.classList.toggle('d-none', !ot.unlocked);
      setAttr(otButton, 'aria-pressed', `${ot.on}`);
      otButton.onclick = () => view.onToggleOvertime(folk);
    }
  });
  set('wage', (el) => {
    const text = view.wageText(folk);
    setText(el, text);
    el.classList.toggle('d-none', text === '');
  });
  set('strike', (el) => {
    const info = view.strikeInfo(folk);
    el.classList.toggle('d-none', info === null);
    if (info === null) return;
    const debtOnly = info.debtOnly === true;
    el.classList.toggle('wf-debt-block', debtOnly);
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
        setText(settle, info.settleText);
        settle.disabled = !info.canSettle;
        settle.onclick = info.onSettle;
      }
    }
    const apology = el.querySelector('[data-wf="apologise"]');
    if (apology !== null) {
      apology.classList.toggle('d-none', debtOnly);
      if (!debtOnly) {
        setText(apology, info.apologyText);
        apology.disabled = !info.canApologise;
        apology.onclick = info.onApologise;
      }
    }
    // A disabled Settle / Apologise says why (grey only with the reason next to it).
    const why = el.querySelector('[data-wf="strike-why"]');
    if (why !== null) {
      // The away reason is said once, under the buttons (build .136): the strike line keeps only its own.
      const r0 = debtOnly ? '' : info.reason ?? '';
      const reason = r0 !== '' && [refusals.promote, refusals.gear, refusals.fire].includes(r0) ? '' : r0;
      setText(why, reason);
      why.classList.toggle('d-none', reason === '');
    }
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
