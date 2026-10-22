/* Selecting conversations: the set arithmetic behind the checkboxes, and the
   message ids a bulk action actually reaches. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  messageIdsForThreads,
  pruneKeys,
  toggleAllKeys,
  toggleKey,
} from '../src/lib/selection.js';

test('toggling a key adds it, and toggling again removes it', () => {
  const empty = new Set();
  const one = toggleKey(empty, 're: q3 deck');
  assert.deepEqual([...one], ['re: q3 deck']);
  assert.equal(empty.size, 0, 'the original set is not mutated');

  const none = toggleKey(one, 're: q3 deck');
  assert.equal(none.size, 0);
  assert.deepEqual([...one], ['re: q3 deck']);
});

test('toggle all selects every conversation, then clears them', () => {
  const keys = ['a', 'b', 'c'];
  const selected = toggleAllKeys(new Set(), keys);
  assert.deepEqual([...selected].sort(), ['a', 'b', 'c']);

  /* A "select all" control that is already full clears the selection. */
  const cleared = toggleAllKeys(selected, keys);
  assert.equal(cleared.size, 0);
});

test('toggle all fills the gaps when the selection is partial', () => {
  const partial = new Set(['b']);
  const selected = toggleAllKeys(partial, ['a', 'b', 'c']);
  assert.deepEqual([...selected].sort(), ['a', 'b', 'c']);
});

test('toggle all on an empty list leaves the selection alone', () => {
  const selection = new Set(['a']);
  const same = toggleAllKeys(selection, []);
  assert.equal(same, selection);
});

test('pruning drops keys that no longer exist', () => {
  const pruned = pruneKeys(new Set(['a', 'b', 'c']), ['a', 'c']);
  assert.deepEqual([...pruned].sort(), ['a', 'c']);
});

test('pruning with nothing to drop hands back the same set', () => {
  const selection = new Set(['a', 'b']);
  assert.equal(pruneKeys(selection, ['a', 'b', 'c']), selection);
  assert.equal(pruneKeys(new Set(), ['a']).size, 0);
});

test('a selection reaches every message in its conversations', () => {
  const threads = [
    { key: 'q3', emails: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }] },
    { key: 'lunch', emails: [{ id: 'm3' }, { id: 'm4' }] },
    { key: 'empty', emails: [] },
    { key: 'odd', emails: [{}, { id: null }, { id: 'm5' }] },
  ];

  /* Both sides of a conversation move together, and nothing repeats. */
  assert.deepEqual(messageIdsForThreads(threads), ['m1', 'm2', 'm3', 'm4', 'm5']);
  assert.deepEqual(messageIdsForThreads([]), []);
  assert.deepEqual(messageIdsForThreads(undefined), []);
});
