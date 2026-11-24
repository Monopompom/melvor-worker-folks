// The Mod Settings texts in the player's language. Pure: no game globals.
//
// The game takes a setting's label, hint and choices as plain text when the setting is added, and that happens while
// the mod loads: after the reload a language change makes, that can be before the game has the new language's
// strings, so they stay English. A text book keeps, for each text read while the mod loads, the key (and the values)
// it came from; when the Mod Settings popup opens, each text still showing is read again in the language in use.

/**
 * A book of texts read while the mod loads. `owns(key)` → true for the keys whose texts are put in the language again
 * (this mod's own); any key read without values is kept too, so a value that is a game text (a page's name) follows.
 */
export function createTextBook({ owns = () => true } = {}) {
  /** text → { key, vars }: the first key that gave this text. */
  const book = new Map();
  /** text → key, for texts read without values. */
  const plain = new Map();
  return {
    /** Notes that `key` (with `vars` for a template) gave `text`. */
    read(key, vars, text) {
      if (typeof key !== 'string' || typeof text !== 'string' || text.trim() === '') return;
      const t = text.trim();
      if (vars === undefined && !plain.has(t)) plain.set(t, key);
      if (owns(key) && !book.has(t)) book.set(t, { key, vars: vars === undefined ? undefined : { ...vars } });
    },
    /** Where `text` came from ({ key, vars }), or undefined when it is not in the book. */
    entryOf(text) {
      return book.get(String(text ?? '').trim());
    },
    /**
     * `text` in the language in use, or undefined when it is not in the book. `lang(key)` and `template(key, vars)`
     * read the strings now; a value that was itself a text read without values is read again too.
     */
    now(text, strings) {
      const hit = this.entryOf(text);
      return hit === undefined ? undefined : this.textOf(hit, strings);
    },
    /** An entry's text in the language in use. */
    textOf(hit, { lang, template }) {
      if (hit.vars === undefined) return lang(hit.key);
      const vars = Object.fromEntries(Object.entries(hit.vars).map(([k, v]) => {
        const key = typeof v === 'string' ? plain.get(v.trim()) : undefined;
        return [k, key === undefined ? v : lang(key)];
      }));
      return template(hit.key, vars);
    },
    get size() { return book.size; },
  };
}
