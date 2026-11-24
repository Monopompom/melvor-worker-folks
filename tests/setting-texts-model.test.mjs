import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTextBook } from '../src/setting-texts-model.mjs';

// The strings as English while the mod loads, then French once the game has the player's language.
const EN = { MOD_WF_SETTING_STRIKE: 'General strike', MOD_WF_SETTING_ALT: 'Folks may hold ${skill}', PAGE_NAME_AltMagic: 'Alt. Magic', MOD_WF_TIMES: '×${value}' };
const FR = { MOD_WF_SETTING_STRIKE: 'Grève générale', MOD_WF_SETTING_ALT: 'Les Folks peuvent faire ${skill}', PAGE_NAME_AltMagic: 'Magie alt.', MOD_WF_TIMES: '×${value}' };
const fill = (text, vars) => text.replace(/\$\{(\w+)\}/g, (_, k) => String(vars[k]));
const nowIn = (strings) => ({ lang: (key) => strings[key], template: (key, vars) => fill(strings[key], vars) });

const noted = () => {
  const book = createTextBook({ owns: (key) => key.startsWith('MOD_WF_') });
  book.read('MOD_WF_SETTING_STRIKE', undefined, EN.MOD_WF_SETTING_STRIKE);
  book.read('PAGE_NAME_AltMagic', undefined, EN.PAGE_NAME_AltMagic);
  book.read('MOD_WF_SETTING_ALT', { skill: 'Alt. Magic' }, fill(EN.MOD_WF_SETTING_ALT, { skill: 'Alt. Magic' }));
  return book;
};

test('a text read while the mod loaded is read again in the language in use', () => {
  assert.equal(noted().now('General strike', nowIn(FR)), 'Grève générale');
  assert.equal(noted().now('  General strike\n', nowIn(FR)), 'Grève générale');
});

test('a template is filled again, a value that was a game text read again too', () => {
  assert.equal(noted().now('Folks may hold Alt. Magic', nowIn(FR)), 'Les Folks peuvent faire Magie alt.');
});

test('texts of keys not owned, and texts never read, are left alone', () => {
  const book = noted();
  assert.equal(book.now('Alt. Magic', nowIn(FR)), undefined);
  assert.equal(book.now('Something else', nowIn(FR)), undefined);
  assert.equal(book.size, 2);
});

test('the first key that gave a text keeps it; empty and odd reads are skipped', () => {
  const book = createTextBook();
  book.read('MOD_WF_A', undefined, 'Same');
  book.read('MOD_WF_B', undefined, 'Same');
  book.read('MOD_WF_C', undefined, '   ');
  book.read(undefined, undefined, 'No key');
  book.read('MOD_WF_D', undefined, null);
  assert.equal(book.size, 1);
  assert.equal(book.now('Same', { lang: (key) => key, template: () => '' }), 'MOD_WF_A');
});

test('in English the text reads the same, so nothing changes', () => {
  assert.equal(noted().now('General strike', nowIn(EN)), 'General strike');
});

test('an entry found once is read again in each language after that', () => {
  const book = noted();
  const entry = book.entryOf('Folks may hold Alt. Magic');
  assert.equal(book.textOf(entry, nowIn(FR)), 'Les Folks peuvent faire Magie alt.');
  assert.equal(book.entryOf('Les Folks peuvent faire Magie alt.'), undefined);
  assert.equal(book.textOf(entry, nowIn(EN)), 'Folks may hold Alt. Magic');
});
