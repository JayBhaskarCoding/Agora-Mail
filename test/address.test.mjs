/* Addresses in the list and in the reply target: the Sent pane must show a
   person, not a raw `"Rao, Meera" <meera@example.com>` string, and Reply must
   go where the message says it should. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  displayName,
  firstMailbox,
  isNoReplyAddress,
  mailboxesIn,
  parseAddress,
  recipientLabel,
  replyAddressFor,
} from '../src/lib/format.js';

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

/* ---- where a reply goes ------------------------------------------------ */

const inbox = (extra = {}) => ({
  folder: 'inbox',
  from_address: 'Meera Rao <meera@example.com>',
  to_address: 'Jay <jay@agora.in.net>',
  ...extra,
});

test('without a Reply-To, a reply goes to the sender', () => {
  assert.equal(replyAddressFor(inbox()), 'Meera Rao <meera@example.com>');
  assert.equal(replyAddressFor(inbox({ reply_to: null })), 'Meera Rao <meera@example.com>');
});

test('a Reply-To beats the sender', () => {
  assert.equal(
    replyAddressFor(inbox({ reply_to: 'support@lists.example.com' })),
    'support@lists.example.com',
  );
  assert.equal(
    replyAddressFor(inbox({ reply_to: 'Help Desk <help@shop.example>' })),
    'Help Desk <help@shop.example>',
  );
});

test('the camelCase field is read too', () => {
  assert.equal(
    replyAddressFor(inbox({ replyTo: 'help@shop.example' })),
    'help@shop.example',
  );
});

test('only the first usable mailbox of a header is taken', () => {
  assert.equal(
    replyAddressFor(inbox({ reply_to: 'first@x.dev, second@x.dev' })),
    'first@x.dev',
  );
  /* A comma inside a quoted display name is not a separator. */
  assert.equal(
    replyAddressFor(inbox({ reply_to: '"Rao, Meera" <meera@x.dev>, other@x.dev' })),
    'Rao, Meera <meera@x.dev>',
  );
  assert.equal(
    replyAddressFor(inbox({ reply_to: ['list@x.dev', 'other@x.dev'] })),
    'list@x.dev',
  );
  assert.equal(
    replyAddressFor(inbox({ reply_to: '["first@x.dev","second@x.dev"]' })),
    'first@x.dev',
  );
});

test('a header stored HTML-escaped still yields its address', () => {
  assert.equal(
    replyAddressFor(inbox({ reply_to: 'List &lt;list@x.dev&gt;' })),
    'List <list@x.dev>',
  );
});

test('an unusable Reply-To falls back to the sender', () => {
  for (const reply_to of ['', '   ', 'not-an-address', '<>', 'Support Desk', 0, false, {}]) {
    assert.equal(
      replyAddressFor(inbox({ reply_to })),
      'Meera Rao <meera@example.com>',
      `reply_to: ${JSON.stringify(reply_to)}`,
    );
  }
});

test('a message we sent replies to its recipient, not to us', () => {
  /* Outgoing mail is stored with reply_to set to the sender, so the guard
     matters more than the header here. */
  assert.equal(
    replyAddressFor(
      {
        folder: 'sent',
        from_address: 'Jay <jay@agora.in.net>',
        to_address: 'Meera <meera@example.com>',
        reply_to: 'mail@agora.in.net',
      },
      { selfAddresses: ['mail@agora.in.net', 'jay@agora.in.net'] },
    ),
    'Meera <meera@example.com>',
  );
  assert.equal(
    replyAddressFor({
      folder: 'sent',
      from_address: 'Jay <jay@agora.in.net>',
      to_address: 'Meera <meera@example.com>',
    }),
    'Meera <meera@example.com>',
  );
});

test('the sender falls back to a `from` field when there is no `from_address`', () => {
  assert.equal(
    replyAddressFor({ folder: 'inbox', from: 'Reporter <reporter@example.com>' }),
    'Reporter <reporter@example.com>',
  );
  assert.equal(
    replyAddressFor({ folder: 'inbox', from_address: '', from: 'reporter@example.com' }),
    'reporter@example.com',
  );
});

