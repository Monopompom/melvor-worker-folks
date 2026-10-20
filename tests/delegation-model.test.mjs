import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideStart, rebuildDelegated, workerOptions, moveMode, releaseMode } from '../src/delegation-model.mjs';

test('decideStart: Folk-held skills delegate while a Shift Slot is free', () => {
  assert.equal(decideStart({ hasFolk: false, isDelegated: false, delegatedCount: 0, shiftSlots: 1 }), 'main');
  assert.equal(decideStart({ hasFolk: true, isDelegated: false, delegatedCount: 0, shiftSlots: 1 }), 'delegate');
  assert.equal(decideStart({ hasFolk: true, isDelegated: false, delegatedCount: 1, shiftSlots: 1 }), 'refuse');
  assert.equal(decideStart({ hasFolk: true, isDelegated: true, delegatedCount: 1, shiftSlots: 1 }), 'delegate');
  assert.equal(decideStart({ hasFolk: true, folkAvailable: false, isDelegated: false, delegatedCount: 0, shiftSlots: 1 }), 'unavailable');
});

test('rebuildDelegated separates resumable skills from zombies and skips the main action', () => {
  const wc = { id: 'wc', isActive: true };
  const fi = { id: 'fi', isActive: true };
  const mi = { id: 'mi', isActive: false };
  const main = { id: 'main', isActive: true };
  const r = rebuildDelegated({ skills: [wc, fi, mi, main], mainAction: main, hasFolk: (s) => s === wc });
  assert.deepEqual(r.delegated, [wc]);
  assert.deepEqual(r.zombies, [fi]);
});

test('workerOptions marks the current holder, Folks busy elsewhere and unavailable ones', () => {
  const folks = [
    { id: 'a', name: 'Ann', tier: 'Newbie', skillId: 'wc', available: true },
    { id: 'b', name: 'Bob', tier: 'Junior', skillId: 'fi', available: true },
    { id: 'c', name: 'Cid', tier: 'Newbie', skillId: null, available: false },
  ];
  const o = workerOptions({ folks, skillId: 'wc', skillNameOf: (id) => id.toUpperCase() });
  assert.deepEqual(o.map((x) => [x.current, x.elsewhere, x.available]), [[true, null, true], [false, 'FI', true], [false, null, false]]);
  assert.deepEqual(o.map((x) => x.lines), [[], [], []]);
});

test('moveMode defers the move only while the Folk is working elsewhere', () => {
  assert.equal(moveMode({ currentSkillId: 'wc', targetSkillId: 'wc', working: true }), 'none');
  assert.equal(moveMode({ currentSkillId: 'wc', targetSkillId: 'fi', working: true }), 'deferred');
  assert.equal(moveMode({ currentSkillId: 'wc', targetSkillId: 'fi', working: false }), 'now');
  assert.equal(moveMode({ currentSkillId: null, targetSkillId: 'fi', working: false }), 'now');
});

test('releaseMode: switching back to You waits for the next start only while the Folk works', () => {
  assert.equal(releaseMode({ working: true }), 'deferred');
  assert.equal(releaseMode({ working: false }), 'now');
});
