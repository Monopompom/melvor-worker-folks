// Payroll Reserve panel and the Tips block beside it on the Hiring page. Game-facing (DOM only).

export const PANEL_ID = 'worker-folks-reserve';
export const TIPS_ID = 'worker-folks-tips';
/** Tips are MOD_WF_TIP_<n>_HEAD and MOD_WF_TIP_<n> in the language file, n = 1..TIP_COUNT. */
export const TIP_COUNT = 12;
/** Tips about wages, the reserve and strikes: left out while wages are off (No sweat). */
const WAGE_TIPS = new Set([1, 2, 5, 6, 9, 11, 12]);
let tipList = [];

/**
 * `model`: { enabled, lockedText?, capacityText, media, currencies: [{ id, name, media, amount, perHour, hours, low, capacity, room, bank }], onDeposit(id, amount) }
 * onDeposit reports its own outcome (notifications) and returns true when something went in.
 * The deposit input keeps its value across re-renders.
 */
export function renderReservePanel(model) {
  const panel = document.getElementById(PANEL_ID);
  if (panel === null) return false;
  panel.classList.toggle('d-none', !model.enabled);
  const column = panel.closest('[data-wf="reserve-col"]');
  column?.classList.toggle('d-none', !model.enabled);
  if (!model.enabled) {
    renderTips('col-12', false);
    return true;
  }
  const icon = panel.querySelector('[data-wf="reserve-icon"]');
  if (icon !== null) icon.src = model.media;
  const rows = panel.querySelector('[data-wf="reserve-rows"]');
  if (rows === null) return false;
  const drafts = new Map();
  rows.querySelectorAll('[data-wf-currency]').forEach((row) => {
    const input = row.querySelector('input');
    if (input !== null) drafts.set(row.dataset.wfCurrency, input.value);
  });
  rows.replaceChildren();
  const capacityLine = panel.querySelector('[data-wf="reserve-capacity"]');
  if (capacityLine !== null) {
    capacityLine.textContent = model.lockedText === undefined ? model.capacityText ?? '' : '';
    capacityLine.classList.toggle('d-none', !capacityLine.textContent);
  }
  // The panel is one card column wide, two when a second currency shows; the Tips block takes the rest of the row.
  const two = model.lockedText === undefined && model.currencies.length > 1;
  if (column !== null) column.className = two ? 'col-12 col-xl-8' : 'col-12 col-md-6 col-xl-4';
  renderTips(two ? 'col-12 col-xl-4' : 'col-12 col-md-6 col-xl-8', true);
  if (model.lockedText !== undefined) {
    const locked = document.createElement('div');
    locked.className = 'text-warning';
    locked.textContent = model.lockedText;
    rows.append(locked);
    return true;
  }
  // One action block per currency, laid out like the bank's Sell block: a header with the
  // amount on the right and a fill bar, the field with its presets on one row, a rule, one green Deposit centred.
  // When nothing can go in, one amber line says why in place of the controls (build .76).
  const grid = document.createElement('div');
  grid.className = 'row';
  for (const c of model.currencies) {
    const col = document.createElement('div');
    col.className = two ? 'col-12 col-md-6' : 'col-12';
    const block = document.createElement('div');
    block.className = 'wf-band wf-reserve-block';
    block.dataset.wfCurrency = c.id;
    col.append(block);

    const room = c.room === undefined ? Infinity : c.room;
    const bounded = c.capacity !== undefined && c.capacity !== Infinity && c.capacity > 0;
    const head = document.createElement('div');
    head.className = 'wf-reserve-head';
    head.innerHTML = `<span class="font-w600"><img class="skill-icon-xs mr-1" src="${c.media}" alt="">${c.name}</span>`
      + `<span><span class="font-w600">${numberWithCommas(c.amount)}</span>${bounded ? `<span class="wf-subtle"> / ${numberWithCommas(c.capacity)}</span>` : ''}</span>`;
    block.append(head);

    if (bounded) {
      const fill = Math.max(0, Math.min(100, (c.amount / c.capacity) * 100));
      const bar = document.createElement('div');
      bar.className = 'progress wf-reserve-bar';
      bar.innerHTML = `<div class="progress-bar ${c.amount <= 0 ? 'bg-danger' : c.low ? 'bg-warning' : 'bg-success'}" role="progressbar" style="width: ${fill}%"></div>`;
      block.append(bar);
    }
    const hours = document.createElement('div');
    hours.className = `wf-reserve-covers ${c.amount <= 0 && c.perHour > 0 ? 'text-danger font-w600' : c.low ? 'text-warning font-w600' : 'wf-subtle'}`;
    hours.textContent = c.hours === Infinity ? getLangString('MOD_WF_RESERVE_IDLE') : templateLangString('MOD_WF_RESERVE_COVERS', { hours: c.hours >= 100 ? `${Math.floor(c.hours)}` : c.hours.toFixed(1), perHour: numberWithCommas(c.perHour) });
    block.append(hours);

    const rule = document.createElement('hr');
    rule.className = 'wf-reserve-rule';
    block.append(rule);

    const most = Math.max(0, Math.floor(Math.min(c.bank, room)));
    const why = room <= 0 ? templateLangString('MOD_WF_RESERVE_FULL', { capacity: numberWithCommas(c.capacity ?? 0), currency: c.name })
      : !(c.bank >= 1) ? templateLangString('MOD_WF_RESERVE_NOTHING', { currency: c.name })
        : '';
    if (why !== '') {
      const line = document.createElement('div');
      line.className = 'text-warning text-center';
      line.textContent = why;
      block.append(line);
      grid.append(col);
      continue;
    }

    const controls = document.createElement('div');
    controls.className = 'wf-reserve-controls';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.inputMode = 'numeric';
    input.className = 'form-control wf-reserve-input';
    input.placeholder = getLangString('MOD_WF_RESERVE_AMOUNT');
    input.setAttribute('aria-label', `${getLangString('MOD_WF_RESERVE_AMOUNT')} (${c.name})`);
    input.value = drafts.get(c.id) ?? '';
    const presets = document.createElement('div');
    presets.className = 'wf-reserve-presets';
    // Presets fill the field (the bank's All / All but 1 do the same); Deposit commits.
    const addPreset = (label, value) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-sm btn-info';
      b.textContent = label;
      b.onclick = () => { input.value = `${value()}`; };
      presets.append(b);
    };
    const current = () => Math.max(0, Math.floor(Number(input.value) || 0));
    if (c.perHour > 0) {
      addPreset(templateLangString('MOD_WF_RESERVE_QUICK_HOURS', { hours: '1' }), () => Math.min(most, current() + Math.ceil(c.perHour)));
      addPreset(templateLangString('MOD_WF_RESERVE_QUICK_HOURS', { hours: '10' }), () => Math.min(most, current() + Math.ceil(c.perHour * 10)));
    }
    addPreset(getLangString('MOD_WF_RESERVE_QUICK_ALL'), () => most);
    controls.append(input, presets);
    block.append(controls);

    const deposit = document.createElement('button');
    deposit.type = 'button';
    deposit.className = 'btn btn-success d-block wf-reserve-deposit';
    deposit.textContent = getLangString('MOD_WF_BUTTON_DEPOSIT');
    deposit.onclick = () => { if (model.onDeposit(c.id, input.value)) input.value = ''; };
    block.append(deposit);
    grid.append(col);
  }
  rows.append(grid);
  return true;
}