test('a moderation report replies to the reporter, not to noreply', () => {
  const report = {
    folder: 'inbox',
    from_address: 'Agora <noreply@agora.in.net>',
    to_address: 'Jay <jay@agora.in.net>',
    reply_to: 'reporter@example.com',
  };
  assert.equal(replyAddressFor(report), 'reporter@example.com');
  assert.equal(
    replyAddressFor(report, { selfAddresses: ['mail@agora.in.net', 'jay@agora.in.net'] }),
    'reporter@example.com',
  );
  assert.equal(
    replyAddressFor(
      { ...report, reply_to: '', replyTo: 'second-reporter@example.com' },
      { selfAddresses: ['mail@agora.in.net'] },
    ),
    'second-reporter@example.com',
  );
});

test('a Reply-To that points at one of our own mailboxes is skipped', () => {
  assert.equal(
    replyAddressFor(
      { folder: 'inbox', from_address: 'Meera <meera@example.com>', reply_to: 'mail@agora.in.net' },
      { selfAddresses: ['mail@agora.in.net'] },
    ),
    'Meera <meera@example.com>',
  );

  /* With nothing else to reach, the self address is still better than none. */
  assert.equal(
    replyAddressFor(
      { folder: 'inbox', from_address: 'mail@agora.in.net', reply_to: 'jay@agora.in.net' },
      { selfAddresses: ['mail@agora.in.net', 'jay@agora.in.net'] },
    ),
    'jay@agora.in.net',
  );
});

test('a missing message yields no target rather than a crash', () => {
  assert.equal(replyAddressFor(), '');
  assert.equal(replyAddressFor(null), '');
  assert.equal(replyAddressFor({}), '');
});

test('firstMailbox tidies a mailbox without inventing one', () => {
  assert.equal(firstMailbox('  "Rao, Meera" <meera@x.dev>  '), 'Rao, Meera <meera@x.dev>');
  assert.equal(firstMailbox('meera@x.dev'), 'meera@x.dev');
  assert.equal(firstMailbox('<>'), '');
  assert.equal(firstMailbox(''), '');
});

test('a no-reply sender never wins over a person in the same message', () => {
  /* A header that lists the robot first, the reporter second. */
  assert.equal(
    replyAddressFor({
      folder: 'inbox',
      from_address: 'Agora <noreply@agora.in.net>',
      reply_to: 'noreply@agora.in.net, reporter@example.com',
    }),
    'reporter@example.com',
  );

  /* A useless Reply-To leaves the real sender as the only way to answer. */
  assert.equal(
    replyAddressFor({
      folder: 'inbox',
      from_address: 'Reporter <reporter@example.com>',
      reply_to: 'no-reply@agora.in.net',
    }),
    'Reporter <reporter@example.com>',
  );
});

test('a no-reply address is still used when it is all there is', () => {
  assert.equal(
    replyAddressFor({ folder: 'inbox', from_address: 'Agora <noreply@agora.in.net>' }),
    'Agora <noreply@agora.in.net>',
  );
});

test('no-reply detection covers the usual spellings', () => {
  for (const value of [
    'noreply@agora.in.net',
    'no-reply@agora.in.net',
    'donotreply@x.dev',
    'do-not-reply@x.dev',
    'mailer-daemon@x.dev',
    'postmaster@x.dev',
    'bounces@x.dev',
    'notifications@x.dev',
    'Noreply <NOREPLY@Agora.in.net>',
  ]) {
    assert.equal(isNoReplyAddress(value), true, value);
  }

  for (const value of ['reporter@example.com', 'riya.sen@example.com', 'replies@x.dev', 'hello@x.dev', '']) {
    assert.equal(isNoReplyAddress(value), false, value);
  }
});

test('every mailbox in a header is offered, once, in order', () => {
  assert.deepEqual(mailboxesIn('a@x.dev, "Rao, Meera" <b@x.dev>, a@x.dev'), [
    'a@x.dev',
    'Rao, Meera <b@x.dev>',
  ]);
  assert.deepEqual(mailboxesIn(['a@x.dev', 'b@x.dev']), ['a@x.dev', 'b@x.dev']);
  assert.deepEqual(mailboxesIn('<>'), []);
});
