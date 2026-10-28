// The Hiring page's blocks can be dragged by their title row and folded to it (build .93, the user, 18 Oct 2026), so
// the blocks a player uses most can sit at the top. Kept per browser in localStorage (layout-model.mjs), never in the
// save. Game-facing (DOM only); everything here is built in JS on top of the page template.
//
// One column of blocks (build .98: the Payroll Reserve lives in the Overview now): the Overview and the cards' grid.
// The grid has no title row (the user, build .95): the Overview goes above or below it, and each Folk card moves
// within it by its top band (portrait, name, status), never folding.
// Dragging uses the game's own SortableJS (global `Sortable`, as the bank's tabs do); without it the blocks still fold.
// `wire({ rerender })` once the page is in the DOM; `orderFolks(folks)` before the cards are drawn and `dressCards()`
// after; `refresh()` after anything shows or hides a block.

const CONTAINER_ID = 'worker-folks-container';

/** `model` is src/layout-model.mjs, passed in from setup.mjs (modules loaded through ctx.loadModule don't import). */
export function install(ctx, { log, tips, model }) {
  const { COLUMNS, DEFAULT_COLS, STORAGE_KEY, cleanLayout, defaultLayout, isDefault, orderCards, parseLayout, pruneCards, serializeLayout, setFolded } = model;
  let layout = defaultLayout();
  let wired = false;
  const cols = {};
  const blocks = {};
  let resetButton = null;
  let list = null;
  /** The hired Folks' ids in slot order, from the last orderFolks(). */
  let live = [];
  let rerender = () => {};
  const isDefaultNow = () => isDefault(layout, DEFAULT_COLS, live);

  const load = () => {
    try { return parseLayout(localStorage.getItem(STORAGE_KEY)); } catch { return defaultLayout(); }
  };
  const save = () => {
    try {
      layout = pruneCards(layout, live);
      if (isDefaultNow()) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, serializeLayout(layout));
    } catch (err) { log('layout not saved', err); }
  };

  /** The caret at the left of a title row: folds the block to it (the game's ▸ / ▾ look). */
  const foldButton = (id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-sm wf-fold';
    b.dataset.wfFold = id;
    const i = document.createElement('i');
    i.className = 'fa fa-caret-down';
    i.setAttribute('aria-hidden', 'true');
    b.append(i);
    b.addEventListener('click', () => {
      layout = setFolded(layout, id, !layout.folded.includes(id));
      save();
      apply();
    });
    return b;
  };
  /** The ⠿ grip; a block moves by its title, a card by its name band, and each tooltip says which (scan A-15, .112). */
  const grip = (key = 'MOD_WF_LAYOUT_DRAG') => {
    const g = document.createElement('span');
    g.className = 'wf-grip';
    g.setAttribute('aria-hidden', 'true');
    const i = document.createElement('i');
    i.className = 'fa fa-grip-vertical';
    g.append(i);
    tips?.set(g, getLangString(key));
    return g;
  };
  const dress = (id, block, head) => {
    block.classList.add('wf-layout-block');
    block.dataset.wfBlock = id;
    head.classList.add('wf-layout-head');
    head.prepend(foldButton(id));
    head.append(grip());
    blocks[id] = block;
  };

  const idsIn = (col) => Array.from(col.children).filter((el) => el.dataset.wfBlock !== undefined).map((el) => el.dataset.wfBlock);

  /** The Reset button only while the layout isn't the default. */
  const refresh = () => {
    if (!wired) return;
    resetButton?.classList.toggle('d-none', isDefaultNow());
  };

  const apply = () => {
    for (const c of COLUMNS) {
      for (const id of layout.cols[c]) if (blocks[id] !== undefined) cols[c].append(blocks[id]);
    }
    for (const [id, block] of Object.entries(blocks)) {
      const folded = layout.folded.includes(id);
      block.classList.toggle('wf-folded', folded);
      const b = block.querySelector(`[data-wf-fold="${id}"]`);
      if (b !== null) {
        b.setAttribute('aria-expanded', folded ? 'false' : 'true');
        b.setAttribute('aria-label', getLangString(folded ? 'MOD_WF_LAYOUT_UNFOLD' : 'MOD_WF_LAYOUT_FOLD'));
        const i = b.querySelector('i');
        if (i !== null) i.className = folded ? 'fa fa-caret-right' : 'fa fa-caret-down';
      }
    }
    refresh();
  };

  const wireSortable = () => {
    if (typeof Sortable !== 'function') { log('Sortable missing: blocks fold but do not move'); return; }
    const container = document.getElementById(CONTAINER_ID);
    container?.classList.add('wf-layout-movable');
    const delayOnTouchOnly = typeof getSortableDelayOnTouch === 'function' ? getSortableDelayOnTouch() : true;
    const setSwipes = (off) => { try { if (typeof disableSwipeEvents !== 'undefined') disableSwipeEvents = off; } catch {} };
    const startDrag = () => {
      try { tippy.hideAll(); } catch {}
      setSwipes(true);
    };
    // The cards: their own group, so a card stays in the grid and no block drops into it.
    try {
      new Sortable(list, {
        group: { name: 'wf-cards', pull: false, put: false },
        handle: '.wf-card-head',
        filter: 'button, a, input, select, textarea',
        preventOnFilter: false,
        draggable: '.wf-card-col',
        delay: 200,
        delayOnTouchOnly,
        animation: 150,
        onStart: startDrag,
        onEnd: () => {
          setSwipes(false);
          layout = { ...layout, cards: Array.from(list.querySelectorAll(':scope > .wf-card-col')).map((el) => el.dataset.wfFolk) };
          save();
          refresh();
          rerender(); // the cards' rows changed: their heights are measured again
        },
      });
    } catch (err) { log('Sortable failed (cards)', err); }
    try {
      new Sortable(cols.wide, {
        group: { name: 'wf-layout', pull: false, put: false },
        handle: '.wf-layout-head',
        filter: 'button, a, input, select, textarea',
        preventOnFilter: false,
        draggable: '.wf-layout-block',
        delay: 200,
        delayOnTouchOnly,
        animation: 150,
        onStart: () => {
          startDrag();
          container?.classList.add('wf-layout-dragging');
        },
        onEnd: () => {
          setSwipes(false);
          container?.classList.remove('wf-layout-dragging');
          layout = { ...layout, ...cleanLayout({ cols: Object.fromEntries(COLUMNS.map((k) => [k, idsIn(cols[k])])), folded: layout.folded }), cards: layout.cards };
          save();
          apply();
        },
      });
    } catch (err) { log('Sortable failed', err); }
  };

  const wire = (opts = {}) => {
    if (wired) return;
    if (typeof opts.rerender === 'function') rerender = opts.rerender;
    const container = document.getElementById(CONTAINER_ID);
    const column = container?.querySelector('[data-wf="blocks"]');
    const overview = document.getElementById('worker-folks-overview');
    list = document.getElementById('worker-folks-folks');
    if (!container || !column || !overview || !list) return;
    const overviewHead = overview.querySelector('.wf-dash-content > .wf-dash-title');
    if (!overviewHead) return;
    wired = true;
    column.classList.add('wf-layout-col', 'wf-layout-wide');
    column.dataset.wfCol = 'wide';
    cols.wide = column;
    dress('dashboard', overview, overviewHead);
    // The Work Orders block (work-orders.mjs), dressed the same way when it is there.
    const orders = document.getElementById('worker-folks-orders');
    const ordersHead = orders?.querySelector('.wf-dash-content > .wf-dash-title');
    if (orders && ordersHead) dress('orders', orders, ordersHead);
    // The cards' grid: a place in the column the Overview moves around, with no title row to drag or fold it by.
    list.classList.add('wf-layout-block');
    list.dataset.wfBlock = 'crew';
    blocks.crew = list;
    column.append(list);

    const foot = document.createElement('div');
    foot.className = 'wf-layout-foot';
    resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'btn btn-sm btn-outline-info d-none';
    resetButton.textContent = getLangString('MOD_WF_LAYOUT_RESET');
    resetButton.addEventListener('click', () => {
      layout = defaultLayout();
      save();
      apply();
      rerender(); // the cards back in slot order
    });
    foot.append(resetButton);
    container.append(foot);

    layout = load();
    wireSortable();
    apply();
  };

  /** `folks` in the order the player dragged the cards (the rest by slot). */
  const orderFolks = (folks) => {
    const bySlot = [...folks].sort((a, b) => a.slot - b.slot);
    live = bySlot.map((f) => f.id);
    const at = new Map(orderCards(layout.cards, live).map((id, i) => [id, i]));
    return bySlot.sort((a, b) => at.get(a.id) - at.get(b.id));
  };

  /** A grip on every Folk card that has none yet: the card moves by its top band (the "who" band). */
  const dressCards = () => {
    if (list === null) return;
    list.querySelectorAll(':scope > [data-wf-folk]:not(.wf-card-col)').forEach((col) => {
      if (col.dataset.wfFolk.startsWith('frozen-')) return; // a frozen slot is not a Folk: it stays put
      const head = col.querySelector('.wf-band-who');
      const row = head?.querySelector('.justify-content-between');
      const badge = row?.querySelector('.wf-status');
      if (!head || !row || !badge) return;
      col.classList.add('wf-card-col');
      head.classList.add('wf-card-head');
      // The grip on the status badge's line (the user, build .96), not centred on the name and its subtitle.
      const end = document.createElement('div');
      end.className = 'wf-card-end';
      badge.before(end);
      end.append(badge, grip('MOD_WF_LAYOUT_DRAG_CARD'));
    });
    refresh();
  };

  return { wire, refresh, orderFolks, dressCards };
}
