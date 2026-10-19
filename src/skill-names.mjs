// Skill names in our popups (the user 16 Oct 2026: "highlight skill names all the time in modals and
// add skill icon before name"): every skill name in a popup's title and body becomes the skill's icon and the name
// in bold. Done on the rendered DOM, so every string (en.json, templates, game names) follows without markup.
// Buttons, links, inputs and names already wrapped are left alone; `data-no-skill-names` opts a subtree out.

const SKIP = 'button, a, input, textarea, select, option, script, style, .wf-skill-name, [data-no-skill-names]';
let pattern;
let byName;

/** A pattern for whole-word skill names, longest first (so "Alt Magic" wins over "Magic"); null without names. Pure. */
export function namePattern(names) {
  const list = [...names].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return list.length === 0 ? null : new RegExp(`(?<![\\p{L}\\p{N}])(${list.join('|')})(?![\\p{L}\\p{N}])`, 'gu');
}

/** `text` split into plain strings and { name } parts. Pure; resets the pattern itself (test() and matchAll share lastIndex). */
export function splitNames(text, pattern) {
  if (pattern === null || pattern === undefined) return [text];
  pattern.lastIndex = 0;
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ name: m[1] });
    last = m.index + m[1].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  pattern.lastIndex = 0;
  return parts;
}

const build = () => {
  byName = new Map();
  for (const s of game.skills.allObjects) if (s?.name && s?.media) byName.set(s.name, s);
  // The mod names Magic "Alt. Magic" (Hiring.skillName); give that name the Alt. Magic icon too.
  if (game.altMagic?.media) byName.set(getLangString('PAGE_NAME_AltMagic'), { media: game.altMagic.media });
  pattern = namePattern(byName.keys());
};

const chip = (skill, name) => {
  const span = document.createElement('span');
  span.className = 'wf-skill-name';
  const img = document.createElement('img');
  img.className = 'wf-skill-name-icon';
  img.src = skill.media;
  img.alt = '';
  const b = document.createElement('b');
  b.textContent = name;
  span.append(img, b);
  return span;
};

/** Wraps every skill name under `root` (text only) in the icon-and-bold chip. Safe to call twice. */
export function skillNames(root) {
  try {
    if (!root) return;
    if (pattern === undefined) build();
    if (pattern === null) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const hits = [];
    for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
      if (n.parentElement?.closest(SKIP)) continue;
      pattern.lastIndex = 0;
      if (pattern.test(n.nodeValue)) hits.push(n);
    }
    for (const n of hits) {
      const frag = document.createDocumentFragment();
      for (const part of splitNames(n.nodeValue, pattern)) frag.append(typeof part === 'string' ? part : chip(byName.get(part.name), part.name));
      n.replaceWith(frag);
    }
  } catch (e) { console.warn('[Worker Folks] skill names failed', e); }
}

const NBSP = '\u00a0';
// Popup titles that wrap (build .109; the user, 19 Oct 2026: "I certainly don't want '…'"). No
// ellipsis and no smaller font: the title wraps, its lines balanced by the CSS (`text-wrap: balance`), and these ties
// choose where it may break. Each is pure, for the tests; fitTitle applies them and undoes any that would push the
// title past the popup's edge (a phone's line holds about 17 letters of the game's 30 px title).
/** Coordinates never split: "(2, 8)" stays whole. */
export const tieCoords = (text) => String(text).replace(/\((-?\d+), (-?\d+)\)/g, `($1,${NBSP}$2)`);
/** An article never ends a line: "The", "A" and "An" stay with the word after them ("Ada the Punctual"). */
export const tieArticles = (text) => String(text).replace(/(^|[\s\u00a0])(The|the|A|a|An|an) (?=\S)/g, `$1$2${NBSP}`);
/** The last word keeps the one before it, so a title never ends on a word alone ("Journeyman?"). */
export const tieLast = (text) => {
  const s = String(text);
  const at = s.trimEnd().lastIndexOf(' ');
  return at <= 0 || s.slice(0, at).trim() === '' ? s : `${s.slice(0, at)}${NBSP}${s.slice(at + 1)}`;
};
/** All three on a plain title. */
export const tieTitle = (text) => tieLast(tieArticles(tieCoords(text)));

/** The class a Folk's name carries in a popup title: kept on one line, with its "?" or "'s", when it fits. */
export const TITLE_NAME = 'wf-title-name';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** A Folk's name for a popup title (HTML, escaped): fitTitle keeps it whole when it fits, never cuts it with "…". */
export const titleName = (name) => `<span class="${TITLE_NAME}">${esc(name)}</span>`;

