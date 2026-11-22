// The Hiring page's Overview block (build .95, the user, 18 Oct 2026: a dashboard where the Tips block was; Tips
// live behind its "?" now). Build .98 (the user): the Payroll Reserve merged in, at one fixed height that holds a full
// crew. Title row: the Next unlock pill (gone once every milestone is reached). Three bands: At work (one line a Folk,
// trouble first, scrolls), Payroll (reserve-panel.mjs: wages, reserve and deposit), Made this session (XP chips,
// currencies, item chips that scroll). Game-facing; the pure parts are in dashboard-model.mjs, passed in from setup.mjs.
//
// "Made this session" counts what arrives while a Folk acts (acting.mjs sets `hiring.acting`): the acting skill's XP,
// the items it makes (`folkMade`, from room.mjs: into the bank or held in the Folk's room) and currencies. Kept in memory only: a reload starts it again, nothing goes in the save.
//
// wire() builds the block at the top of the page's column of blocks (before layout.mjs wires the page); render()
// redraws At work, Made and the pill when something changed and the page is shown; markDirty() asks for that.

const CONTAINER_ID = 'worker-folks-container';
export const BLOCK_ID = 'worker-folks-overview';
/**
 * The bands' height, set by dragging the grip under them (build .250, a player's report: five Folks were too few to
 * read). In rem: today's 23 at least, three times that at most, half as tall again by default. Kept per browser.
 */
const HEIGHT_KEY = 'worker_folks:overview-height';
const HEIGHT_MIN = 23;
const HEIGHT_MAX = 69;
const HEIGHT_DEFAULT = 34.5;
const HEIGHT_STEP = 2;
/** The At work list's sort (a player's idea), kept per browser like the block layout. */
const SORT_KEY = 'worker_folks:overview-sort';
/** After a scroll, how long Made this session keeps its tiles where they are (touch has no pointer to watch). */
const MADE_SCROLL_HOLD_MS = 1500;

