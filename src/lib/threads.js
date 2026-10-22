/* ============================================================
   Conversations.

   Mail arrives as rows, one per message. A conversation is everything that
   shares a subject once the reply/forward prefixes are peeled off — the way
   Gmail threads mail without a server-side thread id.

   The same module removes the parts of a message that are not the new
   message: the sender worker's envelope and any quoted original beneath a
   reply, whether it was marked (`data-reply-quote`), wrapped in a
   `<blockquote>`, or pasted after an "--- Original Message ---" rule.
   ============================================================ */

import {
  cleanPreview,
  cleanSubject,
  displayName,
  snippet,
  trimLeadingSubject,
} from './format.js';

/** Subject used when a message has none; each such message stands alone. */
export const NO_SUBJECT = '(no subject)';

const SUBJECT_PREFIX = /^((re|fwd?)\s*:\s*)+/i;

/** Subject with reply/forward prefixes and stray whitespace removed. */
export function normaliseSubject(value = '') {
  const base = cleanSubject(value).replace(SUBJECT_PREFIX, '').trim();
  return base || NO_SUBJECT;
}

/** A stable, case-insensitive key for grouping. */
export function threadKeyFor(subject) {
  return normaliseSubject(subject).toLowerCase();
}

/** `Re: Fwd: Q3 deck` → `Re: Q3 deck`, so a reply never stacks prefixes. */
export function replySubject(value = '') {
  const base = normaliseSubject(value);
  return base === NO_SUBJECT ? 'Re:' : `Re: ${base}`;
}

const timestamp = (email) => {
  const value = new Date(email?.created_at).getTime();
  return Number.isNaN(value) ? 0 : value;
};

const compareAscending = (first, second) =>
  timestamp(first) - timestamp(second) || String(first?.id).localeCompare(String(second?.id));

/**
 * Group rows into conversations, newest conversation first, messages inside
 * each conversation oldest first.
 *
 * @param {Array<object>} emails Rows from the mailbox, any order.
 * @returns {Array<{key: string, subject: string, emails: object[], latest: object,
 *   count: number, unread: number, participants: string[], lastActivity: number}>}
 */
