import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findConflict, INCOMPATIBLE_MODS } from '../src/conflicts.mjs';

test('Multitasking is detected by display name in any spelling, or by namespace', () => {
  assert.equal(findConflict([]), null);
  assert.equal(findConflict(['Unknown', 'Some Other Mod', 'Worker Folks: Hiring']), null);
  assert.equal(findConflict(['Multitasking'])?.key, 'multitasking');
  assert.equal(findConflict(['Multi-Tasking'])?.key, 'multitasking');
  assert.equal(findConflict(['  MULTITASKING (fixed) '])?.key, 'multitasking');
  assert.equal(findConflict(['Unknown'], { hasNamespace: (ns) => ns === 'multitasking' })?.key, 'multitasking');
  assert.equal(findConflict(['Multiplayer Chat']), null);
  assert.equal(findConflict(undefined), null);
  assert.ok(INCOMPATIBLE_MODS.every((m) => typeof m.title === 'string' && m.names.length > 0));
});
