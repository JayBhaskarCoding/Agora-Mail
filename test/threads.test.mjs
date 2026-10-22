/* Conversations: grouping, the badge count, and showing only the new message
   in each card. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NO_SUBJECT,
  extractMessageHtml,
  groupIntoThreads,
  isOutgoingMessage,
  messagePreview,
  normaliseSubject,
  replySubject,
  stripQuotedHtml,
  stripQuotedText,
  threadParticipants,
  threadRecipient,
} from '../src/lib/threads.js';

const message = (id, subject, created, extra = {}) => ({
  id,
  subject,
  created_at: created,
  from_address: 'Meera Rao <meera@example.com>',
  to_address: 'Jay <jay@agora.in.net>',
  folder: 'inbox',
  is_read: true,
  text_body: '',
  html_body: '',
  ...extra,
});

/* ---- subjects ---------------------------------------------------------- */

test('reply and forward prefixes come off, in any case and depth', () => {
  assert.equal(normaliseSubject('Re: Q3 deck'), 'Q3 deck');
  assert.equal(normaliseSubject('re: RE: Q3 deck'), 'Q3 deck');
  assert.equal(normaliseSubject('Fwd: Re: Q3 deck'), 'Q3 deck');
  assert.equal(normaliseSubject('FW:Q3 deck'), 'Q3 deck');
  assert.equal(normaliseSubject('Re :  Q3   deck '), 'Q3 deck');
  assert.equal(normaliseSubject('   '), NO_SUBJECT);
  assert.equal(normaliseSubject('Q3 &amp; Q4'), 'Q3 & Q4');
});

test('a reply never stacks prefixes', () => {
  assert.equal(replySubject('Re: Fwd: Q3 deck'), 'Re: Q3 deck');
  assert.equal(replySubject('Q3 deck'), 'Re: Q3 deck');
  assert.equal(replySubject(''), 'Re:');
});

/* ---- grouping ---------------------------------------------------------- */

test('messages with the same normalised subject form one conversation', () => {
  const threads = groupIntoThreads([
    message('1', 'Q3 deck', '2026-10-20T09:00:00Z'),
    message('2', 'Re: Q3 deck', '2026-10-20T10:00:00Z'),
    message('3', 'Fwd: Re: Q3 deck', '2026-10-20T11:00:00Z'),
  ]);

  assert.equal(threads.length, 1);
  assert.equal(threads[0].count, 3);
  assert.equal(threads[0].subject, 'Q3 deck');
  assert.deepEqual(
    threads[0].emails.map((email) => email.id),
    ['1', '2', '3'],
    'messages are chronological',
  );
  assert.equal(threads[0].latest.id, '3');
});

test('messages are sorted oldest first even when they arrive unordered', () => {
  const threads = groupIntoThreads([
    message('b', 'Plan', '2026-10-20T12:00:00Z'),
    message('a', 'Re: Plan', '2026-10-20T08:00:00Z'),
    message('c', 'Re: Plan', '2026-10-20T10:00:00Z'),
  ]);

  assert.deepEqual(threads[0].emails.map((email) => email.id), ['a', 'c', 'b']);
});

test('conversations are ordered by their newest message', () => {
  const threads = groupIntoThreads([
    message('1', 'Older', '2026-10-01T09:00:00Z'),
    message('2', 'Newer', '2026-10-21T09:00:00Z'),
    message('3', 'Re: Older', '2026-10-22T09:00:00Z'),
  ]);

  assert.deepEqual(threads.map((thread) => thread.subject), ['Older', 'Newer']);
});

test('the badge count is the number of messages in the thread', () => {
  const threads = groupIntoThreads([
    message('1', 'Q3 deck', '2026-10-20T09:00:00Z'),
    message('2', 'Re: Q3 deck', '2026-10-20T10:00:00Z'),
    message('3', 'Re: Q3 deck', '2026-10-20T11:00:00Z'),
    message('4', 'Re: Q3 deck', '2026-10-20T12:00:00Z'),
    message('5', 'Re: Q3 deck', '2026-10-20T13:00:00Z'),
  ]);

  assert.equal(threads[0].count, 5);
  assert.equal(groupIntoThreads([message('6', 'Standalone', '2026-10-20T09:00:00Z')])[0].count, 1);
});

test('unread messages are counted across the whole conversation', () => {
  const threads = groupIntoThreads([
    message('1', 'Plan', '2026-10-20T09:00:00Z', { is_read: false }),
    message('2', 'Re: Plan', '2026-10-20T10:00:00Z', { is_read: true }),
    message('3', 'Re: Plan', '2026-10-20T11:00:00Z', { is_read: false }),
  ]);

  assert.equal(threads[0].unread, 2);
});

