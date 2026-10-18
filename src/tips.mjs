// Melvor's own tooltips (tippy), never the browser's `title` boxes. Every tooltip in the mod goes
// through here, so all of them look the same (the user, 17 Oct 2026; build .91): the text centred, and an item named
// in it has the item's icon before the name, as on the page. No other pictures.
//
// set(el, content, opts) gives an element its tooltip, or changes it when the content changed; '' or [] removes it.
// `content` is a string (line breaks kept) or a list of lines. A line is a string or
// `{ text, media, item, cls, parts }`: `item` (an item object or id) puts its icon before the text (the text defaults
// to the item's name), `media` puts that icon, `cls` colours the line the game's way, and `parts` (a list of
// `{ text, media, item }`) runs several pieces on one line ("Ran out: [icon] Bones, [icon] Ashes."). Built as DOM
// nodes, never as HTML from strings. Buttons show theirs on press-and-hold on a phone (`touch: 'hold'`: a tap acts).
// clear(el) removes one; sweep() destroys the tooltips of elements a redraw removed (a shown tooltip never gets its
// mouseleave once its button is gone).

export function install(ctx, { log }) {
  const live = new Set();

  const itemOf = (x) => {
    if (x == null) return undefined;
    if (typeof x === 'object') return x;
    try { return game.items.getObjectByID(x); } catch { return undefined; }
  };
  const icon = (src) => {
    const img = document.createElement('img');
    img.className = 'wf-tip-icon';
    img.src = src;
    img.alt = '';
    return img;
  };
  const piece = (row, p) => {
    const item = itemOf(p?.item);
    const media = p?.media ?? item?.media;
    if (media) row.append(icon(media));
    row.append(document.createTextNode(p?.text ?? item?.name ?? ''));
  };
  /** The centred box for `content` (a string or a list of lines, see above). */
  const box = (content) => {
    const div = document.createElement('div');
    div.className = 'wf-tip';
    for (const l of typeof content === 'string' ? [content] : content) {
      const row = document.createElement('div');
      row.className = `wf-tip-line${typeof l === 'object' && l?.cls ? ` ${l.cls}` : ''}`;
      if (typeof l === 'string') row.textContent = l;
      else for (const p of l?.parts ?? [l]) piece(row, p);
      div.append(row);
    }
    return div;
  };
  const keyOf = (content) => {
    try {
      return JSON.stringify(content, (k, v) => (k === 'item' && v !== null && typeof v === 'object' ? v.id : v));
    } catch { return String(Math.random()); }
  };
  const empty = (content) => content == null || content === '' || (Array.isArray(content) && content.length === 0);

  const clear = (el) => {
    const tip = el?._tippy;
    if (tip !== undefined) { try { tip.destroy(); } catch {} live.delete(tip); }
    if (el?.dataset) delete el.dataset.wfTip;
  };

  const set = (el, content, opts = {}) => {
    if (el == null || typeof tippy !== 'function') return undefined;
    if (empty(content)) { clear(el); return undefined; }
    const key = keyOf(content);
    if (el._tippy !== undefined) {
      if (el.dataset.wfTip !== key) { el._tippy.setContent(box(content)); el.dataset.wfTip = key; }
      return el._tippy;
    }
    try {
      const inst = tippy(el, {
        content: box(content), placement: 'top', interactive: false, animation: false,
        touch: el.matches('button, [role="button"], a') ? 'hold' : true, ...opts,
      });
      el.dataset.wfTip = key;
      live.add(inst);
      return inst;
    } catch (e) { log?.('tooltip failed', e); return undefined; }
  };

  const sweep = () => {
    for (const inst of [...live]) {
      if (!inst.reference.isConnected) { try { inst.destroy(); } catch {} live.delete(inst); }
    }
  };

  return { set, clear, sweep, box };
}
