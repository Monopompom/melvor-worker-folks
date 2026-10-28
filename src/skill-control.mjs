// The "Worker" control on every delegable skill's page: choose who works the
// skill (you or a Folk), see what the Folk is doing, stop the Folk. Game-facing.

const TEMPLATE_ID = 'wf-skill-control-template';
const EVENTS = ['crewChanged', 'folkAssigned', 'folkFired', 'folkHired', 'folkStarted', 'folkReleased', 'folkPromoted', 'folkPending'];

export function install(ctx, { getHiring, isDisabled = () => false, popupDidRender, effectsFragment, log }) {
  let hiring;
  /** skill → control root element */
  const controls = new Map();

  /** Where the control goes: { parent, after } — after the skill header when there is one. */
  const mountPointFor = (skill) => {
    // 1. Registered page (base game, expansions and mods that register a page).
    const pages = game.pages.allObjects.filter((p) => p.action === skill || (Array.isArray(p.skills) && p.skills.includes(skill)));
    // A skill shown on several pages (Magic: Combat and Alt. Magic) belongs to the one that is only about it.
    pages.sort((a, b) => (a.skills?.length ?? 0) - (b.skills?.length ?? 0));
    for (const page of pages) {
      const container = document.getElementById(page.containerID);
      if (container === null) continue;
      const header = container.querySelector(':scope > .skill-info') ?? container.querySelector(`skill-header[data-skill-id="${skill.id}"]`);
      return { parent: container, after: header };
    }
    // 2. A mod that inserts its own container: find its skill header anywhere.
    const header = document.querySelector(`skill-header[data-skill-id="${skill.id}"]`);
    if (header !== null) {
      const wrap = header.closest('.skill-info') ?? header;
      return { parent: wrap.parentElement, after: wrap };
    }
    // 3. Naming convention used by the base game containers.
    const byName = document.getElementById(`${skill.localID.toLowerCase()}-container`);
    return byName === null ? null : { parent: byName, after: null };
  };

  const mount = () => {
    const template = document.getElementById(TEMPLATE_ID);
    if (template === null) {
      console.error('[Worker Folks] skill control template missing');
      return;
    }
    let mounted = 0;
    for (const skill of hiring.delegableSkills) {
      if (controls.has(skill)) continue;
      const point = mountPointFor(skill);
      if (point === null) {
        log(`no page found for ${skill.id}; no worker control`);
        continue;
      }
      const root = document.importNode(template.content, true).firstElementChild;
      root.dataset.wfSkill = skill.id;
      if (point.after !== null) point.after.after(root);
      else point.parent.prepend(root);
      // A page without the game's padded `.content` (Cartography's map) put the box edge to edge: a `.content`
      // wrapper gives it the same responsive gutter as the other skill pages (scan B-10, build .112).
      if (root.closest('.content') === null) {
        const gutter = document.createElement('div');
        gutter.className = 'content wf-ctrl-gutter';
        root.before(gutter);
        gutter.append(root);
      }
      controls.set(skill, root);
      mounted += 1;
    }
    log(`worker controls mounted on ${mounted} skill page(s)`);
  };

  /** Modal: one tile per choice (You + every Folk), up to three per row, popup hugs the tiles; one column on phones. */
  const openWorkerModal = (skill) => {
    const holder = hiring.crew.bySkill(skill.id);
    const pending = hiring.pendingFor(skill);
    const shown = pending === undefined ? holder : pending ?? undefined;
    const root = document.createElement('div');
    root.className = 'wf-worker-grid';
    const tile = ({ media, title, lines = [], gear, active = false, disabled = false, onClick }) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `wf-worker-tile${active ? ' wf-worker-tile-active' : ''}`;
      // Unavailable stays focusable (aria-disabled, not disabled), so the keyboard reaches its reason; the chosen tile
      // says so beyond its colour (scan C-34, build .112).
      if (disabled) b.setAttribute('aria-disabled', 'true');
      if (active) b.setAttribute('aria-current', 'true');
      const img = document.createElement('img');
      img.className = 'wf-worker-portrait';
      img.src = media;
      img.alt = '';
      b.append(img);
      const text = document.createElement('div');
      text.className = 'wf-worker-text';
      const head = document.createElement('div');
      head.className = 'font-w700';
      head.textContent = title;
      text.append(head);
      for (const line of lines) {
        const entry = typeof line === 'string' ? { text: line } : line;
        if (Array.isArray(entry.badges)) {
          const row = document.createElement('div');
          row.className = 'wf-worker-line wf-worker-badges';
          for (const badge of entry.badges) {
            const span = document.createElement('span');
            span.className = badge.cls;
            span.textContent = badge.text;
            row.append(span);
          }
          text.append(row);
          continue;
        }
        if (Array.isArray(entry.effects)) {
          const row = document.createElement('div');
          row.className = 'wf-worker-line wf-effects wf-subtle';
          row.append(effectsFragment(entry.effects));
          text.append(row);
          continue;
        }
        const segments = Array.isArray(entry.segments) ? entry.segments : (entry.text ? [{ icon: entry.icon, text: entry.text }] : []);
        if (segments.length === 0) continue;
        const s = document.createElement('small');
        s.className = `d-block wf-worker-line ${entry.cls ?? ''}`.trim();
        for (const seg of segments) {
          if (seg.icon) {
            const icon = document.createElement('img');
            icon.className = 'wf-line-icon';
            icon.src = seg.icon;
            icon.alt = '';
            s.append(icon);
          }
          if (seg.text) s.append(document.createTextNode(seg.text));
        }
        text.append(s);
      }
      // What the Folk wears, as one short line like the card's Gear button: "Gear 13/15", then "1 ran out" in amber
      // (build .74; the row of 20px item icons was too small to read). Nothing when the Folk wears nothing.
      if (gear !== undefined && gear.filled > 0) {
        const s = document.createElement('small');
        s.className = 'd-block wf-worker-line wf-subtle';
        s.textContent = templateLangString('MOD_WF_BUTTON_GEAR_COUNT', { filled: `${gear.filled}`, open: `${gear.open}` });
        if (gear.out.length > 0) {
          const out = document.createElement('span');
          out.className = 'text-warning font-w600';
          out.textContent = ` · ${templateLangString('MOD_WF_TILE_GEAR_OUT', { count: `${gear.out.length}` })}`;
          s.append(out);
        }
        text.append(s);
      }
      b.append(text);
      b.onclick = () => { if (disabled) return; onClick(); Swal.close(); };
      root.append(b);
    };
    tile({
      media: skill.media,
      title: getLangString('MOD_WF_CTRL_YOU'),
      lines: [getLangString('MOD_WF_CTRL_YOU_LINE')],
      active: shown === undefined,
      onClick: () => hiring.setWorker(skill, null),
    });
    const options = hiring.workerOptions(skill);
    options.forEach((opt) => tile({
      media: hiring.portrait(opt.tier),
      title: `${opt.name} (${hiring.roleName(opt.tier)})`,
      lines: opt.lines,
      gear: (() => { const f = hiring.crew.byId(opt.id); return f === undefined ? undefined : hiring.loadout?.summary(f); })(),
      active: shown !== undefined && opt.id === shown.id,
      disabled: !opt.available,
      onClick: () => hiring.setWorker(skill, opt.id),
    }));
    if (options.length === 0) {
      // No Folk hired yet: a tile-shaped hint beside "You" until the first hire, with the way to the Shop (scan B-07, C-05, build .112).
      const none = document.createElement('div');
      none.className = 'wf-worker-none';
      const line = document.createElement('div');
      line.textContent = getLangString('MOD_WF_CTRL_NO_FOLKS');
      const shop = document.createElement('button');
      shop.type = 'button';
      shop.className = 'btn btn-outline-info';
      shop.textContent = getLangString('MOD_WF_BUTTON_OPEN_SHOP');
      shop.onclick = () => { Swal.close(); hiring.openShop(); };
      none.append(line, shop);
      root.append(none);
    }
    // Columns: up to three, never more than there are tiles, so the popup hugs the grid (build .52, user report:
    // on a ~960px window two columns sat left with an empty third on the right). The CSS picks 3, 2 or 1 by width.
    const n = root.childElementCount;
    root.style.setProperty('--wf-cols3', `${Math.max(1, Math.min(n, 3))}`);
    root.style.setProperty('--wf-cols2', `${Math.max(1, Math.min(n, 2))}`);
    SwalLocale.fire({
      didRender: popupDidRender,
      title: templateLangString('MOD_WF_CTRL_PICK_TITLE', { skill: hiring.skillName(skill) }),
      html: root,
      showConfirmButton: false,
      showCloseButton: true,
      customClass: (typeof createSwalCustomClass === 'function' ? createSwalCustomClass({ popup: 'wf-worker-popup wf-ui wf-tool' }) : { popup: 'wf-worker-popup wf-ui wf-tool' }),
    });
  };

  const renderOne = (skill, root) => {
    const q = (key) => root.querySelector(`[data-wf="${key}"]`);
    const holder = hiring.crew.bySkill(skill.id);
    const pending = hiring.pendingFor(skill); // Folk | null (you, at next start) | undefined
    const shown = pending === undefined ? holder : pending ?? undefined;
    const working = holder !== undefined && hiring.delegated.has(skill);
    const icon = q('icon');
    if (icon.getAttribute('src') !== hiring.media) icon.src = hiring.media;

    const button = q('folk-button');
    const who = shown === undefined ? getLangString('MOD_WF_CTRL_YOU') : `${shown.name} (${hiring.roleName(shown.tier)})`;
    const buttonKey = `${who}|${shown?.tier ?? ''}`;
    if (button.dataset.wfKey !== buttonKey) {
      button.dataset.wfKey = buttonKey;
      button.replaceChildren();
      if (shown !== undefined) {
        const img = document.createElement('img');
        img.className = 'wf-ctrl-portrait mr-1';
        img.alt = '';
        img.src = hiring.portrait(shown.tier);
        button.append(img);
      }
      button.append(document.createTextNode(who));
      // The caret is decoration; the label says what the button does and that it opens a picker (scan C-33, C-34).
      const caret = document.createElement('span');
      caret.setAttribute('aria-hidden', 'true');
      caret.textContent = ' ▾';
      button.append(caret);
      button.setAttribute('aria-label', templateLangString('MOD_WF_CTRL_BUTTON_LABEL', { name: who }));
      button.setAttribute('aria-haspopup', 'dialog');
    }
    button.onclick = () => openWorkerModal(skill);

    // "N of M Shift Slots in use", its own piece that never splits and never takes the status colour (scan B-09, B-22).
    const slots = templateLangString('MOD_WF_CTRL_SLOTS', { used: `${hiring.delegated.size}`, slots: `${hiring.shiftSlots}` });
    let status;
    let tone = 'wf-subtle';
    let showSlots = true;
    let goto = false;
    if (holder === undefined && pending === undefined && hiring.highestLicence === null) {
      // Before the first licence: what the box is for and where to start, no "Shift Slots 0/0" (scan C-04, build .112).
      status = getLangString('MOD_WF_CTRL_NO_LICENCE');
      showSlots = false;
      goto = true;
    } else if (pending === null) {
      status = templateLangString('MOD_WF_CTRL_PENDING_YOU', { name: holder?.name ?? '?' });
      tone = 'text-warning font-w600';
    } else if (pending !== undefined) {
      const from = pending.skillId === null ? '' : hiring.skillName(pending.skillId);
      status = templateLangString('MOD_WF_CTRL_PENDING', { name: pending.name, skill: from });
      tone = 'text-warning font-w600';
    } else if (holder === undefined) status = '';
    else if (!working && hiring.struck(holder)) {
      // A striking or resting Folk isn't ready to work (build .81: the box said "ready" through the whole strike).
      status = templateLangString('MOD_WF_CTRL_STRIKE', { name: holder.name });
      tone = 'text-danger font-w600';
      goto = true; // the line sends the player to the Hiring page: a link there (scan B-37)
    } else if (!working && holder.cooldownTicks > 0) {
      // "Cooling down" in blue with the time left, as the card and the popup tile (scan B-02, C-17, build .112).
      status = templateLangString('MOD_WF_CTRL_RESTING', { name: holder.name, time: hiring.cooldownLeft(holder) });
      tone = 'wf-text-cooldown font-w600';
    } else if (!working && hiring.workRefusal(holder, skill) !== '') {
      // Not qualified yet, or refused where it stands (Voyage): idle with the reason, in amber, never "start any action".
      status = templateLangString('MOD_WF_CTRL_REFUSED', { name: holder.name, reason: hiring.workRefusal(holder, skill) });
      tone = 'text-warning font-w600';
    } else if (!working) {
      // Ready to work is news, not a footnote: normal text, not muted (build .55); "idle" like the card (B-38).
      status = templateLangString('MOD_WF_CTRL_READY', { name: holder.name });
      tone = 'font-w600';
    }
    else if (hiring.debtText(holder) !== null) {
      const d = hiring.debtText(holder);
      status = templateLangString(d.loyal ? 'MOD_WF_CTRL_DEBT_LOYAL' : 'MOD_WF_CTRL_DEBT', { name: holder.name, amount: d.amount, minutes: d.minutes });
      tone = 'text-warning font-w600';
    } else {
      const action = hiring.currentActionName(skill);
      status = action === null
        ? templateLangString('MOD_WF_CTRL_WORKING', { name: holder.name })
        : templateLangString('MOD_WF_CTRL_WORKING_ON', { name: holder.name, action });
      tone = 'text-success font-w600';
    }
    const statusEl = q('status');
    const parts = [];
    if (status !== '') parts.push(document.createTextNode(status));
    if (showSlots) {
      const piece = document.createElement('span');
      piece.className = 'wf-ctrl-slots wf-subtle font-w400';
      piece.textContent = status === '' ? slots : ` · ${slots}`;
      parts.push(piece);
    }
    const key = JSON.stringify([status, showSlots ? slots : '', tone]);
    if (statusEl.dataset.wfKey !== key) {
      statusEl.dataset.wfKey = key;
      statusEl.replaceChildren(...parts);
      statusEl.className = `mr-3 my-1 ${tone}`;
    }
    const gotoEl = q('goto');
    if (gotoEl !== null) {
      gotoEl.classList.toggle('d-none', !goto);
      if (gotoEl.textContent !== getLangString('MOD_WF_CTRL_HIRING_PAGE')) gotoEl.textContent = getLangString('MOD_WF_CTRL_HIRING_PAGE');
      gotoEl.onclick = () => hiring.openPage();
    }

    const stop = q('stop');
    stop.classList.toggle('d-none', !working);
    if (stop.textContent !== getLangString('MOD_WF_BUTTON_STOP')) stop.textContent = getLangString('MOD_WF_BUTTON_STOP');
    stop.onclick = () => { if (holder !== undefined) hiring.stopFolk(holder); };
  };

  const renderAll = () => controls.forEach((root, skill) => renderOne(skill, root));

  ctx.onCharacterLoaded(() => {
    if (isDisabled()) return;
    hiring = getHiring();
    mount();
    renderAll();
    EVENTS.forEach((name) => hiring.events.on(name, renderAll));
    // Debt has no event of its own per action (build .81): the box showed "is working on" for a whole debt episode.
    // Re-render a skill's box after each action while its Folk owes wages (the minutes count down), and once more on
    // the action that clears the debt. Deferred, so the payroll listener on the same event has charged first.
    const owing = new Set();
    hiring.events.on('folkActionDone', ({ skill, folk, offline }) => {
      if (offline || folk === undefined) return;
      queueMicrotask(() => {
        const inDebt = folk.debt > 0 || folk.onStrike;
        if (!inDebt && !owing.has(skill)) return;
        if (inDebt) owing.add(skill);
        else owing.delete(skill);
        const root = controls.get(skill);
        if (root !== undefined) renderOne(skill, root);
      });
    });
    hiring.events.on('folkStruck', renderAll);
    // A cooling-down Folk's time left counts down in the box (build .112): its open page redraws once a second, and
    // only the line that changed is written.
    setInterval(() => {
      const open = game.openPage;
      controls.forEach((root, skill) => {
        const holder = hiring.crew.bySkill(skill.id);
        if (holder === undefined || !(holder.cooldownTicks > 0)) return;
        if (open !== undefined && !(open.action === skill || open.skills?.includes?.(skill))) return;
        renderOne(skill, root);
      });
    }, 1000);
  });
}