test('participants are listed once, in the order they joined', () => {
  const threads = groupIntoThreads([
    message('1', 'Plan', '2026-10-20T09:00:00Z', { from_address: 'Meera Rao <meera@example.com>' }),
    message('2', 'Re: Plan', '2026-10-20T10:00:00Z', { from_address: 'Jay <jay@agora.in.net>' }),
    message('3', 'Re: Plan', '2026-10-20T11:00:00Z', { from_address: 'Meera Rao <meera@example.com>' }),
  ]);

  assert.deepEqual(threads[0].participants, ['Meera Rao', 'Jay']);
});

test('messages with no subject do not become one giant conversation', () => {
  const threads = groupIntoThreads([
    message('1', '', '2026-10-20T09:00:00Z'),
    message('2', '   ', '2026-10-20T10:00:00Z'),
    message('3', 'Re:', '2026-10-20T11:00:00Z'),
  ]);

  assert.equal(threads.length, 3);
  assert.ok(threads.every((thread) => thread.count === 1));
});

test('empty input is handled', () => {
  assert.deepEqual(groupIntoThreads([]), []);
  assert.deepEqual(groupIntoThreads(undefined), []);
  assert.deepEqual(groupIntoThreads([null, undefined]), []);
});

/* ---- both sides of the dialogue --------------------------------------- */

const sentPiece = (id, subject, created, to, extra = {}) =>
  message(id, subject, created, {
    folder: 'sent',
    from_address: 'mail@agora.in.net',
    to_address: to,
    ...extra,
  });

test('sent and received messages of one subject form one conversation', () => {
  const threads = groupIntoThreads([
    message('1', 'Q3 deck', '2026-10-20T09:00:00Z'),
    sentPiece('2', 'Re: Q3 deck', '2026-10-20T10:00:00Z', 'Meera <meera@example.com>'),
    message('3', 'Re: Q3 deck', '2026-10-20T11:00:00Z'),
  ]);

  assert.equal(threads.length, 1);
  assert.deepEqual(
    threads[0].emails.map((email) => email.id),
    ['1', '2', '3'],
  );
  assert.deepEqual(threads[0].emails.map((email) => email.folder), ['inbox', 'sent', 'inbox']);
  assert.equal(threads[0].count, 3);
});

test('a conversation lists in each folder it touches, with one count', () => {
  const [thread] = groupIntoThreads([
    message('1', 'Plan', '2026-10-20T09:00:00Z'),
    sentPiece('2', 'Re: Plan', '2026-10-20T10:00:00Z', 'Meera <meera@example.com>'),
    sentPiece('3', 'Re: Plan', '2026-10-20T11:00:00Z', 'Meera <meera@example.com>'),
  ]);

  assert.deepEqual(thread.folders, { inbox: 1, sent: 2 });
  assert.equal(thread.count, 3, 'the badge counts both sides');
});

test('only incoming mail counts as unread', () => {
  const [thread] = groupIntoThreads([
    message('1', 'Plan', '2026-10-20T09:00:00Z', { is_read: false }),
    sentPiece('2', 'Re: Plan', '2026-10-20T10:00:00Z', 'Meera <meera@example.com>', {
      is_read: false,
    }),
  ]);

  assert.equal(thread.unread, 1);
});

test('our own messages are recognised however they come back', () => {
  const self = ['jay@agora.in.net'];
  assert.equal(
    isOutgoingMessage({ folder: 'sent', from_address: 'Jay <jay@agora.in.net>' }, self),
    true,
  );
  assert.equal(
    isOutgoingMessage({ folder: 'inbox', from_address: 'mail@agora.in.net' }, self),
    true,
    'the sender worker’s copy is ours',
  );
  assert.equal(
    isOutgoingMessage({ folder: 'inbox', from_address: 'Jay <jay@agora.in.net>' }, self),
    true,
    'our own mailbox is ours',
  );
  assert.equal(
    isOutgoingMessage({ folder: 'inbox', from_address: 'Meera <meera@example.com>' }, self),
    false,
  );
});

test('the people named are the other side, never us', () => {
  const self = ['jay@agora.in.net'];
  const [thread] = groupIntoThreads([
    message('1', 'Plan', '2026-10-20T09:00:00Z', {
      from_address: 'Meera Rao <meera@example.com>',
    }),
    sentPiece('2', 'Re: Plan', '2026-10-20T10:00:00Z', 'Jay <jay@agora.in.net>', {
      from_address: 'Jay <jay@agora.in.net>',
    }),
    sentPiece('3', 'Re: Plan', '2026-10-20T11:00:00Z', 'Meera <meera@example.com>', {
      from_address: 'Jay <jay@agora.in.net>',
    }),
  ]);

  /* The recipient of our reply and the sender of theirs are the same
     address, so they resolve to one person with the fuller name. */
  assert.deepEqual(threadParticipants(thread, self), ['Meera Rao']);
});

test('the same person is named once, preferably with their full name', () => {
  const self = ['jay@agora.in.net'];
  const [thread] = groupIntoThreads([
    message('1', 'Plan', '2026-10-20T09:00:00Z', {
      from_address: 'Meera Rao <meera@example.com>',
    }),
    message('2', 'Re: Plan', '2026-10-20T10:00:00Z', {
      from_address: 'Meera <meera@example.com>',
    }),
    message('3', 'Re: Plan', '2026-10-20T11:00:00Z', {
      from_address: '<meera@example.com>',
    }),
  ]);

  assert.deepEqual(threadParticipants(thread, self), ['Meera Rao']);
});

