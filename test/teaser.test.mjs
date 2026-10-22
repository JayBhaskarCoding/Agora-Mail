/* Inbox teasers: the line must say something *about* the message, not repeat
   the first words the body is about to repeat underneath it. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TEASER_LIMIT, generateAutoTeaser } from '../src/lib/teaser.js';

const openingWords = (body, count = 4) =>
  String(body).replace(/\s+/g, ' ').trim().split(' ').slice(0, count).join(' ').toLowerCase();

/** Would Gmail show the body's opening twice? */
const repeatsOpening = (teaser, body) =>
  teaser.toLowerCase().startsWith(openingWords(body));

test('a multi-sentence message previews its second sentence', () => {
  const body = `Hi Jay,

Here is the deck for Friday.

The review moved to Friday at ten.

Let me know.`;

  assert.equal(generateAutoTeaser(body, 'Deck for the review'), 'The review moved to Friday at ten.');
});

test('a greeting-only first sentence is not mistaken for the opening', () => {
  const body = 'Hi Jay!\n\nThe deck is ready.\n\nIt includes the new pricing.';
  assert.equal(generateAutoTeaser(body, 'Deck'), 'It includes the new pricing.');
});

test('the reported stutter is gone: one sentence no longer echoes itself', () => {
  const body = 'Do you see this content in the preview of the mail?';
  const teaser = generateAutoTeaser(body, 'Test message');

  assert.ok(!/do you see this content/i.test(teaser), teaser);
  assert.equal(teaser, 'A short note about Test message');
  assert.ok(!repeatsOpening(teaser, body));
});

test('a one-sentence reply names the thread instead of quoting it', () => {
  assert.equal(
    generateAutoTeaser('Saturday works.', 'Re: Review timing', true, 0),
    'Reply regarding Review timing',
  );
});

test('reply and attachment counts are described, not quoted', () => {
  assert.equal(
    generateAutoTeaser('Saturday works.', 'Re: Review timing', true, 2),
    'Reply regarding Review timing · 2 attachments',
  );
  assert.equal(
    generateAutoTeaser('Saturday works.', 'Review timing', false, 1),
    'Includes 1 attachment',
  );
  assert.equal(
    generateAutoTeaser('Saturday works.', 'Review timing', false, 3),
    'Includes 3 attachments',
  );
});

test('subject prefixes are stripped before they are reused', () => {
  assert.equal(
    generateAutoTeaser('Fine by me.', 'Re: Fwd: Q3 deck', true),
    'Reply regarding Q3 deck',
  );
});

test('length is described honestly', () => {
  const long = Array.from({ length: 60 }, (_, index) => `word${index}`).join(' ');
  assert.equal(generateAutoTeaser(long, 'Notes'), 'An update on Notes');
  assert.equal(generateAutoTeaser('Thanks!', 'Notes'), 'A short note about Notes');
});

test('an empty body still gets a teaser', () => {
  assert.equal(generateAutoTeaser('', 'Q3 deck'), 'A short note about Q3 deck');
  assert.equal(generateAutoTeaser('   \n\n ', 'Q3 deck', true), 'Reply regarding Q3 deck');
  assert.equal(generateAutoTeaser('', ''), 'A short note about your message');
});

test('teasers are capped at 90 characters, cut on a word boundary', () => {
  const sentence =
    'The quarterly review moved to Friday at ten, and the updated pricing deck will follow on Monday morning.';
  const teaser = generateAutoTeaser(`Hi Jay, here is the deck. ${sentence}`, 'Deck');

  assert.ok(teaser.length <= TEASER_LIMIT, `${teaser.length} chars: ${teaser}`);
  assert.ok(teaser.endsWith('…'));
  assert.ok(sentence.startsWith(teaser.slice(0, -1)), 'cut mid-word');
});

test('no teaser opens with the body it summarises', () => {
  const bodies = [
    'Do you see this content in the preview?',
    'Hi Jay, here is the deck.',
    'Hi Jay, here is the deck. The review moved to Friday.',
    'Thanks! I will send the deck tomorrow morning.',
    'Quick note: the build passed. All 28 checks are green.',
    'Dear team, the office is closed on Friday. Enjoy the long weekend.',
    'Hey there, are we still on for Saturday? I can do any time after ten.',
  ];

  for (const body of bodies) {
    for (const isReply of [false, true]) {
      const teaser = generateAutoTeaser(body, 'Re: Saturday', isReply, 0);
      assert.ok(teaser.length > 0, `empty teaser for ${body}`);
      assert.ok(teaser.length <= TEASER_LIMIT, `too long for ${body}: ${teaser}`);
      assert.ok(
        !repeatsOpening(teaser, body),
        `"${teaser}" repeats the opening of "${body}"`,
      );
    }
  }
});

test('repeated sentences do not become the teaser', () => {
  const body = 'Do you see this content in the preview? Do you see this content in the preview?';
  const teaser = generateAutoTeaser(body, 'Test');
  assert.ok(!/do you see this content/i.test(teaser), teaser);
});