export function install(ctx, { getHiring, model, milestones, bulk, layout, tips, marquee, popupDidRender, log }) {
  let hiring;
  const tally = model.createTally();
  let dirty = true;
  let block = null;
  let grid = null;
  let workBand = null;
  let madeBand = null;
  let pill = null;
  /** At work's parts, built once: a list that stays in the page keeps its scrollbar and its drag. */
  let work = null;
  let sort = 'trouble';
  /** The pointer is down in the At work list, or a row is being dragged: its redraw waits. */
  let workHeld = false;
  let workDragging = false;
  /** Made this session's item box, its tiles by item id and their order; null while it shows no items. */
  let made = null;
  let madeHover = false;
  let madePressed = false;
  let madeScrolledAt = 0;
  /** What each part shows now: a part is redrawn only when its own view changed (scan C-36, build .112). */
  const shownKeys = { work: '', made: '', next: '' };

  const mark = () => { dirty = true; };

  ctx.onModsLoaded(() => {
    hiring = getHiring();
    for (const name of ['folkActionDone', 'folkJobWorked', 'crewChanged', 'folkStruck', 'folkInDebt', 'folkReleased', 'folkStarted', 'folkDied', 'folkMoved']) {
      try { hiring.events.on(name, mark); } catch (err) { log('overview listener failed', name, err); }
    }
    hiring.events.on('folkMade', ({ item, quantity }) => { if (tally.addItem(item?.id, quantity)) dirty = true; });
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

  /**
   * Puts `before` in front of `keep` and drops the band's other children, without ever moving `keep`: a scroll box
   * taken out of the page loses its position and ends a scrollbar drag in progress (a player's report).
   */
  const swapAround = (band, keep, before) => {
    for (const child of [...band.children]) if (child !== keep) child.remove();
    if (keep.parentNode !== band) band.append(keep);
    keep.before(...before);
  };

  // ---- The bands' height ----

  const rootPx = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const clampHeight = (rem) => Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, rem));
  const loadHeight = () => {
    try {
      const rem = parseFloat(localStorage.getItem(HEIGHT_KEY) ?? '');
      return Number.isFinite(rem) ? clampHeight(rem) : HEIGHT_DEFAULT;
    } catch { return HEIGHT_DEFAULT; }
  };
  let height = HEIGHT_DEFAULT;
  const setHeight = (rem, keep = true) => {
    height = clampHeight(Math.round(rem * 4) / 4);
    block?.style.setProperty('--wf-dash-h', `${height}rem`);
    grip?.setAttribute('aria-valuenow', `${height}`);
    if (!keep) return;
    try {
      if (height === HEIGHT_DEFAULT) localStorage.removeItem(HEIGHT_KEY);
      else localStorage.setItem(HEIGHT_KEY, `${height}`);
    } catch {}
  };
  let grip = null;
  /** A bar under the bands: drag it (mouse or touch), or Up and Down on the keyboard; a double click gives the usual height. */
  const makeGrip = () => {
    const g = el('div', 'wf-dash-resize');
    g.setAttribute('role', 'separator');
    g.setAttribute('aria-orientation', 'horizontal');
    g.setAttribute('aria-label', getLangString('MOD_WF_DASH_RESIZE_LABEL'));
    g.setAttribute('aria-valuemin', `${HEIGHT_MIN}`);
    g.setAttribute('aria-valuemax', `${HEIGHT_MAX}`);
    g.tabIndex = 0;
    g.append(el('span', 'wf-dash-resize-knob'));
    let drag = null;
    g.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      try { tippy.hideAll(); } catch {}
      drag = { y: e.clientY, rem: height, px: rootPx() };
      g.setPointerCapture(e.pointerId);
      g.classList.add('wf-dragging');
    });
    g.addEventListener('pointermove', (e) => {
      if (drag !== null) setHeight(drag.rem + (e.clientY - drag.y) / drag.px, false);
    });
    const end = () => {
      if (drag === null) return;
      drag = null;
      g.classList.remove('wf-dragging');
      setHeight(height);
    };
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
    g.addEventListener('lostpointercapture', end);
    g.addEventListener('dblclick', () => setHeight(HEIGHT_DEFAULT));
    g.addEventListener('keydown', (e) => {
      const step = { ArrowUp: -HEIGHT_STEP, ArrowDown: HEIGHT_STEP, Home: HEIGHT_MIN - height, End: HEIGHT_MAX - height }[e.key];
      if (step === undefined) return;
      e.preventDefault();
      setHeight(height + step);
    });
    tips?.set(g, getLangString('MOD_WF_DASH_RESIZE_TIP'));
    return g;
  };

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
      // Written as the milestones and the reserve help write it (build .136).
      row.append(el('td', '', `${level}`), el('td', 'font-w600 wf-num', milestones.capacityText(hours, templateLangString)));
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
    // Three bands in two columns at one fixed height: At work at the left; at the right Payroll (reserve-panel.mjs fills
    // it; it is never redrawn from here, so the amount field keeps its focus) over Made this session. On a phone they
    // stack, Payroll first.
    grid = el('div', 'wf-dash-grid');
    workBand = el('div', 'wf-band wf-dash-band wf-dash-work');
    const payBand = el('div', 'wf-band wf-dash-band wf-dash-pay');
    payBand.dataset.wf = 'payroll';
    madeBand = el('div', 'wf-band wf-dash-band wf-dash-made');
    grid.append(workBand, payBand, madeBand);
    buildWork();
    grip = makeGrip();
    content.append(head, grid, grip);
    block.append(content);
    setHeight(loadHeight(), false);
    column.prepend(block);
    dirty = true;
  };

  // ---- What the bands show (plain data, so a signature tells when to redraw) ----

  const workView = () => {
    const mine = sort === 'mine' ? (layout?.orderFolks(hiring.crew.all) ?? []).map((f) => f.id) : [];
    const rows = model.rosterOrder(hiring.crew.all.map((folk) => {
      const status = hiring.statusOf(folk);
      // Its skill, or its job (named and drawn as a skill; a job has no action line).
      const skill = hiring.workOf(folk);
      const action = skill?.isJob === true ? null : hiring.currentAction(skill);
      const skillText = skill === undefined ? getLangString('MOD_WF_UNASSIGNED') : hiring.skillName(skill);
      return {
        id: folk.id,
        slot: folk.slot,
        name: folk.name,
        // The first name tells Folks apart (names.mjs spreads first names before repeating them); the whole one is in
        // the row's tooltip (scan A-07, A-10, build .112). A nickname is shown whole: the player chose it.
        first: typeof folk.born === 'string' ? folk.name : folk.name.split(' ')[0],
        status,
        statusIcon: hiring.getMediaURL(`assets/status_${status}.webp`),
        statusText: getLangString(`MOD_WF_STATUS_${status}`),
        skillIcon: skill?.media,
        skillText,
        assigned: skill !== undefined,
        action: action?.name ?? '',
        working: hiring.isWorking(folk),
      };
    }), sort, mine);
    return { rows, sort, strikes: rows.filter((r) => r.status === 'strike').length, working: rows.filter((r) => r.working).length, total: rows.length, bulk: rows.length === 0 ? null : bulk?.view() ?? null };
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
    // After the pill's colon, so lower case where the name starts with a plain word (build .367); the milestone list keeps it.
    const pill = `MOD_WF_MILESTONE_${next.key}`; // after " · " the milestone keeps its capital (build .136)
    return { level: next.level, text: getLangString(pill), capped: next.capped, percent };
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

  // ---- The At work list ----

  const pickSort = (id) => {
    sort = model.cleanRosterSort(id);
    try {
      if (sort === 'trouble') localStorage.removeItem(SORT_KEY);
      else localStorage.setItem(SORT_KEY, sort);
    } catch {}
    shownKeys.work = '';
    dirty = true;
    render();
  };
  const resortMade = () => { shownKeys.made = ''; dirty = true; };
  const releasePointers = () => {
    if (workHeld) { workHeld = false; dirty = true; }
    if (madePressed) { madePressed = false; if (!madeHover) resortMade(); }
  };

  /** My order is the card order: a row dragged here moves its card, and a card dragged there moves its row. */
  const wireRosterDrag = () => {
    if (typeof Sortable !== 'function') return;
    const delayOnTouchOnly = typeof getSortableDelayOnTouch === 'function' ? getSortableDelayOnTouch() : true;
    const setSwipes = (off) => { try { if (typeof disableSwipeEvents !== 'undefined') disableSwipeEvents = off; } catch {} };
    try {
      work.drag = new Sortable(work.list, {
        group: { name: 'wf-roster', pull: false, put: false },
        draggable: '.wf-dash-row',
        disabled: sort !== 'mine',
        delay: 200,
        delayOnTouchOnly,
        animation: 150,
        onStart: () => {
          workDragging = true;
          try { tippy.hideAll(); } catch {}
          setSwipes(true);
        },
        onEnd: () => {
          workDragging = false;
          setSwipes(false);
          layout?.setCardOrder([...work.list.querySelectorAll('.wf-dash-row')].map((row) => row.dataset.wfRow));
          dirty = true;
        },
      });
    } catch (err) { log('Sortable failed (At work)', err); }
  };

  /** The band's head and list, once: the Sort menu stays open and the list keeps its scroll through every redraw. */
  const buildWork = () => {
    try { sort = model.cleanRosterSort(localStorage.getItem(SORT_KEY)); } catch {}
    const head = el('div', 'wf-dash-head d-flex align-items-center');
    head.append(el('span', '', getLangString('MOD_WF_DASH_WORK')));
    const drop = el('div', 'dropdown wf-dash-sort');
    const toggle = el('button', 'btn btn-sm btn-outline-info dropdown-toggle');
    toggle.type = 'button';
    toggle.dataset.toggle = 'dropdown';
    toggle.setAttribute('aria-haspopup', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    const menu = el('div', 'dropdown-menu font-size-sm');
    for (const id of model.ROSTER_SORTS) {
      const item = el('button', 'dropdown-item', getLangString(`MOD_WF_DASH_SORT_${id.toUpperCase()}`));
      item.type = 'button';
      item.dataset.wfSort = id;
      item.addEventListener('click', () => pickSort(id));
      menu.append(item);
    }
    // Written in the menu, not as a tooltip: a tooltip on this button would cover the menu it opens.
    menu.append(el('div', 'dropdown-divider'), el('small', 'dropdown-item-text wf-subtle wf-dash-sort-hint', getLangString('MOD_WF_DASH_SORT_MINE_TIP')));
    drop.append(toggle, menu);
    const strikes = el('span', 'badge badge-danger wf-dash-strikes d-none');
    const count = el('span', 'ml-auto font-w600');
    head.append(drop, strikes, count);
    const list = el('div', 'wf-dash-scroll wf-dash-roster');
    list.addEventListener('pointerdown', () => { workHeld = true; });
    window.addEventListener('pointerup', releasePointers);
    window.addEventListener('pointercancel', releasePointers);
    workBand.append(head, list);
    work = { drop, toggle, menu, strikes, count, list, bulk: null, drag: null };
    wireRosterDrag();
    layout?.onOrderChange(() => { if (sort === 'mine') { shownKeys.work = ''; dirty = true; } });
  };

  /**
   * Two lines a Folk: the skill icon over both, the first name and the status icon and word in its colour (never an icon
   * alone; scan A-07), the skill and its action under them; the whole name, skill and action in its tooltip.
   */
  const drawWork = (v) => {
    work.count.className = `ml-auto font-w600 ${v.working > 0 ? 'text-success' : 'wf-subtle'}`;
    work.count.textContent = templateLangString('MOD_WF_DASH_AT_WORK_COUNT', { working: `${v.working}`, total: `${v.total}` });
    const label = getLangString(`MOD_WF_DASH_SORT_${v.sort.toUpperCase()}`);
    work.drop.classList.toggle('d-none', v.total < 2);
    work.toggle.textContent = label;
    work.toggle.setAttribute('aria-label', templateLangString('MOD_WF_DASH_SORT_LABEL', { sort: label }));
    work.menu.querySelectorAll('.dropdown-item').forEach((b) => b.classList.toggle('active', b.dataset.wfSort === v.sort));
    work.drag?.option('disabled', v.sort !== 'mine');
    work.list.classList.toggle('wf-dash-roster-mine', v.sort === 'mine');
    // Outside Trouble first a strike can sit anywhere in the list: the head says so.
    const showStrikes = v.sort !== 'trouble' && v.strikes > 0;
    work.strikes.classList.toggle('d-none', !showStrikes);
    if (showStrikes) work.strikes.textContent = templateLangString('MOD_WF_DASH_STRIKES', { count: `${v.strikes}` });
    const rows = [];
    if (v.rows.length === 0) rows.push(note(getLangString('MOD_WF_DASH_NOBODY')));
    for (const r of v.rows) {
      const row = el('div', 'wf-dash-row');
      row.dataset.wfRow = r.id;
      // No skill yet: an empty spot the icon's size, so the names line up. A name or skill longer than its room slides to
      // its end and back (the user: "Running text"), the status beside it never cut.
      const text = (cls, value) => (typeof marquee === 'function' ? marquee('span', cls, value) : el('span', cls, value));
      // The second line names what the Folk works on after the skill ("Woodcutting · Normal Trees"); no action, the skill alone.
      const doing = r.action ? `${r.skillText} · ${r.action}` : r.skillText;
      row.append(r.skillIcon ? icon(r.skillIcon) : el('span', 'wf-line-icon wf-dash-row-blank'), text('wf-dash-row-name', r.first), text('wf-subtle wf-dash-row-skill', doing));
      const st = el('span', `wf-dash-row-status wf-text-${r.status}`);
      st.append(icon(r.statusIcon, ''), el('span', '', r.statusText));
      row.append(st);
      if (v.sort === 'mine') {
        const grip = el('span', 'wf-dash-row-grip');
        grip.setAttribute('aria-hidden', 'true');
        grip.append(el('i', 'fa fa-grip-vertical'));
        row.append(grip);
      }
      tips?.set(row, `${r.name}\n${r.statusText} · ${doing}`);
      rows.push(row);
    }
    work.list.replaceChildren(...rows);
    work.bulk?.remove();
    work.bulk = bulkButtons(v.bulk);
    workBand.append(work.bulk);
  };

  /**
   * Stop all, Restart all, Restock all, Settle all under the list (build .218): greyed when there is nothing for one to
   * do, the tooltip saying what it does and who it would act on. Last, Open shop (build .250, a player's idea: it fills
   * the cell beside Settle all; on a row of its own it takes the whole row); with nobody hired it is the only one. It goes
   * to another page rather than acting on the crew, so it looks apart: the game's Shop icon on a gold tint (build .251).
   */
  const bulkButtons = (b) => {
    const row = el('div', 'wf-dash-bulk');
    const shop = () => {
      const btn = el('button', 'btn btn-sm wf-dash-bulk-btn wf-dash-shop');
      btn.type = 'button';
      const media = hiring?.game?.pages?.getObjectByID('melvorD:Shop')?.media;
      if (media) btn.append(icon(media, 'wf-dash-shop-icon'));
      btn.append(el('span', 'wf-dash-shop-text', getLangString('MOD_WF_BUTTON_OPEN_SHOP')));
      btn.addEventListener('click', () => hiring?.openShop?.());
      tips?.set(btn, getLangString('MOD_WF_DASH_SHOP_TIP'));
      return btn;
    };
    if (b === null) {
      row.append(shop());
      return row;
    }
    const button = (kind, key, count, shown = true) => {
      if (!shown) return;
      const btn = el('button', `btn btn-sm ${kind === 'stop' ? 'btn-outline-danger' : 'btn-outline-primary'} wf-dash-bulk-btn`, getLangString(`MOD_WF_BULK_${key}`));
      btn.type = 'button';
      const off = count === 0;
      btn.classList.toggle('disabled', off);
      btn.setAttribute('aria-disabled', `${off}`);
      btn.addEventListener('click', () => { if (!btn.classList.contains('disabled')) bulk.run(kind, mark); });
      const who = off ? getLangString(`MOD_WF_BULK_${key}_NONE`) : templateLangString(`MOD_WF_BULK_${key}_COUNT`, { count: `${count}` });
      tips?.set(btn, [getLangString(`MOD_WF_BULK_${key}_TIP`), { text: who, cls: off ? 'text-muted' : 'font-w600' }]);
      row.append(btn);
    };
    button('stop', 'STOP', b.stop);
    button('restart', 'RESTART', b.restart);
    button('restock', 'RESTOCK', b.restock, b.showRestock);
    button('settle', 'SETTLE', b.settle, b.showSettle);
    row.append(shop());
    return row;
  };

  const madeHeld = () => madeHover || madePressed || Date.now() - madeScrolledAt < MADE_SCROLL_HOLD_MS;

  /**
   * The item tiles, updated in place (a player's report: rebuilding them on every item made ended a scrollbar drag): a
   * count changes on its own tile, a new kind joins, and most-made-first waits until the pointer has left the box.
   */
  const syncItems = (v) => {
    if (made === null) {
      const box = el('div', 'wf-dash-scroll wf-dash-items');
      box.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') madeHover = true; });
      box.addEventListener('pointerleave', () => { madeHover = false; if (!madePressed) resortMade(); });
      box.addEventListener('pointerdown', () => { madePressed = true; });
      box.addEventListener('scroll', () => { madeScrolledAt = Date.now(); }, { passive: true });
      made = { box, chips: new Map(), order: [], more: null };
    }
    const byId = new Map(v.items.map((it) => [it.id, it]));
    made.order = model.holdOrder(made.order, v.items.map((it) => it.id), madeHeld());
    for (const [id, chip] of made.chips) {
      if (byId.has(id)) continue;
      tips?.clear(chip.el);
      chip.el.remove();
      made.chips.delete(id);
    }
    let at = made.box.firstElementChild;
    for (const id of made.order) {
      const it = byId.get(id);
      let chip = made.chips.get(id);
      if (chip === undefined) {
        const tile = el('div', 'wf-dash-item');
        const count = el('span', 'wf-dash-item-count');
        tile.append(icon(it.media, 'wf-dash-item-icon'), count);
        tips?.set(tile, [{ item: id }]);
        chip = { el: tile, count };
        made.chips.set(id, chip);
      }
      const text = short(it.count);
      if (chip.count.textContent !== text) chip.count.textContent = text;
      if (chip.el === at) at = at.nextElementSibling;
      else made.box.insertBefore(chip.el, at);
    }
    if (v.more > 0) {
      if (made.more === null) made.more = note('', 'wf-subtle wf-dash-more');
      made.more.textContent = v.more === 1 ? getLangString('MOD_WF_DASH_MORE_ONE') : templateLangString('MOD_WF_DASH_MORE', { count: `${v.more}` });
      if (made.box.lastElementChild !== made.more) made.box.append(made.more);
    } else if (made.more !== null) {
      made.more.remove();
      made.more = null;
    }
  };

  /** XP as skill chips, currencies on one line, then the item chips in their own scroll box. */
  const drawMade = (v) => {
    const kinds = v.kinds > 0 ? el('span', 'ml-auto wf-subtle', (v.kinds === 1 ? getLangString('MOD_WF_DASH_KINDS_ONE') : templateLangString('MOD_WF_DASH_KINDS', { count: `${v.kinds}` }))) : undefined;
    const parts = [bandHead(getLangString('MOD_WF_DASH_MADE'), kinds)];
    if (v.xp.length === 0 && v.currencies.length === 0 && v.items.length === 0) {
      parts.push(note(getLangString('MOD_WF_DASH_NOTHING')));
      made = null;
      madeHover = false;
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
    if (v.items.length === 0) {
      made = null;
      madeHover = false;
      madeBand.replaceChildren(...parts);
      return;
    }
    syncItems(v);
    swapAround(madeBand, made.box, parts);
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
        if (part === 'work' && (workHeld || workDragging)) continue; // drawn again when the pointer lets go
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