export function groupIntoThreads(emails = []) {
  const buckets = new Map();

  for (const email of emails) {
    if (!email || email.id === undefined || email.id === null) continue;

    const subject = normaliseSubject(email.subject);
    /* An empty subject is not evidence of a conversation: keep those apart. */
    const key = subject === NO_SUBJECT ? `no-subject:${email.id}` : subject.toLowerCase();

    const bucket = buckets.get(key) || { key, subject, emails: [] };
    bucket.emails.push(email);
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map(({ key, subject, emails: members }) => {
      const ordered = [...members].sort(compareAscending);
      const latest = ordered[ordered.length - 1];

      const seen = new Set();
      const participants = [];
      for (const message of ordered) {
        const name = displayName(message.from_address);
        if (name && !seen.has(name)) {
          seen.add(name);
          participants.push(name);
        }
      }

      return {
        key,
        subject,
        emails: ordered,
        latest,
        count: ordered.length,
        unread: ordered.filter((message) => !message.is_read).length,
        participants,
        lastActivity: timestamp(latest),
      };
    })
    .sort((first, second) => second.lastActivity - first.lastActivity || first.key.localeCompare(second.key));
}

/* ---------- the new message only --------------------------------------- */

const BODY_MARKER = /<!--\s*(?:main\s+message\s+body|message)\s*-->/i;

/** Index of the matching `</div>` for the `<div>` starting at `start`. */
function closingDivIndex(source, start) {
  const tag = /<(\/?)div\b[^>]*>/gi;
  tag.lastIndex = start;
  let depth = 0;
  let match = tag.exec(source);

  while (match) {
    if (match[1]) {
      depth -= 1;
      if (depth === 0) return match.index;
    } else if (!/\/>$/.test(match[0])) {
      depth += 1;
    }
    match = tag.exec(source);
  }

  return -1;
}

/**
 * The sender worker wraps our fragment in its own card, logo and footer. When
 * a message is read back from Sent, only the fragment inside the
 * `<!-- Main Message Body -->` marker is the message; everything around it is
 * envelope. Mail from anyone else has no marker and passes through intact.
 */
export function extractMessageHtml(html = '') {
  const source = String(html || '');
  const marker = source.match(BODY_MARKER);
  if (!marker) return source;

  const after = source.slice(marker.index + marker[0].length);
  const opening = after.match(/<div\b[^>]*>/i);
  if (!opening) return after.trim();

  const contentStart = opening.index + opening[0].length;
  const contentEnd = closingDivIndex(after, opening.index);
  return (contentEnd === -1 ? after.slice(contentStart) : after.slice(contentStart, contentEnd)).trim();
}

/** A hidden preheader is not part of what the reader should see. */
export function stripPreheader(html = '') {
  return String(html || '').replace(
    /<div\b[^>]*style="[^"]*display\s*:\s*none[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    '',
  );
}

const REPLY_QUOTE_TAG = /<[a-z]+\b[^>]*\bdata-reply-quote\b[^>]*>/i;
const ORIGINAL_MARKER = /-{2,}\s*original message\s*-{2,}/i;

/** Remove quoted originals from message HTML, keeping only the new text. */
export function stripQuotedHtml(html = '') {
  let out = String(html || '');

  /* Our own replies mark the quote; it is the last block of the fragment, so
     everything from the marker on belongs to the old thread. */
  const marked = out.search(REPLY_QUOTE_TAG);
  if (marked >= 0) out = out.slice(0, marked);

  const original = out.search(ORIGINAL_MARKER);
  if (original >= 0) out = out.slice(0, original);

  /* `<blockquote>` is how every mail client has quoted replies for decades.
     Strip the innermost first so nested quotes do not leave shells behind. */
  const innermost = /<blockquote\b[^>]*>(?:(?!<blockquote\b)[\s\S])*?<\/blockquote>/gi;
  while (innermost.test(out)) out = out.replace(innermost, '');

  /* An attribution line without a wrapper ("On 3 May, Meera wrote:") is quote
     chrome too, but only when it trails the message. */
  out = out.replace(
    /(?:<p\b[^>]*>|<div\b[^>]*>)?\s*On\s[\s\S]{0,300}?wrote:\s*(?:<\/p>|<\/div>)?\s*$/i,
    '',
  );

  return out.trim();
}

/** Remove quoted originals from a plain-text body. */
export function stripQuotedText(text = '') {
  let out = String(text || '').replace(/\r\n/g, '\n');

  const markers = [
    /-{2,}\s*original message\s*-{2,}/i,
    /(?:^|\n)\s*On\s[^\n]{0,300}?wrote:\s*(?:\n|$)/i,
    /(?:^|\n)\s*From:\s[^\n]*\n\s*(?:Sent|Date|To|Subject):/i,
    /(?:^|\n)\s*_{8,}\s*(?:\n|$)/,
  ];

  let cut = -1;
  for (const marker of markers) {
    const match = out.match(marker);
    if (match && (cut === -1 || match.index < cut)) cut = match.index;
  }
  if (cut >= 0) out = out.slice(0, cut);

  /* Trailing `> quoted` lines with no attribution above them. */
  out = out.replace(/(?:\n\s*>.*)+\s*$/g, '');

  return out.trim();
}

/**
 * One line for a collapsed message bar or a list row: quote and envelope
 * removed, subject de-duplicated, whitespace collapsed.
 */
export function messagePreview(email = {}, max = 90) {
  const html = email.html_body
    ? stripQuotedHtml(extractMessageHtml(email.html_body))
    : '';
  const text = email.text_body ? stripQuotedText(email.text_body) : '';
  const source = text || html || email.html_body || '';

  return snippet(trimLeadingSubject(cleanPreview(source), email.subject), max);
}
