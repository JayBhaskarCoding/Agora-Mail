/* Moderation reports arrive from noreply@agora.in.net and name the reporter
   inside the body, because the `emails` table has no Reply-To column. These
   cover reading that address back out. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isContactForm,
  isModerationReport,
  reporterHandle,
  resolveReplyEmail,
} from '../src/lib/replyTarget.js';

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

/* ---- the reporter's id ------------------------------------------------- */

test('a report names its reporter by handle', () => {
  assert.equal(reporterHandle([report()]), '@ron');
  assert.equal(
    reporterHandle([
      report({
        html_body: '<p>Report by <strong>@max_dev</strong></p>',
        text_body: 'Report by @max_dev',
      }),
    ]),
    '@max_dev',
  );
  /* A trailing full stop is punctuation, not part of the handle. */
  assert.equal(
    reporterHandle([
      report({ html_body: '', text_body: 'Report by @ron. Registered Email: a@b.com' }),
    ]),
    '@ron',
  );
});

test('the handle is found without the usual wording, but never inside an email', () => {
  const addressed = report({
    html_body: '<p>Registered Email: someone@example.com</p>',
    text_body: 'Registered Email: someone@example.com',
  });
  assert.equal(reporterHandle([addressed]), '', 'an address is not a handle');

  const mention = report({
    html_body: '<p>Report by @ron</p><p>Thanks @agora</p>',
    text_body: '',
  });
  assert.equal(reporterHandle([mention]), '@ron');
});

test('a handle is looked for across the conversation', () => {
  const answer = {
    id: 's1',
    folder: 'sent',
    subject: 'Re: [Report: harassment]',
    from_address: 'jay@agora.in.net',
    to_address: 'noreply@agora.in.net',
    text_body: 'Thanks, we are looking into it.',
    html_body: '<p>Thanks, we are looking into it.</p>',
  };
  assert.equal(reporterHandle([answer, report()]), '@ron');
});

test('ordinary mail has no reporter handle', () => {
  assert.equal(
    reporterHandle([
      { folder: 'inbox', from_address: 'Meera <meera@example.com>', subject: 'Lunch', html_body: '<p>Hi @ron</p>' },
    ]),
    '',
  );
  assert.equal(reporterHandle([]), '');
  assert.equal(reporterHandle(), '');
});


/* ---- contact-form feedback ------------------------------------------- */

const feedback = (extra = {}) => ({
  id: 'f1',
  folder: 'inbox',
  subject: 'New Agora Feedback: Dark mode is lovely',
  from_address: 'Agora Contact Form <contact@agora.in.net>',
  to_address: 'jay@agora.in.net',
  html_body:
    '<div><p>Name: Jayvardhan</p><p>Email: jayvardhanbhaskar123@gmail.com</p>' +
    '<p>Message: Keep the quiet rooms.</p>' +
    '<a href="mailto:mail@agora.in.net">Contact Agora</a></div>',
  text_body:
    'New Agora Feedback\nName: Jayvardhan\nEmail: jayvardhanbhaskar123@gmail.com\nKeep the quiet rooms.',
  ...extra,
});

test('contact-form feedback is recognised by subject or sender', () => {
  assert.equal(isContactForm(feedback()), true);
  assert.equal(isContactForm(feedback({ subject: 'Hello' })), true, 'the sender is enough');
  assert.equal(isContactForm(feedback({ subject: 'Re: New Agora Feedback: Dark mode' })), true);
  assert.equal(
    isContactForm(feedback({ subject: 'Hello', from_address: 'Agora Contact Form <someone@agora.in.net>' })),
    true,
  );
  assert.equal(
    isContactForm({ subject: 'Notes on the New Agora Feedback: widget', from_address: 'Meera <meera@example.com>' }),
    false,
    'the phrase has to open the subject',
  );
  assert.equal(isContactForm(null), false);
});

test('feedback answers the submitter, not the contact-form robot', () => {
  assert.equal(resolveReplyEmail(feedback(), [feedback()], { selfAddresses: SELF }), 'jayvardhanbhaskar123@gmail.com');
});

test('the labeled Email: field beats a decorative mailto link', () => {
  const message = feedback({
    html_body:
      '<a href="mailto:someone@example.com">Our site</a><p>Email: jayvardhanbhaskar123@gmail.com</p>',
    text_body: '',
  });
  assert.equal(resolveReplyEmail(message, [], { selfAddresses: SELF }), 'jayvardhanbhaskar123@gmail.com');
});

test('a mailto link is enough when the template prints no Email: line', () => {
  const message = feedback({
    subject: 'Hello',
    html_body:
      '<a href="mailto:mail@agora.in.net">Contact</a>' +
      '<p>Write back to <a href="mailto:writer@example.com">writer@example.com</a></p>',
    text_body: '',
  });
  assert.equal(resolveReplyEmail(message, [], { selfAddresses: SELF }), 'writer@example.com');
});

test('contact addresses are never the answer when a person is named', () => {
  const message = feedback({
    html_body:
      '<p>Email: contact@agora.in.net</p><a href="mailto:noreply@agora.in.net">no reply</a>' +
      '<p>Email: real@example.com</p>',
    text_body: '',
  });
  assert.equal(resolveReplyEmail(message, [], { selfAddresses: SELF }), 'real@example.com');
});

test('an answered feedback thread still resolves to the submitter', () => {
  const answer = {
    id: 's1',
    folder: 'sent',
    subject: 'Re: New Agora Feedback: Dark mode is lovely',
    from_address: 'Jay <jay@agora.in.net>',
    to_address: 'jayvardhanbhaskar123@gmail.com',
    html_body: '<p>Thank you — noted.</p>',
    text_body: 'Thank you — noted.',
  };
  assert.equal(
    resolveReplyEmail(answer, [feedback(), answer], { selfAddresses: SELF }),
    'jayvardhanbhaskar123@gmail.com',
  );
});

test('a form that names nobody falls back to its sender', () => {
  const message = feedback({
    html_body: '<p>Email: contact@agora.in.net</p>',
    text_body: '',
  });
  assert.match(resolveReplyEmail(message, [], { selfAddresses: SELF }), /contact@agora\.in\.net/);
});
