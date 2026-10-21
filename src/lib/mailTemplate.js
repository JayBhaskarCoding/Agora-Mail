/* ============================================================
   Outgoing message fragment.

   The sender worker owns the envelope: the dark Agora card, the logo and
   wordmark, the gradient edge, the footer and the hidden preheader. This
   module supplies only what the sender typed — paragraphs and, for a
   reply, the quoted original.

   Sending a full document here (doctype, head, its own white card) meant
   the worker injected it inside its own dark card: a card in a card, with
   duplicate `<head>`/`<body>` tags and the client's stylesheet leaking
   into the plain-text part.

   Styling is inline and tuned for the worker's dark card, because that is
   where it lands.
   ============================================================ */

import { escapeHtml } from './format.js';

/** Palette of the card the worker wraps this fragment in. */
export const MAIL_BRAND = {
  body: '#D3D7E1',
  muted: '#A5ABBB',
  faint: '#8B93A7',
  accent: '#A78BFA',
  quoteRule: '#6D5BD0',
};

const FONT_SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";

/**
 * Escape text, keep blank-line paragraphs, turn single breaks into <br />.
 * `quiet` renders the quoted original a step smaller and dimmer.
 */
function renderText(value, { quiet = false } = {}) {
  const paragraphs = String(value || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const size = quiet ? 14 : 15;
  const colour = quiet ? MAIL_BRAND.muted : MAIL_BRAND.body;

  return paragraphs
    .map(
      (paragraph, index) =>
        `<p style="margin:0 0 ${index === paragraphs.length - 1 ? '0' : '16px'};` +
        `font-family:${FONT_SANS};font-size:${size}px;line-height:1.7;` +
        `color:${colour};word-break:break-word;">` +
        `${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`,
    )
    .join('');
}

/**
 * Quoted originals arrive as HTML from the mailbox. Drop anything that could
 * execute in a mail client; everything else passes through untouched.
 */
function sanitizeQuote(html = '') {
  return String(html)
    .replace(/<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?:script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

/**
 * The sender's display name, or their address when they have none. A quote
 * attribution should read "Ananya Rao", not a mailbox with angle brackets.
 */
function quoteAuthor(fromAddress = '') {
  const raw = String(fromAddress || '').trim();
  const named = raw.match(/^(.*?)<[^>]+>$/);
  const name = (named ? named[1] : '').replace(/^["']|["']$/g, '').trim();
  if (name) return name;
  const bare = raw.match(/[^\s<>]+@[^\s<>]+/);
  return bare ? bare[0] : raw;
}

/**
 * The message being replied to, set as a quiet violet-ruled aside.
 *
 * `data-reply-quote` marks the block: the sender worker cuts the inbox
 * preview at it, so a reply previews the reply rather than the thread it
 * answers. It must stay the first attribute on its element.
 */
function quoteBlock(replyingTo) {
  const when = new Date(replyingTo.created_at);
  const stamp = Number.isNaN(when.getTime())
    ? ''
    : when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const original = replyingTo.html_body
    ? sanitizeQuote(replyingTo.html_body)
    : renderText(replyingTo.text_body, { quiet: true });

  return `<div data-reply-quote="true" style="margin:24px 0 0;padding:2px 0 0 14px;border-left:2px solid ${MAIL_BRAND.quoteRule};">
  <p style="margin:0 0 10px;font-family:${FONT_SANS};font-size:12px;line-height:1.6;color:${MAIL_BRAND.faint};">On ${escapeHtml(stamp)}, ${escapeHtml(quoteAuthor(replyingTo.from_address))} wrote:</p>
  <div style="font-family:${FONT_SANS};font-size:14px;line-height:1.7;color:${MAIL_BRAND.muted};">${original}</div>
</div>`;
}

/**
 * The message fragment the worker wraps.
 *
 * @param {object}  options
 * @param {string}  options.body        Plain-text body typed in the composer.
 * @param {object=} options.replyingTo  The message being replied to, if any.
 */
export function buildMessageBody({ body, replyingTo } = {}) {
  return `${renderText(body)}${replyingTo ? quoteBlock(replyingTo) : ''}`;
}

/**
 * The text/plain twin.
 *
 * The worker prefers this over deriving one from the HTML, so notification
 * previews and "show original" carry the letter rather than the card's
 * chrome.
 */
export function buildMessageText({ body, replyingTo } = {}) {
  const text = String(body || '').replace(/\r\n/g, '\n').trim();
  if (!replyingTo) return text;

  const when = new Date(replyingTo.created_at);
  const stamp = Number.isNaN(when.getTime())
    ? ''
    : when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  return `${text}\n\nOn ${stamp}, ${quoteAuthor(replyingTo.from_address)} wrote:\n\n${String(
    replyingTo.text_body || '',
  ).trim()}`;
}
