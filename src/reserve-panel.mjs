// Payroll Reserve panel on the Hiring page. Game-facing (DOM only).

export const PANEL_ID = 'worker-folks-reserve';

/**
 * `model`: { enabled, lockedText?, capacityText, media, currencies: [{ id, name, media, amount, perHour, hours, low, capacity, room, bank }], onDeposit(id, amount) }
 * onDeposit reports its own outcome (notifications) and returns true when something went in.
 * The deposit input keeps its value across re-renders.
 */
export function renderReservePanel(model) {
  const panel = document.getElementById(PANEL_ID);
  if (panel === null) return false;
  panel.classList.toggle('d-none', !model.enabled);
  if (!model.enabled) return true;
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
  if (model.lockedText !== undefined) {
    const locked = document.createElement('small');
    locked.className = 'text-warning';
    locked.textContent = model.lockedText;
    rows.append(locked);
    return true;
  }
  if (model.capacityText) {
    const cap = document.createElement('small');
    cap.className = 'd-block mb-2';
    cap.textContent = model.capacityText;
    rows.append(cap);
  }
  // One block per currency, laid out like the bank's Sell block: what you hold, the amount field, presets
  // that fill it, one green Deposit, and an amber line saying why it can't be used (build .55).
  const grid = document.createElement('div');
  grid.className = 'row';
  for (const c of model.currencies) {
    const col = document.createElement('div');
    col.className = 'col-12 col-md-6 col-xl-4';
    const block = document.createElement('div');
    block.className = 'wf-band wf-reserve-block mb-2';
    block.dataset.wfCurrency = c.id;
    col.append(block);

    const room = c.room === undefined ? Infinity : c.room;
    const capacity = c.capacity !== undefined && c.capacity !== Infinity ? ` / ${numberWithCommas(c.capacity)}` : '';
    const info = document.createElement('div');
    info.innerHTML = `<img class="skill-icon-xs mr-1" src="${c.media}" alt=""><span class="font-w600">${numberWithCommas(c.amount)}</span>${capacity} ${c.name}`;
    const hours = document.createElement('div');
    hours.className = c.low ? 'text-warning font-w600' : 'wf-subtle';
    hours.textContent = c.hours === Infinity ? getLangString('MOD_WF_RESERVE_IDLE') : templateLangString('MOD_WF_RESERVE_COVERS', { hours: c.hours >= 100 ? `${Math.floor(c.hours)}` : c.hours.toFixed(1), perHour: numberWithCommas(c.perHour) });
    block.append(info, hours);

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.inputMode = 'numeric';
    input.className = 'form-control wf-reserve-input mt-2';
    input.placeholder = getLangString('MOD_WF_RESERVE_AMOUNT');
    input.setAttribute('aria-label', `${getLangString('MOD_WF_RESERVE_AMOUNT')} (${c.name})`);
    input.value = drafts.get(c.id) ?? '';
    block.append(input);

    const most = Math.max(0, Math.floor(Math.min(c.bank, room)));
    const why = room <= 0 ? templateLangString('MOD_WF_RESERVE_FULL', { capacity: numberWithCommas(c.capacity ?? 0), currency: c.name })
      : !(c.bank >= 1) ? templateLangString('MOD_WF_RESERVE_NOTHING', { currency: c.name })
        : '';

    const presets = document.createElement('div');
    presets.className = 'wf-reserve-presets mt-2';
    // Presets fill the field (the bank's All / All but 1 do the same); Deposit commits.
    const addPreset = (label, value) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-sm btn-info';
      b.textContent = label;
      b.disabled = why !== '';
      b.onclick = () => { input.value = `${value()}`; };
      presets.append(b);
    };
    const current = () => Math.max(0, Math.floor(Number(input.value) || 0));
    if (c.perHour > 0) {
      addPreset(templateLangString('MOD_WF_RESERVE_QUICK_HOURS', { hours: '1' }), () => Math.min(most, current() + Math.ceil(c.perHour)));
      addPreset(templateLangString('MOD_WF_RESERVE_QUICK_HOURS', { hours: '10' }), () => Math.min(most, current() + Math.ceil(c.perHour * 10)));
    }
    addPreset(getLangString('MOD_WF_RESERVE_QUICK_ALL'), () => most);
    block.append(presets);

    const deposit = document.createElement('button');
    deposit.type = 'button';
    deposit.className = 'btn btn-success d-block mx-auto mt-2 wf-reserve-deposit';
    deposit.textContent = getLangString('MOD_WF_BUTTON_DEPOSIT');
    deposit.disabled = why !== '';
    deposit.onclick = () => { if (model.onDeposit(c.id, input.value)) input.value = ''; };
    block.append(deposit);

    if (why !== '') {
      const line = document.createElement('small');
      line.className = 'd-block text-warning mt-2';
      line.textContent = why;
      block.append(line);
    }
    grid.append(col);
  }
  rows.append(grid);
  return true;
}
