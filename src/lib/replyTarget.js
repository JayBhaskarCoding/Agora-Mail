/* ============================================================
   Where a reply goes.

   Most messages answer to their sender. Moderation reports do not: Agora
   sends them from `noreply@agora.in.net`, so the mailbox that should receive
   an answer only exists inside the message body — as a mailto link, or on the
   `Registered Email:` line. That address is the reporter's, and it is what the
   Reply button has to target.

   The `emails` table has no Reply-To column, so this reads the stored body
   rather than a header.
   ============================================================ */

import {
  decodeEntities,
  extractEmailAddress,
  isNoReplyAddress,
  replyAddressFor,
} from './format.js';

/* The spec's patterns, kept as sources so every scan starts from zero. */
const MAILTO_SOURCE = 'mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})';
const REGISTERED_SOURCE =
  'Registered Email:[\\s\\S]{0,200}?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})';

/* Agora's own mailboxes. Neither can take a reply: one is the sender of the
   reports, the other is the service address. */
const SYSTEM_ADDRESSES = new Set(['mail@agora.in.net', 'noreply@agora.in.net']);

const REPORT_SUBJECT = /^\s*\[report:/i;

/* The handle a report names for the reporter — `Report by @ron`. */
const REPORTED_BY =
  /\b(?:report(?:ed)?\s+by|reporter(?:\s+handle)?)\s*:?\s*@([A-Za-z0-9_][A-Za-z0-9._-]{0,29})/i;

/* Any standalone `@handle`, but never the `@` inside an email address:
   `jay@example.com` has a word character before it and a domain after it. */
const ANY_HANDLE = /(?:^|[^\w.%+-])@([A-Za-z0-9_][A-Za-z0-9._-]{1,29})(?![\w@]|\.[A-Za-z]{2,})/;

/** A body as plain text: tags become spaces, entities resolve. */
function textOf(body) {
  return decodeEntities(String(body).replace(/<[^>]+>/g, ' '));
}

const tidyHandle = (value = '') => `@${String(value).replace(/[._-]+$/, '')}`;

/** A message that came from the moderation pipeline rather than a person. */
export function isModerationReport(message) {
  if (!message) return false;

  const sender = extractEmailAddress(message.from_address || message.from || '').toLowerCase();
  if (sender && (SYSTEM_ADDRESSES.has(sender) || isNoReplyAddress(sender))) return true;

  return REPORT_SUBJECT.test(String(message.subject || ''));
}

/** The bodies worth searching, HTML first — it holds the anchors. */
function bodiesOf(message) {
  return [message?.html_body, message?.text_body]
    .filter(Boolean)
    .map((body) => decodeEntities(String(body)));
}

function addressesFrom(text, source) {
  const found = [];
  for (const match of String(text || '').matchAll(new RegExp(source, 'gi'))) {
    if (match[1]) found.push(match[1]);
  }
  return found;
}

/**
 * The reporter's address, read out of the report itself.
 *
 * Every `mailto:` link in the thread is considered first, in message order
 * (the message being replied to leads), then every `Registered Email:` line.
 * Links are the more reliable source — they are what the template makes
 * clickable — but the label is there in case the body was rewritten.
 *
 * Returns '' when the report names nobody we could write to.
 */
function reporterFromThread(messages, { selfAddresses = [] } = {}) {
  const self = new Set(
    (Array.isArray(selfAddresses) ? selfAddresses : [selfAddresses])
      .filter(Boolean)
      .map((value) => extractEmailAddress(value).toLowerCase())
      .filter(Boolean),
  );

  const candidates = [];
  const remember = (address) => {
    const trimmed = String(address || '').trim();
    if (trimmed) candidates.push(trimmed);
  };

  for (const message of messages) {
    for (const body of bodiesOf(message)) {
      addressesFrom(body, MAILTO_SOURCE).forEach(remember);
    }
  }

  for (const message of messages) {
    for (const body of bodiesOf(message)) {
      const found = addressesFrom(body, REGISTERED_SOURCE);
      found.forEach(remember);
    }
  }

  const usable = [];
  for (const address of candidates) {
    const lower = address.toLowerCase();
    if (SYSTEM_ADDRESSES.has(lower) || isNoReplyAddress(lower)) continue;
    if (!usable.includes(lower)) usable.push(lower);
  }

  /* The moderator's own mailbox is not the reporter; prefer anyone else. */
  return usable.find((address) => !self.has(address)) || usable[0] || '';
}

/**
 * The reporter's account handle, as the report itself prints it.
 *
 * `Report by @ron` is the one line in a moderation report that names a
 * person, so it is what the reply box shows instead of an address. Returns ''
 * for anything that is not a report, or a report that names no handle — the
 * caller then falls back to the usual name.
 *
 * @param {object|Array} messages a message, or a conversation to search
 */
export function reporterHandle(messages = []) {
  const list = (Array.isArray(messages) ? messages : [messages]).filter(Boolean);
  if (!list.some(isModerationReport)) return '';

  const bodies = list.flatMap(bodiesOf).map(textOf);

  for (const body of bodies) {
    const named = body.match(REPORTED_BY);
    if (named) return tidyHandle(named[1]);
  }

  /* A template that words it differently still names the handle somewhere. */
  for (const body of bodies) {
    const loose = body.match(ANY_HANDLE);
    if (loose) return tidyHandle(loose[1]);
  }

  return '';
}

/**
 * The address a reply to this message should be sent to.
 *
 * @param {object} emailObj        the message whose Reply button was pressed
 * @param {Array}  threadMessages  its conversation, for reports sent earlier
 * @returns {string} a mailbox — a reporter's bare address, or the mailbox the
 *   message itself names — and '' when the message has nothing to reply to.
 */
export function resolveReplyEmail(emailObj, threadMessages = [], { selfAddresses = [] } = {}) {
  const target = emailObj || {};
  const thread = Array.isArray(threadMessages) ? threadMessages.filter(Boolean) : [];

  /* The message being replied to leads; the rest of the conversation follows
     so a report still resolves after we have answered it once. */
  const messages = [target, ...thread.filter((message) => message !== target)];

  if (messages.some(isModerationReport)) {
    const reporter = reporterFromThread(messages, { selfAddresses });
    if (reporter) return reporter;
  }

  /* Not a report, or a report that names nobody: the normal rules apply. */
  return replyAddressFor(target, { selfAddresses });
}
