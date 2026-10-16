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
 * effectTexts(folk), detailText(folk), isWorking(folk), onStop(folk), stopText(), ...
 * Returns false when the page is not in the DOM yet.
 */
export function renderFolkCards(folks, view) {
  const list = document.getElementById(LIST_ID);
  const template = document.getElementById(CARD_TEMPLATE_ID);
  if (list === null || template === null) return false;
  const empty = document.getElementById(EMPTY_ID);
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
    view.frozenSlots().forEach((f) => {
      const col = take(`frozen-${f.slot}`, frozenTemplate);
      const portrait = col.querySelector('[data-wf="portrait"]');
      if (portrait !== null) portrait.src = view.portrait('Newbie');
      const title = col.querySelector('[data-wf="title-text"]');
      if (title !== null) title.textContent = view.frozenTitle();
      const help = col.querySelector('[data-wf-help]');
      if (help !== null) help.setAttribute('aria-label', view.helpLabel?.() ?? '?');
      const text = col.querySelector('[data-wf="text"]');
      if (text !== null) text.textContent = f.text;
    });
  }

  existing.forEach((el) => el.remove());
  // Re-attach only when the order changed (a hire, a firing, a thaw): moving nodes is what breaks hover.
  const current = Array.from(list.querySelectorAll(':scope > [data-wf-folk]'));
  const sameOrder = current.length === ordered.length && current.every((el, i) => el === ordered[i]);
  if (!sameOrder) ordered.forEach((col) => list.append(col));
  return true;
}

function fillCard(col, folk, view) {
  const set = (key, fn) => {
    const el = col.querySelector(`[data-wf="${key}"]`);
    if (el !== null) fn(el);
  };
  const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
  set('portrait', (el) => { if (el.getAttribute('src') !== view.portrait(folk.tier)) el.src = view.portrait(folk.tier); el.alt = folk.name; });
  set('name', (el) => setText(el, folk.name));
  set('role', (el) => setText(el, view.roleName(folk.tier)));
  set('slot', (el) => setText(el, view.slotText(folk)));
  set('rate', (el) => setText(el, view.rateText(folk)));
  set('effects', (el) => setText(el, view.effectTexts(folk).join(' · ')));
  set('skill', (el) => {
    const media = view.skillMedia(folk);
    const text = folk.skillId === null ? '' : view.assignmentText(folk);
    const className = `font-w700 wf-card-skill ${view.isWorking(folk) ? 'text-success' : ''}`.trim();
    if (el.className !== className) el.className = className;
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
  set('mastery', (el) => {
    const slot = view.masterySlot(folk);
    if (slot === undefined) return;
    if (typeof el.setMastery !== 'function') customElements.upgrade(el);
    if (typeof el.setMastery !== 'function') return;
    if (el.dataset.wfMasterySlot !== slot.id) {
      el.setMastery(view.skill, slot);
      el.dataset.wfMasterySlot = slot.id;
    }
    el.updateValues(view.masteryProgress(folk));
  });
  const expanded = view.isExpanded(folk);
  set('expand', (el) => {
    setText(el, `${view.detailsText()} ${expanded ? '▴' : '▾'}`);
    el.setAttribute('aria-expanded', `${expanded}`);
    el.onclick = () => view.onToggleExpand(folk);
  });
  set('gear', (el) => {
    const gear = view.gear(folk);
    setText(el, gear.text);
    if (el.title !== gear.title) el.title = gear.title;
    // Amber when a worn item ran out (needs attention); blue outline otherwise, like Details.
    const className = `btn btn-sm ${gear.out ? 'btn-outline-warning' : 'btn-outline-info'}`;
    if (el.className !== className) el.className = className;
    el.onclick = () => view.onGear(folk);
  });
  set('promote', (el) => {
    const possible = view.canPromote(folk);
    setText(el, view.promoteText());
    const className = `btn btn-sm ${view.promoteReady(folk) ? 'btn-primary' : 'btn-outline-primary'}${possible ? '' : ' d-none'}`;
    if (el.className !== className) el.className = className;
    el.onclick = () => view.onPromote(folk);
  });
  set('fire', (el) => {
    setText(el, view.fireText());
    el.onclick = () => view.onFire(folk);
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
        const className = line.met ? 'text-success' : 'wf-subtle';
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
      otButton.setAttribute('aria-pressed', `${ot.on}`);
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
      const reason = debtOnly ? '' : info.reason ?? '';
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
    const className = `badge wf-status wf-badge-${status}`;
    if (badge.className !== className) badge.className = className;
  }
  const card = col.querySelector('.wf-card');
  card?.classList.toggle('wf-status-strike', status === 'strike');
  card?.classList.toggle('wf-card-alert', status !== 'strike' && foodAlert);
}