test('a Sent row names the person the last message went to', () => {
  const [thread] = groupIntoThreads([
    sentPiece('1', 'Plan', '2026-10-20T09:00:00Z', 'Arjun <arjun@example.com>'),
    sentPiece('2', 'Re: Plan', '2026-10-20T10:00:00Z', 'Meera Rao <meera@example.com>'),
  ]);

  const recipient = threadRecipient(thread);
  assert.equal(recipient.raw, 'Meera Rao <meera@example.com>');
  assert.equal(recipient.name, 'Meera Rao');
  assert.equal(recipient.address, 'meera@example.com');
});

/* ---- only the new message --------------------------------------------- */

test('a marked reply quote is removed with everything beneath it', () => {
  const html =
    '<p>Saturday works.</p><div data-reply-quote="true" style="border-left:1px solid #a855f7"><p>Can we move it?</p></div>';

  const stripped = stripQuotedHtml(html);
  assert.match(stripped, /Saturday works/);
  assert.doesNotMatch(stripped, /Can we move it\?/);
  assert.doesNotMatch(stripped, /data-reply-quote/);
});

test('nested blockquotes are removed without leaving shells', () => {
  const html =
    '<p>New answer.</p><blockquote>old <blockquote>older</blockquote> after</blockquote>';

  const stripped = stripQuotedHtml(html);
  assert.match(stripped, /New answer/);
  assert.doesNotMatch(stripped, /old|older|after|blockquote/i);
});

test('a pasted "Original Message" rule cuts the body there', () => {
  const html = '<p>Here is my answer.</p><div>--- Original Message ---</div><p>Earlier mail</p>';
  const stripped = stripQuotedHtml(html);

  assert.match(stripped, /Here is my answer/);
  assert.doesNotMatch(stripped, /Earlier mail/);
});

test('the sender worker’s envelope is not part of the message', () => {
  const html = `<!doctype html><html><body>
    <div style="display:none;max-height:0">A short note about Q3</div>
    <div style="max-width:600px"><div style="margin-bottom:28px">agora.</div>
    <!-- Main Message Body -->
    <div style="font-size:15px"><div style="color:#f4f4f5"><p>Hi Jay,</p><p>The deck is ready.</p></div></div>
    <!-- Footer -->
    <div>Sent securely via Agora Mail &bull; &copy; 2026 Agora.in.net</div>
    </div></body></html>`;

  const content = extractMessageHtml(html);
  assert.match(content, /The deck is ready/);
  assert.doesNotMatch(content, /agora\.|Sent securely|short note/);

  const preview = messagePreview({ html_body: html, subject: 'Deck' });
  assert.doesNotMatch(preview, /Sent securely|A short note/);
  assert.match(preview, /Hi Jay, The deck is ready|The deck is ready/);
});

test('an unmarked message passes through intact', () => {
  const html = '<p>Hello from a normal sender.</p>';
  assert.equal(extractMessageHtml(html), html);
});

test('plain-text replies are cut at the attribution line', () => {
  const text = 'Saturday works.\n\nOn Sat, 18 Oct 2025 at 10:04, Meera wrote:\n\n> Can we move it?';

  assert.equal(stripQuotedText(text), 'Saturday works.');
});

test('plain-text pasted headers and rules are cut too', () => {
  assert.equal(
    stripQuotedText('Answer here.\n\n--- Original Message ---\nFrom: Meera\nSent: Saturday'),
    'Answer here.',
  );
  assert.equal(
    stripQuotedText('Answer here.\n\nFrom: Meera\nSent: Saturday\nTo: Jay'),
    'Answer here.',
  );
  assert.equal(stripQuotedText('Answer here.\n\n> quoted line\n> another'), 'Answer here.');
});

test('a body that is only a quote becomes empty, never a fragment', () => {
  assert.equal(stripQuotedText('On Sat, Meera wrote:\n\n> hi'), '');
  assert.equal(stripQuotedHtml('<blockquote>hi</blockquote>').trim(), '');
});

test('previews come from the new message, not the quoted thread', () => {
  const preview = messagePreview(
    {
      subject: 'Re: Q3 deck',
      text_body: 'The deck is ready.\n\nOn Sat, Meera wrote:\n\n> Can you send it?',
      html_body: '',
    },
    65,
  );

  assert.equal(preview, 'The deck is ready.');
});

test('previews never leak markup or entities', () => {
  const preview = messagePreview(
    {
      subject: 'Q3',
      text_body: '',
      html_body: '<p>Fish &amp; chips&nbsp;tonight</p><div data-reply-quote="true">old</div>',
    },
    65,
  );

  assert.equal(preview, 'Fish & chips tonight');
});
