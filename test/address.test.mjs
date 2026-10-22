/* Addresses in the list: the Sent pane must show a person, not a raw
   `"Rao, Meera" <meera@example.com>` string. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { displayName, parseAddress, recipientLabel } from '../src/lib/format.js';

test('a formatted recipient keeps the name and demotes the address', () => {
  assert.deepEqual(recipientLabel('Meera Rao <meera@example.com>'), {
    primary: 'Meera Rao',
    secondary: 'meera@example.com',
  });
});

test('quoted names survive parsing without their quotes', () => {
  assert.deepEqual(recipientLabel('"Rao, Meera" <meera@x.dev>'), {
    primary: 'Rao, Meera',
    secondary: 'meera@x.dev',
  });
});

test('a bare address becomes the handle before the @', () => {
  assert.deepEqual(recipientLabel('jayvardhanbhaskar123@agora.in.net'), {
    primary: 'jayvardhanbhaskar123',
    secondary: 'jayvardhanbhaskar123@agora.in.net',
  });
  assert.deepEqual(recipientLabel('meera@example.com'), {
    primary: 'meera',
    secondary: 'meera@example.com',
  });
});

test('malformed and empty recipients still read as a person', () => {
  assert.equal(recipientLabel('').primary, 'Unknown recipient');
  assert.equal(recipientLabel('   ').primary, 'Unknown recipient');
  assert.equal(recipientLabel('just-a-handle').primary, 'just-a-handle');
  assert.equal(recipientLabel('just-a-handle').secondary, '');
});

test('a name that is just the address is not printed twice', () => {
  const label = recipientLabel('meera@example.com');
  assert.notEqual(label.primary, label.secondary);
  assert.equal(label.secondary, 'meera@example.com');
});

test('address parsing stays the same underneath', () => {
  assert.deepEqual(parseAddress('Meera Rao <meera@example.com>'), {
    name: 'Meera Rao',
    address: 'meera@example.com',
    display: 'Meera Rao',
  });
  assert.equal(displayName('meera@example.com'), 'meera@example.com');
});
