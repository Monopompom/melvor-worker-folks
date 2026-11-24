// The Mod Settings texts in the player's language (the book is in setting-texts-model.mjs). Game-facing.
//
// install() runs before any setting is added: until the character loads, every string the game's getLangString and
// templateLangString give is noted with its key. retext(root) then puts each of this mod's texts under `root` that still
// reads as first given into the language in use. The game's own functions come back once the character is loaded.

export function install(ctx, { model, log }) {
  const book = model.createTextBook({ owns: (key) => key.startsWith('MOD_WF_') });
  const g = globalThis;
  const lang0 = g.getLangString;
  const template0 = g.templateLangString;
  let reading = typeof lang0 === 'function' && typeof template0 === 'function';
  if (reading) {
    try {
      const lang = function (key, ...rest) {
        const text = lang0.call(this, key, ...rest);
        if (reading) { try { book.read(key, undefined, text); } catch {} }
        return text;
      };
      const template = function (key, vars, ...rest) {
        const text = template0.call(this, key, vars, ...rest);
        if (reading) { try { book.read(key, vars ?? {}, text); } catch {} }
        return text;
      };
      g.getLangString = lang;
      g.templateLangString = template;
      ctx.onCharacterLoaded(() => {
        reading = false;
        if (g.getLangString === lang) g.getLangString = lang0;
        if (g.templateLangString === template) g.templateLangString = template0;
        log(`setting texts: ${book.size} noted`);
      });
    } catch (e) { reading = false; log('setting texts: not noted', e); }
  }
  const now = { lang: (key) => getLangString(key), template: (key, vars) => templateLangString(key, vars) };
  // The game builds the popup once and shows the same one again: a text put in one language is found by its node the
  // next time, after the player changes language once more.
  const nodeEntry = new WeakMap();
  return {
    /** Each text node under `root` that is one of this mod's texts as first given, in the language in use. */
    retext(root) {
      if (!(root instanceof Node)) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
        const text = n.nodeValue.trim();
        if (text === '') continue;
        const known = nodeEntry.get(n);
        const entry = known !== undefined && known.shown === text ? known.entry : book.entryOf(text);
        if (entry === undefined) continue;
        const fresh = book.textOf(entry, now);
        if (fresh !== text) n.nodeValue = n.nodeValue.replace(text, fresh);
        nodeEntry.set(n, { entry, shown: fresh });
      }
    },
  };
}
