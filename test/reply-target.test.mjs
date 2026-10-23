/* Moderation reports arrive from noreply@agora.in.net and name the reporter
   inside the body, because the `emails` table has no Reply-To column. These
   cover reading that address back out. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isModerationReport, resolveReplyEmail } from '../src/lib/replyTarget.js';

const SELF = ['mail@agora.in.net', 'jay@agora.in.net'];

const report = (extra = {}) => ({
  id: 'r1',
  folder: 'inbox',
  subject: '[Report: harassment]',
  from_address: 'Report by @ron <noreply@agora.in.net>',
  to_address: 'jay@agora.in.net',
  text_body: 'Report by @ron\nRegistered Email: jayvardhanbhaskar123@gmail.com',
  html_body:
    '<div><p>Report by @ron</p><p>Registered Email: jayvardhanbhaskar123@gmail.com</p>' +
    '<a href="mailto:mail@agora.in.net">Contact Agora</a></div>',
  ...extra,
});

test('a report is recognised by its sender or its subject', () => {
  assert.equal(isModerationReport(report()), true);
  assert.equal(isModerationReport({ from_address: 'Agora <noreply@agora.in.net>' }), true);
  assert.equal(isModerationReport({ subject: '[Report: spam]', from_address: 'a@b.dev' }), true);
  assert.equal(isModerationReport({ subject: '  [report: spam]' }), true);
  assert.equal(isModerationReport({ subject: 'Re: [Report: spam]' }), false);
  assert.equal(
    isModerationReport({ subject: 'Lunch', from_address: 'Meera <meera@example.com>' }),
    false,
  );
  assert.equal(isModerationReport(null), false);
});

test('a mailto link in the report wins over the no-reply sender', () => {
  const message = report({
    html_body: '<p>Report by @ron</p><a href="mailto:reporter@example.com">Email the reporter</a>',
    text_body: '',
  });
  assert.equal(resolveReplyEmail(message, [message], { selfAddresses: SELF }), 'reporter@example.com');
});

test('the Registered Email line is used when there is no mailto link', () => {
  assert.equal(
    resolveReplyEmail(report(), [report()], { selfAddresses: SELF }),
    'jayvardhanbhaskar123@gmail.com',
  );
  assert.equal(
    resolveReplyEmail(
      report({ html_body: '', text_body: 'Registered Email: reporter@example.com' }),
      [],
      { selfAddresses: SELF },
    ),
    'reporter@example.com',
  );
});

test('Agora own mailboxes are never the answer', () => {
  const onlySystem = report({
    html_body: '<a href="mailto:mail@agora.in.net">Agora</a><a href="mailto:noreply@agora.in.net">x</a>',
    text_body: '',
  });
  /* Nothing else is named, so the ordinary fallback takes over. */
  assert.equal(
    resolveReplyEmail(onlySystem, [onlySystem]),
    'Report by @ron <noreply@agora.in.net>',
  );
  assert.equal(
    resolveReplyEmail(onlySystem, [onlySystem], { selfAddresses: SELF }),
    'Report by @ron <noreply@agora.in.net>',
  );
});

test('the moderator’s own mailbox is skipped when the reporter is also named', () => {
  const message = report({
    html_body:
      '<a href="mailto:jay@agora.in.net">This was sent to you</a>' +
      '<p>Registered Email: reporter@example.com</p>',
  });
  assert.equal(resolveReplyEmail(message, [message], { selfAddresses: SELF }), 'reporter@example.com');
});

test('an earlier report still resolves after we have answered it', () => {
  const answer = {
    id: 's1',
    folder: 'sent',
    subject: 'Re: [Report: harassment]',
    from_address: 'jay@agora.in.net',
    to_address: 'noreply@agora.in.net',
    html_body: '<p>Thanks, we are looking into it.</p>',
    text_body: 'Thanks, we are looking into it.',
  };
  assert.equal(
    resolveReplyEmail(answer, [report(), answer], { selfAddresses: SELF }),
    'jayvardhanbhaskar123@gmail.com',
  );
});

test('an ordinary message still answers to its sender', () => {
  const message = {
    id: 'm1',
    folder: 'inbox',
    subject: 'Lunch',
    from_address: 'Meera Rao <meera@example.com>',
    to_address: 'jay@agora.in.net',
  };
  assert.equal(resolveReplyEmail(message, [message], { selfAddresses: SELF }), 'Meera Rao <meera@example.com>');
  assert.equal(
    resolveReplyEmail({ ...message, reply_to: 'assistant@example.com' }, [], { selfAddresses: SELF }),
    'assistant@example.com',
  );
});

test('a report that names nobody falls back to the sender', () => {
  const empty = report({ html_body: '<p>Report by @ron</p>', text_body: 'Report by @ron' });
  assert.equal(
    resolveReplyEmail(empty, [empty], { selfAddresses: SELF }),
    'Report by @ron <noreply@agora.in.net>',
  );
});

test('HTML-escaped bodies are read the same way', () => {
  const escaped = report({
    html_body: '<p>Registered Email: reporter@example.com</p><a href="mailto:reporter2@example.com">x</a>',
    text_body: '',
  });
  assert.equal(resolveReplyEmail(escaped, [], { selfAddresses: SELF }), 'reporter2@example.com');

  const entity = report({
    html_body: '<a href="mailto:&#114;eporter3@example.com">mail</a>',
    text_body: '',
  });
  assert.equal(resolveReplyEmail(entity, [], { selfAddresses: SELF }), 'reporter3@example.com');
});

test('a missing message resolves to nothing rather than throwing', () => {
  assert.equal(resolveReplyEmail(null, []), '');
  assert.equal(resolveReplyEmail(undefined), '');
});
