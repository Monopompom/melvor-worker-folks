// The Hiring page's Overview block (build .95, the user, 18 Oct 2026: a dashboard where the Tips block was; Tips
// live behind its "?" now). Build .98 (the user): the Payroll Reserve merged in, at one fixed height that holds a full
// crew. Title row: the Next unlock pill (gone once every milestone is reached). Three bands: At work (one line a Folk,
// trouble first, scrolls), Payroll (reserve-panel.mjs: wages, reserve and deposit), Made this session (XP chips,
// currencies, item chips that scroll). Game-facing; the pure parts are in dashboard-model.mjs, passed in from setup.mjs.
//
// "Made this session" counts what arrives while a Folk acts (acting.mjs sets `hiring.acting`): the acting skill's XP,
// items into the bank and currencies. Kept in memory only: a reload starts it again, nothing goes in the save.
//
// wire() builds the block at the top of the page's column of blocks (before layout.mjs wires the page); render()
// redraws At work, Made and the pill when something changed and the page is shown; markDirty() asks for that.

const CONTAINER_ID = 'worker-folks-container';
export const BLOCK_ID = 'worker-folks-overview';

export function install(ctx, { getHiring, model, milestones, tips, popupDidRender, log }) {
  let hiring;
  const tally = model.createTally();
  let dirty = true;
  let block = null;
  let grid = null;
  let workBand = null;
  let madeBand = null;
  let pill = null;
  /** What each part shows now: a part is redrawn only when its own view changed (scan C-36, build .112). */
  const shownKeys = { work: '', made: '', next: '' };

  const mark = () => { dirty = true; };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    for (const name of ['folkActionDone', 'crewChanged', 'folkStruck', 'folkInDebt', 'folkReleased', 'folkStarted', 'folkDied']) {
      try { hiring.events.on(name, mark); } catch (err) { log('overview listener failed', name, err); }
    }
  });

  // What a Folk's action brings in. Only while that Folk acts, never the player's own actions.
  ctx.patch(Skill, 'addXP').replace(function (original, amount, action) {
    const acting = hiring?.acting;
    if (acting === undefined || acting.skill !== this) return original(amount, action);
    const before = this._xp;
    const result = original(amount, action);
    if (tally.addXP(this.id, this._xp - before)) dirty = true;
    return result;
  });
  ctx.patch(Bank, 'addItem').replace(function (original, item, quantity, ...rest) {
    const added = original(item, quantity, ...rest);
    if (added && hiring?.acting !== undefined && tally.addItem(item?.id, quantity)) dirty = true;
    return added;
  });
  ctx.patch(Currency, 'add').before(function (amount) {
    if (hiring?.acting !== undefined && tally.addCurrency(this.id, amount)) dirty = true;
  });

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const icon = (src, cls = 'wf-line-icon') => {
    const img = el('img', cls);
    img.src = src ?? '';
    img.alt = '';
    return img;
  };
  const n = (v) => numberWithCommas(Math.floor(v));

  /** One paragraph per sentence (scan A-28, C-07, build .112). */
  const paragraphs = (text) => text.split(/(?<=[.!?])\s+/).filter(Boolean).map((line) => el('p', 'wf-help-p', line));
  /** The reserve's capacity steps as a small table, from the code's own numbers (TIP_12; scan A-28, C-07). */
  const capacityTable = () => {
    const table = el('table', 'wf-help-table');
    const head = el('tr');
    head.append(el('th', '', getLangString('MOD_WF_TIP_12_LEVEL')), el('th', 'wf-num', getLangString('MOD_WF_TIP_12_HOLDS')));
    table.append(head);
    for (const [level, hours] of [...milestones.RESERVE_STEPS].sort((a, b) => a[0] - b[0])) {
      const row = el('tr');
      row.append(el('td', '', `${level}`), el('td', 'font-w600 wf-num', hours >= 168 ? templateLangString('MOD_WF_TIP_12_DAYS', { days: `${hours / 24}` }) : `${hours}\u00a0h`));
      table.append(row);
    }
    return table;
  };

  /** The tips, one band each, in the shared help-popup layout; "Your first Folk" first while nobody is hired. */
  const openTips = () => {
    const body = el('div', 'text-center wf-help-body'); // centred, as every popup (the user, 20 Oct 2026)
    const band = (head, ...parts) => {
      const b = el('div', 'wf-band');
      b.append(el('div', 'wf-help-head', head), ...parts);
      body.append(b);
    };
    if ((hiring?.crew?.size ?? 0) === 0) band(getLangString('MOD_WF_TIP_START_HEAD'), ...paragraphs(getLangString('MOD_WF_TIP_START')));
    for (const t of model.tipNumbers(hiring?.payroll?.enabled !== false)) {
      band(getLangString(`MOD_WF_TIP_${t}_HEAD`), ...paragraphs(getLangString(`MOD_WF_TIP_${t}`)), ...(t === 12 ? [capacityTable()] : []));
    }
    const cls = { popup: 'wf-ui', confirmButton: 'btn btn-success m-1' };
    SwalLocale.fire({
      didRender: popupDidRender,
      title: getLangString('MOD_WF_TIPS_TITLE'),
      width: '38rem',
      html: body,
      confirmButtonText: getLangString('MOD_WF_BUTTON_GOT_IT'),
      customClass: typeof createSwalCustomClass === 'function' ? createSwalCustomClass(cls) : cls,
    });
  };

  const wire = () => {
    if (block !== null) return;
    const column = document.getElementById(CONTAINER_ID)?.querySelector('[data-wf="blocks"]');
    if (column === undefined || column === null) return;
    block = el('div', 'block block-rounded border-top border-worker-folks border-4x');
    block.id = BLOCK_ID;
    const content = el('div', 'block-content wf-dash-content');
    // Title row: icon, "Overview", "?" (the tips), the Next unlock pill (build .98: it took a whole band before and
    // left it empty once every milestone was reached); layout.mjs adds the fold caret and the grip.
    const head = el('div', 'd-flex align-items-center flex-wrap mb-3 wf-dash-title');
    if (hiring?.media) head.append(icon(hiring.media, 'skill-icon-sm mr-2'));
    head.append(el('h5', 'font-w600 mb-0', getLangString('MOD_WF_DASH_TITLE')));
    const help = el('button', 'btn btn-sm wf-help');
    help.type = 'button';
    // Named after its topic, no tooltip: the same "?" as every other (scan A-29, build .112).
    help.setAttribute('aria-label', getLangString('MOD_WF_HELP_LABEL_tips'));
    const q = el('i', 'fa fa-question-circle');
    q.setAttribute('aria-hidden', 'true');
    help.append(q);
    help.addEventListener('click', openTips);
    // Right side: the Payroll mini bar (shown only while the block is folded; reserve-panel.mjs fills it, the user,
    // build .98: a folded Overview still says whether wages are covered) and the Next unlock pill.
    const right = el('div', 'ml-auto d-flex align-items-center wf-dash-right');
    const payMini = el('div', 'wf-dash-paymini');
    payMini.dataset.wf = 'paymini';
    pill = el('div', 'wf-dash-pill wf-dash-next d-none');
    right.append(payMini, pill);
    head.append(help, right);
    // Three bands at one fixed height: At work, Payroll (reserve-panel.mjs fills it; it is never redrawn from here, so
    // the amount field keeps its focus), Made this session. On a phone they stack, Payroll first.
    grid = el('div', 'wf-dash-grid');
    workBand = el('div', 'wf-band wf-dash-band wf-dash-work');
    const payBand = el('div', 'wf-band wf-dash-band wf-dash-pay');
    payBand.dataset.wf = 'payroll';
    madeBand = el('div', 'wf-band wf-dash-band wf-dash-made');
    grid.append(workBand, payBand, madeBand);
    content.append(head, grid);
    block.append(content);
    column.prepend(block);
    dirty = true;
  };

  // ---- What the bands show (plain data, so a signature tells when to redraw) ----

  const workView = () => {
    const rows = model.rosterOrder(hiring.crew.all.map((folk) => {
      const status = hiring.statusOf(folk);
      const skill = hiring.skillOf(folk);
      const action = hiring.currentAction(skill);
      const skillText = skill === undefined ? getLangString('MOD_WF_UNASSIGNED') : hiring.skillName(skill);
      return {
        slot: folk.slot,
        name: folk.name,
        // The first name tells Folks apart (names.mjs spreads first names before repeating them); the whole one is in
        // the row's tooltip (scan A-07, A-10, build .112).
        first: folk.name.split(' ')[0],
        status,
        statusIcon: hiring.getMediaURL(`assets/status_${status}.webp`),
        statusText: getLangString(`MOD_WF_STATUS_${status}`),
        skillIcon: skill?.media,
        skillText,
        action: action?.name ?? '',
        working: skill !== undefined && hiring.delegated.has(skill),
      };
    }));
    return { rows, working: rows.filter((r) => r.working).length, total: rows.length };
  };

  const madeView = () => {
    const items = model.topEntries(tally.items, model.ITEM_CHIPS);
    return {
      xp: model.topEntries(tally.xp, Infinity).shown.map(([id, xp]) => {
        const skill = hiring.game.skills.getObjectByID(id);
        return { media: skill?.media, name: skill === undefined ? id : hiring.skillName(skill), xp: Math.floor(xp) };
      }),
      currencies: [...tally.currencies].map(([id, amount]) => {
        const c = hiring.game.currencies.getObjectByID(id);
        return { media: c?.media, name: c?.name ?? id, amount: Math.floor(amount) };
      }),
      items: items.shown.map(([id, count]) => ({ id, count, media: hiring.game.items.getObjectByID(id)?.media })),
      more: items.more,
      kinds: tally.items.size,
    };
  };

  const nextView = () => {
    const next = model.nextMilestone(milestones.MILESTONES, { level: hiring.level, levelCap: hiring.currentLevelCap });
    if (next === null) return null;
    let percent = null;
    if (!next.capped && typeof exp !== 'undefined') {
      percent = Math.floor(100 * model.progressTo(hiring.xp, exp.levelToXP(hiring.level), exp.levelToXP(next.level)));
    }
    return { level: next.level, text: getLangString(`MOD_WF_MILESTONE_${next.key}`), capped: next.capped, percent };
  };

  // ---- Drawing ----

  const bandHead = (text, right) => {
    const h = el('div', 'wf-dash-head d-flex align-items-center');
    h.append(el('span', '', text));
    if (right !== undefined) h.append(right);
    return h;
  };
  const note = (text, cls = 'wf-subtle') => el('div', cls, text);
  const short = (v) => (typeof formatNumber === 'function' ? formatNumber(Math.floor(v)) : n(v));

  /**
   * One line a Folk (trouble first): skill icon, first name, skill, then the status icon and word in its colour (never
   * an icon alone; scan A-07); the whole name, skill and action in its tooltip.
   */
  const drawWork = (v) => {
    const count = el('span', `ml-auto font-w600 ${v.working > 0 ? 'text-success' : 'wf-subtle'}`, templateLangString('MOD_WF_DASH_AT_WORK_COUNT', { working: `${v.working}`, total: `${v.total}` }));
    const list = el('div', 'wf-dash-scroll wf-dash-roster');
    if (v.rows.length === 0) list.append(note(getLangString('MOD_WF_DASH_NOBODY')));
    for (const r of v.rows) {
      const row = el('div', 'wf-dash-row');
      // No skill yet: an empty spot the icon's size, so the names line up.
      row.append(r.skillIcon ? icon(r.skillIcon) : el('span', 'wf-line-icon wf-dash-row-blank'), el('span', 'wf-dash-row-name', r.first), el('span', 'wf-subtle wf-dash-row-skill', r.skillText));
      const st = el('span', `wf-dash-row-status wf-text-${r.status}`);
      st.append(icon(r.statusIcon, ''), el('span', '', r.statusText));
      row.append(st);
      tips?.set(row, `${r.name}\n${r.statusText} · ${r.action ? `${r.skillText} · ${r.action}` : r.skillText}`);
      list.append(row);
    }
    workBand.replaceChildren(bandHead(getLangString('MOD_WF_DASH_WORK'), count), list);
  };

  /** XP as skill chips, currencies on one line, then the item chips in their own scroll box. */
  const drawMade = (v) => {
    const kinds = v.kinds > 0 ? el('span', 'ml-auto wf-subtle', (v.kinds === 1 ? getLangString('MOD_WF_DASH_KINDS_ONE') : templateLangString('MOD_WF_DASH_KINDS', { count: `${v.kinds}` }))) : undefined;
    const parts = [bandHead(getLangString('MOD_WF_DASH_MADE'), kinds)];
    if (v.xp.length === 0 && v.currencies.length === 0 && v.items.length === 0) {
      parts.push(note(getLangString('MOD_WF_DASH_NOTHING')));
      madeBand.replaceChildren(...parts);
      return;
    }
    // Currencies first, then XP, all as the same chips on one row (the user, build .98).
    if (v.xp.length > 0 || v.currencies.length > 0) {
      const xp = el('div', 'wf-dash-xp');
      const chip = (media, amount, tip) => {
        const c = el('span', 'wf-dash-xp-chip');
        if (media) c.append(icon(media));
        c.append(el('span', 'font-w600 text-success', `+${short(amount)}`));
        tips?.set(c, tip);
        xp.append(c);
      };
      for (const c of v.currencies) chip(c.media, c.amount, `${c.name}\n+${n(c.amount)}`);
      for (const x of v.xp) chip(x.media, x.xp, `${x.name}\n${templateLangString('MOD_WF_DASH_XP', { xp: n(x.xp) })}`);
      parts.push(xp);
    }
    if (v.items.length > 0) {
      const chips = el('div', 'wf-dash-scroll wf-dash-items');
      for (const it of v.items) {
        const chip = el('div', 'wf-dash-item');
        chip.append(icon(it.media, 'wf-dash-item-icon'), el('span', 'wf-dash-item-count', short(it.count)));
        tips?.set(chip, [{ item: it.id }]);
        chips.append(chip);
      }
      if (v.more > 0) chips.append(note((v.more === 1 ? getLangString('MOD_WF_DASH_MORE_ONE') : templateLangString('MOD_WF_DASH_MORE', { count: `${v.more}` })), 'wf-subtle wf-dash-more'));
      parts.push(chips);
    }
    madeBand.replaceChildren(...parts);
  };

  /** The Next unlock pill in the title row, naming what unlocks (scan A-08, build .112); gone once every milestone is reached. */
  const drawNext = (v) => {
    pill.classList.toggle('d-none', v === null);
    if (v === null) { pill.replaceChildren(); return; }
    const parts = [el('span', `wf-dash-next-text${v.capped ? ' text-warning' : ''}`, templateLangString('MOD_WF_DASH_NEXT_PILL', { level: `${v.level}`, text: v.text }))];
    if (v.capped) parts.push(el('span', 'text-warning', getLangString('MOD_WF_MILESTONE_CAPPED')));
    else if (v.percent !== null) {
      const bar = el('div', 'progress wf-dash-bar');
      const fill = el('div', 'progress-bar bg-info');
      fill.setAttribute('role', 'progressbar');
      fill.style.width = `${v.percent}%`;
      bar.append(fill);
      parts.push(bar, el('span', 'font-w600', `${v.percent}%`));
    }
    pill.replaceChildren(...parts);
  };

  const render = () => {
    if (!dirty || grid === null || hiring === undefined) return;
    if (document.getElementById(CONTAINER_ID)?.classList.contains('d-none')) return; // drawn when the page shows
    dirty = false;
    try {
      const draws = { work: [workView, drawWork], made: [madeView, drawMade], next: [nextView, drawNext] };
      let drawn = false;
      for (const [part, [view, draw]] of Object.entries(draws)) {
        const v = view();
        const key = JSON.stringify(v);
        if (key === shownKeys[part]) continue;
        shownKeys[part] = key;
        draw(v);
        drawn = true;
      }
      if (drawn) tips?.sweep?.();
    } catch (err) { log('overview failed', err); }
  };

  return { wire, render, markDirty: mark, tally };
}
