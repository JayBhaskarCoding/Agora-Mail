/* ============================================================
   Formatting helpers shared by the mail list, reader and composer.
   ============================================================ */

/**
 * Pull the bare address out of `"Name <name@domain>"`.
 * Returns the input trimmed when it is already an address.
 */
export function extractEmailAddress(value = '') {
  const raw = String(value || '').trim();
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1].trim() : raw;
}

/**
 * Split an RFC 5322-ish mailbox string into its parts.
 * `display` is the safest single-line label for the UI.
 */
export function parseAddress(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return { name: '', address: '', display: 'Unknown sender' };

  const match = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) {
    const name = decodeEntities(match[1].replace(/^["']|["']$/g, '')).trim();
    const address = match[2].trim();
    return { name, address, display: name || address };
  }

  return { name: '', address: raw, display: decodeEntities(raw) };
}

export function displayName(value = '') {
  return parseAddress(value).display;
}

/* A mailbox is `Name <addr>` or a bare address. Anything else — an empty
   string, `[]`, a template placeholder, the word "null" — is not a target
   worth sending to. A dot is not required, so a list on an internal domain
   still counts. */
const MAILBOX = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+$/;

/** Split a header value on the commas between addresses, leaving the commas
    inside `"Rao, Meera" <meera@x.dev>` where they belong. */
function splitMailboxes(raw = '') {
  const parts = [];
  let current = '';
  let quoted = false;
  let angled = false;

  for (const char of String(raw)) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === '<') angled = true;
    else if (!quoted && char === '>') angled = false;

    if (char === ',' && !quoted && !angled) {
      parts.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  parts.push(current);
  return parts;
}

/** The candidate as a clean `Name <address>` or bare address, or '' when its
    address half is not an address at all. */
function usableMailbox(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const angled = raw.match(/^(.*?)<([^>]+)>/);
  const address = (angled ? angled[2] : raw).trim().replace(/^["']|["']$/g, '');
  if (!MAILBOX.test(address)) return '';

  if (!angled) return address;

  const name = angled[1].trim().replace(/^["']|["']$/g, '').trim();
  return name ? `${name} <${address}>` : address;
}

/**
 * The first address in a Reply-To value that can be replied to.
 *
 * Mail clients store that header in whichever shape they were handed: a bare
 * address, a `Name <address>` mailbox, a comma-separated header, or — through
 * some imports — an array or a JSON string of one. Returns the mailbox as
 * written (so its display name survives) or '' when there is nothing usable.
 */
export function mailboxesIn(value) {
  if (Array.isArray(value)) {
    const found = [];
    for (const entry of value) {
      for (const mailbox of mailboxesIn(entry)) {
        if (!found.includes(mailbox)) found.push(mailbox);
      }
    }
    return found;
  }

  if (value === null || value === undefined) return [];

  /* Headers arrive HTML-escaped often enough (`List &lt;list@x.dev&gt;`)
     that decoding first is the difference between a usable target and a
     fallback. */
  const raw = decodeEntities(String(value)).trim();
  if (!raw) return [];

  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      const found = mailboxesIn(parsed);
      if (found.length > 0) return found;
    } catch {
      /* not JSON after all — treat it as a plain header value */
    }
  }

  const found = [];
  for (const part of splitMailboxes(raw)) {
    const mailbox = usableMailbox(part);
    if (mailbox && !found.includes(mailbox)) found.push(mailbox);
  }

  return found;
}

/** The first address in a header value that can be replied to. */
export function firstMailbox(value) {
  return mailboxesIn(value)[0] || '';
}

/* Addresses that, by convention, do not take replies. A moderation notice
   from `noreply@agora.in.net` is the case worth catching: if the same value
   also lists a person, the person is the target. */
const NO_REPLY =
  /^(?:no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounce[sd]?|notifications?)(?:[+._-].*)?@/i;

/** True when this mailbox is one that cannot receive an answer. */
export function isNoReplyAddress(value = '') {
  return NO_REPLY.test(extractEmailAddress(value).toLowerCase());
}

/**
 * Where a reply to this message should go.
 *
 * The order is deliberate:
 *
 *   1. `reply_to` / `replyTo` — mailing lists, ticketing systems and no-reply
 *      dispatchers name the mailbox that should receive answers. A moderation
 *      report sent from `noreply@agora.in.net` carries the reporter's
 *      registered address here, and that is where the reply belongs.
 *   2. `from_address` / `from` — an ordinary message has no such header, so it
 *      goes back to its sender.
 *
 * A message in Sent is the exception: its sender is us, so its recipient comes
 * before the sender and a reply never lands in our own inbox.
 *
 * One guard sits across all three: a candidate that is one of *our own*
 * mailboxes is skipped while another usable candidate remains. Outgoing mail
 * is stored with `reply_to` set to the sender, so without this a reply to
 * something we sent would come straight back to us instead of to the person
 * we wrote to.
 *
 * The result is the mailbox as stored (`Name <address>` or a bare address);
 * callers that need just the address pass it through `extractEmailAddress`.
 */
export function replyAddressFor(email = {}, { selfAddresses = [] } = {}) {
  const message = email || {};

  const self = new Set(
    (Array.isArray(selfAddresses) ? selfAddresses : [selfAddresses])
      .filter(Boolean)
      .map((value) => extractEmailAddress(value).toLowerCase())
      .filter(Boolean),
  );

  const outgoing = message.folder === 'sent';
  const candidates = outgoing
    ? [message.reply_to, message.replyTo, message.to_address, message.to, message.from_address, message.from]
    : [message.reply_to, message.replyTo, message.from_address, message.from];

  /* Every address the message offers, in the order it offers them. */
  const usable = [];
  for (const candidate of candidates) {
    for (const mailbox of mailboxesIn(candidate)) {
      if (!usable.includes(mailbox)) usable.push(mailbox);
    }
  }

  const isSelf = (mailbox) => self.has(extractEmailAddress(mailbox).toLowerCase());
  const replyable = (mailbox) => !isSelf(mailbox) && !isNoReplyAddress(mailbox);

  /* A person who can answer beats a robot: our own mailboxes and no-reply
     senders are only used when the message names nothing else. */
  return (
    usable.find(replyable) ||
    usable.find((mailbox) => !isSelf(mailbox)) ||
    usable.find((mailbox) => !isNoReplyAddress(mailbox)) ||
    usable[0] ||
    ''
  );
}

/**
 * A recipient as the Sent list should show it: the name when the mailbox has
 * one, otherwise the handle before the `@` — never the raw
 * `"Rao, Meera" <meera@example.com>` string. The full address is kept for the
 * quieter second line.
 */
export function recipientLabel(value = '') {
  const { name, address } = parseAddress(value);
  const mailbox = address || String(value || '').trim();

  if (name) {
    return {
      primary: name,
      secondary: mailbox && mailbox.toLowerCase() !== name.toLowerCase() ? mailbox : '',
    };
  }

  if (!mailbox) return { primary: 'Unknown recipient', secondary: '' };

  const at = mailbox.indexOf('@');
  const handle = at > 0 ? mailbox.slice(0, at) : mailbox;
  return {
    primary: handle,
    secondary: handle && handle !== mailbox ? mailbox : '',
  };
}

/** One or two initials for the avatar bubble. */
export function initials(value = '') {
  const { name, address, display } = parseAddress(value);
  const source = name || address || display;
  if (!source) return '?';
  if (!name && source.includes('@')) return source.charAt(0).toUpperCase();

  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part.charAt(0)).join('');
  return (letters || source.charAt(0)).toUpperCase();
}

/** Compact stamp for a list row: time today, date this year, year beyond. */
export function formatListTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Full stamp for the reader header. */
export function formatFullTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/* ============================================================
   Text pipeline

   Mail arrives as HTML, and the sender worker's text part inherits the
   markup that produced it — so raw `&nbsp;` / `&middot;` sequences used to
   end up in list previews. Everything shown outside the paper goes through
   these helpers first.
   ============================================================ */

const NAMED_ENTITIES = {
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  zwnj: '',
  zwj: '',
  shy: '',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
  laquo: '\u00ab',
  raquo: '\u00bb',
  middot: '\u00b7',
  bull: '\u2022',
  hellip: '\u2026',
  mdash: '\u2014',
  ndash: '\u2013',
  times: '\u00d7',
  divide: '\u00f7',
  deg: '\u00b0',
  plusmn: '\u00b1',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  euro: '\u20ac',
  pound: '\u00a3',
  yen: '\u00a5',
  cent: '\u00a2',
  sect: '\u00a7',
  para: '\u00b6',
  larr: '\u2190',
  rarr: '\u2192',
  uarr: '\u2191',
  darr: '\u2193',
  check: '\u2713',
  hearts: '\u2665',
};

/* Latin-1 and the common extended letters: envelopes are full of them.
   Named letter entities are case-sensitive — `&agrave;` is à, `&Agrave;` is
   À — so both spellings go in the table. */
const LATIN_LETTERS = {
  agrave: '\u00e0', aacute: '\u00e1', acirc: '\u00e2', atilde: '\u00e3', auml: '\u00e4', aring: '\u00e5',
  aelig: '\u00e6', ccedil: '\u00e7', egrave: '\u00e8', eacute: '\u00e9', ecirc: '\u00ea', euml: '\u00eb',
  igrave: '\u00ec', iacute: '\u00ed', icirc: '\u00ee', iuml: '\u00ef', eth: '\u00f0', ntilde: '\u00f1',
  ograve: '\u00f2', oacute: '\u00f3', ocirc: '\u00f4', otilde: '\u00f5', ouml: '\u00f6', oslash: '\u00f8',
  ugrave: '\u00f9', uacute: '\u00fa', ucirc: '\u00fb', uuml: '\u00fc', yacute: '\u00fd', thorn: '\u00fe',
  szlig: '\u00df', yuml: '\u00ff', oelig: '\u0153', scaron: '\u0161', zcaron: '\u017e',
};

for (const [name, lower] of Object.entries(LATIN_LETTERS)) {
  NAMED_ENTITIES[name] = lower;
  const upper = lower.toUpperCase();
  if (upper.length === 1) NAMED_ENTITIES[name[0].toUpperCase() + name.slice(1)] = upper;
}

Object.assign(NAMED_ENTITIES, {
  emdash: '\u2014',
  endash: '\u2013',
  bullet: '\u2022',
  prime: '\u2032',
  minus: '\u2212',
  le: '\u2264',
  ge: '\u2265',
  ne: '\u2260',
});

function safeCodePoint(codepoint) {
  try {
    return String.fromCodePoint(codepoint);
  } catch {
    return '';
  }
}

/**
 * Drop the parts of an HTML document that look like content but are not:
 * `<style>` rules and `<script>` bodies.
 *
 * Reading a body as text without this is how CSS leaks into the UI — a
 * stylesheet's `@import` or `@media` looks exactly like a social handle, and
 * a mail parser that greps for `@word` will happily report one as a person.
 */
export function stripStyleAndScript(html = '') {
  return String(html || '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

/** Decode the HTML entities that survive into plain-text fields. */
export function decodeEntities(value = '') {
  let text = String(value);

  /* Mail is sometimes escaped twice on its way through a template, so keep
     going until the string stops changing — three passes is plenty. */
  for (let pass = 0; pass < 3; pass += 1) {
    const next = text
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
      .replace(/&([a-z][a-z0-9]+);/gi, (match, name) => {
        const decoded =
          NAMED_ENTITIES[name] === undefined
            ? NAMED_ENTITIES[name.toLowerCase()]
            : NAMED_ENTITIES[name];
        return decoded === undefined ? match : decoded;
      });
    if (next === text) break;
    text = next;
  }

  return text;
}

/**
 * Turn an HTML fragment into readable text, keeping the paragraph and list
 * structure so a plain-text view still reads like a letter.
 */
export function stripHtml(value = '') {
  return String(value)
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/(ul|ol)>/gi, '\n\n')
    .replace(/<\/(p|div|tr|h[1-6]|blockquote|table|section|article|header|footer)>/gi, '\n\n')
    .replace(/<\/td>/gi, '\u00a0')
    .replace(/<[^>]+>/g, ' ');
}

/**
 * Boilerplate the sender worker wraps around every message. It belongs in the
 * mail, not in a one-line list preview or the plain-text view.
 */
const BOILERPLATE = [
  /sent securely via agora mail/gi,
  /sent from agora mail[^·]*/gi,
  /agora mail\s*[·•]\s*@agora\.in\.net/gi,
  /@agora\.in\.net\s*[·•]\s*a human-first public square/gi,
  /agora\.in\.net\s*[·•]\s*a human-first public square/gi,
  /©\s*\d{4}\s*agora\.in\.net/gi,
  /a human-first public square/gi,
];

const BRAND_LINE = /^agora\s*[.·]?\s*(mail)?$/i;

export function stripBoilerplate(value = '') {
  return BOILERPLATE.reduce(
    (text, pattern) => text.replace(pattern, ' '),
    String(value).replace(/^\s*agora\s+\.\s*(?:mail\s+)?/i, ' '),
  );
}

function normaliseWhitespace(value = '') {
  return String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A single readable line for the message list: no tags, no entities, no
 * wrapper copy. Prefers the text part and falls back to the HTML.
 */
export function cleanPreview(value = '') {
  const raw = String(value || '');
  const text = /<[a-z][\s\S]*>/i.test(raw) ? stripHtml(raw) : raw;
  return normaliseWhitespace(
    stripBoilerplate(decodeEntities(text)).replace(/[\s·•|,;:–—-]+$/, ''),
  );
}

/** A plain-text rendering of a message body, preserving paragraph breaks. */
export function plainBody({ text, html } = {}) {
  const source = text && text.trim() ? text : stripHtml(html || '');
  const decoded = stripBoilerplate(decodeEntities(source)).replace(/\u00a0/g, ' ');

  return decoded
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.replace(/[ \t\u200b-\u200d\ufeff]+/g, ' ').trim())
        .filter((line) => line && !BRAND_LINE.test(line) && !/^[·•|,.;:–—-]+$/.test(line))
        .join('\n'),
    )
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Inbound HTML is untrusted. Remove anything that could execute in the page
 * or restyle the app around it; inline presentation styles are kept, because
 * that is how the message is laid out.
 */
export function sanitizeEmailHtml(html = '') {
  return String(html)
    .replace(/<(script|style|iframe|frame|object|embed|link|meta|base)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?:script|style|iframe|frame|object|embed|link|meta|base)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

/**
 * The wrapper the sender worker adds repeats the subject inside the body, so a
 * preview that opens with it reads as a stutter. Drop it when it leads.
 */
export function trimLeadingSubject(preview = '', subject = '') {
  const line = cleanSubject(subject)
    .replace(/^((re|fwd?):\s*)+/i, '')
    .trim();
  const text = String(preview);
  if (!line) return text;

  for (const candidate of [text, text.replace(/^((re|fwd?):\s*)+/i, '')]) {
    const at = candidate.slice(0, line.length + 16).toLowerCase().indexOf(line.toLowerCase());
    if (at >= 0 && at <= 8) {
      const rest = candidate.slice(at + line.length).replace(/^[\s·•,;:–—-]+/, '');
      if (rest.length > 8) return rest;
    }
  }
  return text;
}

/** Subject lines arrive entity-encoded; show them as plain text. */
export function cleanSubject(value = '') {
  return normaliseWhitespace(decodeEntities(value));
}

/** Collapse whitespace and trim to `max`, appending an ellipsis. */
export function snippet(value, max = 240) {
  const clean = normaliseWhitespace(value);
  if (!clean) return 'No message body.';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trimEnd()}\u2026`;
}

/** File sizes for the composer's attachment chips. */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Escape user-typed text before it becomes the HTML of an outgoing mail. */
export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
