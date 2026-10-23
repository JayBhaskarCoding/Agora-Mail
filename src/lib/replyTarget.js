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
  stripStyleAndScript,
} from './format.js';

/* The spec's patterns, kept as sources so every scan starts from zero. */
const MAILTO_SOURCE = 'mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})';
const REGISTERED_SOURCE =
  'Registered Email:[\\s\\S]{0,200}?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})';

/* Agora's own mailboxes. Neither can take a reply: one is the sender of the
   reports, the other is the service address. */
const SYSTEM_ADDRESSES = new Set(['mail@agora.in.net', 'noreply@agora.in.net']);

/* Contact-form feedback arrives from this mailbox, but the person who wrote it
   is named only in the body. */
const CONTACT_ADDRESS = 'contact@agora.in.net';
const CONTACT_SENDER = /\bAgora\s+Contact\s+Form\b/i;
/* `New Agora Feedback: …`, and the `Re:`/`Fwd:` variants a thread accumulates. */
const CONTACT_SUBJECT = /^\s*(?:(?:re|fwd|fw)\s*:\s*)*New\s+Agora\s+Feedback\s*:/i;

/* The labeled field beats a link: a template's `Email:` line is the submitter's
   address, while a `mailto:` can be any anchor in the card. */
const EMAIL_FIELD_SOURCE =
  'Email:[\\s\\S]{0,100}?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})';

const REPORT_SUBJECT = /^\s*\[report:/i;

/* The handle a report names for the reporter — `Report by @ron`. */
const REPORTED_BY =
  /\b(?:report(?:ed)?\s+by|reporter(?:\s+handle)?)\s*:?\s*@([A-Za-z0-9_][A-Za-z0-9._-]{0,29})/i;

/* Any standalone `@handle`, but never the `@` inside an email address:
   `jay@example.com` has a word character before it and a domain after it. */
const ANY_HANDLE = /(?:^|[^\w.%+-])@([A-Za-z0-9_][A-Za-z0-9._-]{1,29})(?![\w@]|\.[A-Za-z]{2,})/;

/* CSS at-rules look exactly like handles. They are never a person, even when
   a stray rule survives the scrub — `@import` and `@media` are the ones that
   used to be printed as a moderator's name. */
const CSS_AT_RULES = new Set([
  'import',
  'media',
  'keyframes',
  'font-face',
  'supports',
  'charset',
  'namespace',
  'page',
  'layer',
  'container',
  'property',
  'document',
  'viewport',
]);

/**
 * A body as plain text: styles and scripts removed first, then tags become
 * spaces and entities resolve.
 *
 * The scrub is the whole point: matching a handle against raw HTML finds
 * `@import` inside a `<style>` block, and the reply box then offers to reply
 * to a CSS rule. This is the `@import` bug's fix, at its source.
 */
function textOf(body) {
  return decodeEntities(stripStyleAndScript(String(body)).replace(/<[^>]+>/g, ' '));
}

const isCssAtRule = (handle = '') => CSS_AT_RULES.has(handle.replace(/^@/, '').toLowerCase());

const tidyHandle = (value = '') => `@${String(value).replace(/[._-]+$/, '')}`;

/** A message that came from the moderation pipeline rather than a person. */
export function isModerationReport(message) {
  if (!message) return false;

  const sender = extractEmailAddress(message.from_address || message.from || '').toLowerCase();
  if (sender && (SYSTEM_ADDRESSES.has(sender) || isNoReplyAddress(sender))) return true;

  return REPORT_SUBJECT.test(String(message.subject || ''));
}

/**
 * Did this message arrive through Agora's contact form?
 *
 * The form posts from `contact@agora.in.net`, so the sender is a robot and the
 * person who wrote the feedback exists only inside the body. The subject the
 * form generates (`New Agora Feedback: …`) identifies it even once the thread
 * has grown a `Re:` prefix.
 */
export function isContactForm(message) {
  if (!message) return false;

  const from = String(message.from_address || message.from || '');
  if (extractEmailAddress(from).toLowerCase() === CONTACT_ADDRESS) return true;
  if (CONTACT_SENDER.test(from)) return true;

  return CONTACT_SUBJECT.test(String(message.subject || ''));
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
    if (named && !isCssAtRule(named[1])) return tidyHandle(named[1]);
  }

  /* A template that words it differently still names the handle somewhere. */
  for (const body of bodies) {
    const loose = body.match(ANY_HANDLE);
    if (loose && !isCssAtRule(loose[1])) return tidyHandle(loose[1]);
  }

  return '';
}

/**
 * The submitter behind a contact-form message, read out of its body.
 *
 * Two passes, the labeled field first and the `mailto:` anchors second, so a
 * decorative link in the template never beats the `Email:` line. The address
 * the form itself posts from, Agora's own mailboxes and our own account are
 * all skipped: none of them is the person who wrote in.
 *
 * Returns '' when the message names nobody we could write to.
 */
function submitterFromThread(messages, { selfAddresses = [] } = {}) {
  const self = new Set(
    (Array.isArray(selfAddresses) ? selfAddresses : [selfAddresses])
      .filter(Boolean)
      .map((value) => extractEmailAddress(value).toLowerCase())
      .filter(Boolean),
  );

  const usable = (address) => {
    const lower = String(address || '').trim().toLowerCase();
    if (!lower) return '';
    if (lower === CONTACT_ADDRESS || SYSTEM_ADDRESSES.has(lower)) return '';
    if (isNoReplyAddress(lower) || self.has(lower)) return '';
    return String(address).trim();
  };

  for (const source of [EMAIL_FIELD_SOURCE, MAILTO_SOURCE]) {
    for (const message of messages) {
      for (const body of bodiesOf(message)) {
        /* Styles and scripts can hide an address that is not content. */
        const clean = stripStyleAndScript(body);
        for (const address of addressesFrom(clean, source)) {
          const found = usable(address);
          if (found) return found;
        }
      }
    }
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

  /* Contact-form feedback answers to its submitter, not to the robot that
     posted it. The sender, the subject or any message in the thread can
     identify the form; the address is always in a body. */
  if (messages.some(isContactForm)) {
    const submitter = submitterFromThread(messages, { selfAddresses });
    if (submitter) return submitter;
  }

  if (messages.some(isModerationReport)) {
    const reporter = reporterFromThread(messages, { selfAddresses });
    if (reporter) return reporter;
  }

  /* Not a report, or a report that names nobody: the normal rules apply. */
  return replyAddressFor(target, { selfAddresses });
}