// Tips (build .79): short facts from the player README, a page at a time with ‹ › to leaf through. The block is
// built once and only re-laid out afterwards (the reserve re-renders on every payroll change), so hovering a pager
// button never flickers. A page is two rows of as many tips as fit side by side (re-measured when the grid
// changes size); the first page is a random one.
let tipStart = -1;
let tipsWired = false;

function renderTips(columnClass, wagesOn) {
  const block = document.getElementById(TIPS_ID);
  if (block === null) return;
  const list = Array.from({ length: TIP_COUNT }, (_, i) => i + 1).filter((n) => wagesOn || !WAGE_TIPS.has(n));
  if (list.length !== tipList.length) tipStart = -1;
  tipList = list;
  const column = block.closest('[data-wf="tips-col"]');
  if (column !== null && column.className !== columnClass) column.className = columnClass;
  if (!tipsWired) {
    tipsWired = true;
    const prev = block.querySelector('[data-wf="tips-prev"]');
    const next = block.querySelector('[data-wf="tips-next"]');
    prev?.setAttribute('aria-label', getLangString('MOD_WF_TIPS_PREV'));
    next?.setAttribute('aria-label', getLangString('MOD_WF_TIPS_NEXT'));
    prev?.addEventListener('click', () => leaf(-1));
    next?.addEventListener('click', () => leaf(1));
    // The grid's own size, not the window's: the page is built hidden (width 0), and the game menu changes the width too.
    const grid = block.querySelector('[data-wf="tips-grid"]');
    if (grid !== null && typeof ResizeObserver === 'function') new ResizeObserver(() => layoutTips()).observe(grid);
  }
  layoutTips();
}

function tipsPerPage(grid) {
  const width = grid.clientWidth;
  if (width === 0) return 0;
  const min = 15 * (parseFloat(getComputedStyle(grid).fontSize) || 14);
  const columns = Math.max(1, Math.floor((width + 12) / (min + 12)));
  return Math.min(tipList.length, columns * 2);
}

function layoutTips() {
  const block = document.getElementById(TIPS_ID);
  const grid = block?.querySelector('[data-wf="tips-grid"]');
  if (grid === null || grid === undefined) return;
  const per = tipsPerPage(grid);
  if (per === 0) return; // hidden: laid out when the grid gets a size
  const pages = Math.ceil(tipList.length / per);
  if (tipStart < 0) tipStart = Math.floor(Math.random() * pages) * per;
  const page = Math.min(pages - 1, Math.floor(tipStart / per));
  const shown = [];
  for (let i = page * per; i < Math.min(tipList.length, (page + 1) * per); i += 1) shown.push(tipList[i]);
  const key = shown.join(',');
  if (grid.dataset.shown !== key) {
    grid.dataset.shown = key;
    grid.replaceChildren(...shown.map((n) => {
      const tip = document.createElement('div');
      tip.className = 'wf-band wf-tip';
      const head = document.createElement('div');
      head.className = 'font-w600';
      head.textContent = getLangString(`MOD_WF_TIP_${n}_HEAD`);
      const body = document.createElement('div');
      body.className = 'wf-subtle wf-tip-body';
      body.textContent = getLangString(`MOD_WF_TIP_${n}`);
      tip.append(head, body);
      return tip;
    }));
  }
  const count = block.querySelector('[data-wf="tips-page"]');
  if (count !== null) count.textContent = `${page + 1} / ${pages}`;
  block.querySelector('[data-wf="tips-pager"]')?.classList.toggle('d-none', pages < 2);
}

function leaf(step) {
  const grid = document.getElementById(TIPS_ID)?.querySelector('[data-wf="tips-grid"]');
  if (grid === null || grid === undefined) return;
  const per = tipsPerPage(grid);
  if (per === 0) return;
  const pages = Math.ceil(tipList.length / per);
  const page = (Math.floor(Math.max(0, tipStart) / per) + step + pages) % pages;
  tipStart = page * per;
  layoutTips();
}