const fitTitle = (title, tries = 0) => {
  try {
    if (!title) return;
    // Measured once the popup is laid out (didRender can come before it shows).
    if (title.clientWidth === 0) { if (tries < 20) requestAnimationFrame(() => fitTitle(title, tries + 1)); return; }
    // Swal's title breaks inside a word when it must, so nothing overflows it: with that off, a tie too wide for the
    // line shows as an overflow and is undone.
    const wrap = [title.style.overflowWrap, title.style.wordBreak];
    title.style.overflowWrap = 'normal';
    title.style.wordBreak = 'normal';
    // The text's own boxes against the content edges: the title's padding hides an overflow from scrollWidth.
    const fits = () => {
      const box = title.getBoundingClientRect();
      const cs = getComputedStyle(title);
      const left = box.left + parseFloat(cs.paddingLeft) - 1;
      const right = box.right - parseFloat(cs.paddingRight) + 1;
      const range = document.createRange();
      range.selectNodeContents(title);
      return [...range.getClientRects()].every((r) => r.width === 0 || (r.left >= left && r.right <= right));
    };
    const texts = () => {
      const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
      const out = [];
      for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) out.push(n);
      return out;
    };
    /** Applies `fn` to the text nodes; undoes it when the title no longer fits. */
    const step = (nodes, fn) => {
      const before = nodes.map((n) => n.nodeValue);
      nodes.forEach((n) => { const v = fn(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; });
      if (!fits()) nodes.forEach((n, i) => { n.nodeValue = before[i]; });
    };
    step(texts(), tieCoords);
    step(texts(), tieArticles);
    title.querySelectorAll(`.${TITLE_NAME}`).forEach((el) => {
      // What follows a name goes with it ("?", "'s"): the end of a no-wrap span is a place to break. Merged into the
      // name's text, so the last-word tie below sees "Breakfast?" whole.
      const next = el.nextSibling;
      const mark = next?.nodeType === 3 ? next.nodeValue.match(/^(?:['\u2019]s|[?!.,:;])+/) : null;
      if (mark !== null) { el.append(mark[0]); el.normalize(); next.nodeValue = next.nodeValue.slice(mark[0].length); }
      el.style.whiteSpace = 'nowrap';
      if (!fits()) el.style.whiteSpace = '';
    });
    /** Ties the last two words; true when it took (or there was nothing to tie). */
    const tieEnd = () => {
      const all = texts().filter((n) => n.nodeValue.trim() !== '');
      const last = all[all.length - 1];
      if (last === undefined) return true;
      // A one-word last node ties to the space before it instead: its own (" gear" after "Ada's") or the one ending
      // the node before (a skill name's chip, "Worker for [icon] Fishing").
      const prev = all[all.length - 2];
      let node = last;
      let fn = tieLast;
      if (tieLast(last.nodeValue) === last.nodeValue) {
        if (/^ \S/.test(last.nodeValue)) fn = (v) => `${NBSP}${v.slice(1)}`;
        else if (prev !== undefined && / $/.test(prev.nodeValue)) { node = prev; fn = (v) => `${v.slice(0, -1)}${NBSP}`; } else return true;
      }
      const before = node.nodeValue;
      step([node], fn);
      return node.nodeValue !== before;
    };
    // A name kept whole that leaves the last word alone gives way ("Ysolde the Second Breakfast's" / "gear" becomes
    // "Ysolde the Second" / "Breakfast's gear"): a title never ends on one word alone.
    if (!tieEnd()) {
      const whole = [...title.querySelectorAll(`.${TITLE_NAME}`)].filter((el) => el.style.whiteSpace === 'nowrap');
      whole.forEach((el) => { el.style.whiteSpace = ''; });
      if (whole.length > 0 && !tieEnd()) whole.forEach((el) => { el.style.whiteSpace = 'nowrap'; });
    }
    [title.style.overflowWrap, title.style.wordBreak] = wrap;
  } catch (e) { console.warn('[Worker Folks] title ties failed', e); }
};

/** For every Swal we open: `didRender: popupDidRender` (passed in from setup.mjs). */
export const didRender = (popup) => {
  skillNames(popup?.querySelector('.swal2-title'));
  fitTitle(popup?.querySelector('.swal2-title'));
  skillNames(popup?.querySelector('.swal2-html-container'));
};
