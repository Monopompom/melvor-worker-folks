// Payroll Reserve panel on the Hiring page. Game-facing (DOM only).

export const PANEL_ID = 'worker-folks-reserve';

/**
 * `model`: { enabled, lockedText?, capacityText, media, currencies: [{ id, name, media, amount, perHour, hours, capacity, room, bank }], onDeposit(id, amount) }
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
    cap.className = 'text-muted d-block mb-1';
    cap.textContent = model.capacityText;
    rows.append(cap);
  }
  for (const c of model.currencies) {
    const row = document.createElement('div');
    row.className = 'd-flex align-items-center flex-wrap mb-2';
    row.dataset.wfCurrency = c.id;
    const hours = c.hours === Infinity ? getLangString('MOD_WF_RESERVE_IDLE') : templateLangString('MOD_WF_RESERVE_COVERS', { hours: c.hours >= 100 ? `${Math.floor(c.hours)}` : c.hours.toFixed(1), perHour: numberWithCommas(c.perHour) });
    const info = document.createElement('span');
    info.className = 'mr-3 my-1';
    const capacity = c.capacity !== undefined && c.capacity !== Infinity ? ` / ${numberWithCommas(c.capacity)}` : '';
    info.innerHTML = `<img class="skill-icon-xs mr-1" src="${c.media}"><span class="font-w600">${numberWithCommas(c.amount)}</span>${capacity} ${c.name} <small class="text-muted">· ${hours}</small>`;
    row.append(info);

    const group = document.createElement('div');
    group.className = 'input-group input-group-sm wf-reserve-input my-1';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.className = 'form-control';
    input.placeholder = getLangString('MOD_WF_RESERVE_AMOUNT');
    input.value = drafts.get(c.id) ?? '';
    const append = document.createElement('div');
    append.className = 'input-group-append';
    const deposit = document.createElement('button');
    deposit.type = 'button';
    deposit.className = 'btn btn-success';
    deposit.textContent = getLangString('MOD_WF_BUTTON_DEPOSIT');
    deposit.onclick = () => {
      const amount = Math.floor(Number(input.value));
      if (amount > 0 && model.onDeposit(c.id, amount)) input.value = '';
    };
    append.append(deposit);
    group.append(input, append);
    row.append(group);

    const quick = document.createElement('div');
    quick.className = 'ml-2 my-1';
    const addQuick = (label, amount) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-sm btn-outline-info mr-1';
      b.textContent = label;
      const room = c.room === undefined ? Infinity : c.room;
      b.disabled = !(amount > 0) || amount > c.bank || room <= 0;
      b.onclick = () => model.onDeposit(c.id, amount);
      quick.append(b);
    };
    if (c.perHour > 0) {
      addQuick(templateLangString('MOD_WF_RESERVE_QUICK_HOURS', { hours: '1' }), c.perHour);
      addQuick(templateLangString('MOD_WF_RESERVE_QUICK_HOURS', { hours: '10' }), c.perHour * 10);
    }
    addQuick(getLangString('MOD_WF_RESERVE_QUICK_ALL'), Math.min(c.bank, c.room === undefined ? Infinity : c.room));
    row.append(quick);
    rows.append(row);
  }
  return true;
}
