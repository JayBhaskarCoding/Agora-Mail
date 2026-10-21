/* ============================================================
   Outgoing mail template.

   Every message leaves through the Agora sender worker, which wraps the
   document below in its own masthead — logo, `agora.` wordmark, a hairline
   — and closes it with "Sent securely via Agora Mail · © Agora.in.net".
   So this document is the letter itself, not another shell: one white
   card with the brand gradient as its signature, set in the same type as
   the app and agora.in.net. No second lockup, no second footer.

   Design notes
   - The card gives the message an edge on the client's white canvas, so it
     reads as a composed document instead of loose text; the 40px gradient
     rule is the only ornament.
   - No hidden preheader: mail clients prepend it to the inbox snippet, and
     it made short messages appear twice in the list.
   - Inline styles and tables only. Gmail, Apple Mail and Outlook honour
     them; the gradient is drawn as three solid cells because Outlook drops
     `linear-gradient`.
   ============================================================ */

import { escapeHtml } from './format.js';

/** Light-theme Agora palette — the readable one in every mail client. */
export const MAIL_BRAND = {
  ink: '#16181D',
  body: '#33383F',
  muted: '#5B6472',
  faint: '#8A91A0',
  accent: '#6D28D9',
  accentDeep: '#5B21B6',
  accentMid: '#8B5CF6',
  accentBlue: '#60A5FA',
  quoteRule: '#DDD6FE',
  line: '#E9E6F2',
  card: '#FFFFFF',
};

const FONT_SANS =
  "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";
const FONT_MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

/** Escape text, keep blank-line paragraphs, turn single breaks into <br />. */
function renderText(value) {
  const paragraphs = String(value || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs
    .map(
      (paragraph, index) =>
        `<p style="margin:0 0 ${index === paragraphs.length - 1 ? '0' : '18px'};` +
        `font-family:${FONT_SANS};font-size:16px;line-height:1.75;` +
        `letter-spacing:-0.003em;color:${MAIL_BRAND.body};word-break:break-word;">` +
        `${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`,
    )
    .join('');
}

/** Quoted plain text: same paragraphs, one step quieter than the reply. */
function renderQuotedText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 12px;font-family:${FONT_SANS};font-size:15px;line-height:1.7;color:${MAIL_BRAND.muted};">` +
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
 * `data-reply-quote` marks the block: the sender worker strips everything
 * inside it when it builds the inbox preview snippet, so a reply previews
 * the new message rather than the thread it answers.
 */
function quoteBlock(replyingTo) {
  const when = new Date(replyingTo.created_at);
  const stamp = Number.isNaN(when.getTime())
    ? ''
    : when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const original = replyingTo.html_body
    ? sanitizeQuote(replyingTo.html_body)
    : renderQuotedText(replyingTo.text_body);

  return `
<div data-reply-quote="true" style="margin:28px 0 0;padding:2px 0 0 16px;border-left:2px solid ${MAIL_BRAND.quoteRule};">
  <p style="margin:0 0 10px;font-family:${FONT_SANS};font-size:12px;line-height:1.6;color:${MAIL_BRAND.faint};">` +
    `On ${escapeHtml(stamp)}, ${escapeHtml(quoteAuthor(replyingTo.from_address))} wrote:</p>
  <div style="font-family:${FONT_SANS};font-size:15px;line-height:1.7;color:${MAIL_BRAND.muted};">${original}</div>
</div>`;
}

/** 40 × 3px violet → blue rule: the only ornament in the message. */
function brandRule() {
  return `
<div style="width:40px;height:3px;margin:0 0 22px;border-radius:2px;background-color:${MAIL_BRAND.accentMid};background-image:linear-gradient(90deg,${MAIL_BRAND.accentDeep},${MAIL_BRAND.accentMid},${MAIL_BRAND.accentBlue});font-size:0;line-height:0;">&nbsp;</div>`;
}

/**
 * Build the full HTML document for an outgoing message.
 *
 * @param {object}  options
 * @param {string}  options.body        Plain-text body typed in the composer.
 * @param {object=} options.replyingTo  The message being replied to, if any.
 * @param {string=} options.subject     Used for the document title.
 * @param {string=} options.previewText Inbox snippet the sender chose. Only
 *   written as a hidden preheader when present, so an unset draft cannot
 *   reintroduce the duplicate-snippet problem described above.
 */
export function buildOutgoingHtml({ body, replyingTo, subject = '', previewText = '' } = {}) {
  const title = subject?.trim() || 'Agora Mail';
  const snippetText = String(previewText || '').trim();

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>${escapeHtml(title)}</title>
  <!--[if mso]><style>body,table,td,p{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:transparent;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
${snippetText ? `
  <!-- Only rendered when the sender typed one: clients show this beside the subject. -->
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:transparent;">
    ${escapeHtml(snippetText)}
  </div>
` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
               style="width:100%;max-width:600px;border-collapse:separate;background-color:${MAIL_BRAND.card};border:1px solid ${MAIL_BRAND.line};border-radius:16px;">
          <tr>
            <td style="padding:28px 30px 30px;">
              ${brandRule()}
              ${renderText(body)}
              ${replyingTo ? quoteBlock(replyingTo) : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * The text/plain twin of the document above.
 *
 * Mail clients show the text part in notification previews and in
 * "show original", and the worker otherwise derives one from the HTML — a
 * derivation that drags the masthead and footer into the inbox snippet. This
 * keeps the plain part to the letter, so a preview opens with the message.
 */
export function buildOutgoingText({ body, replyingTo } = {}) {
  const text = String(body || '').replace(/\r\n/g, '\n').trim();
  if (!replyingTo) return text;

  const when = new Date(replyingTo.created_at);
  const stamp = Number.isNaN(when.getTime())
    ? ''
    : when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const quoteAuthor = String(replyingTo.from_address || '')
    .replace(/<[^>]*>/g, '')
    .replace(/^["']|["']$/g, '')
    .trim() || replyingTo.from_address || '';

  return `${text}\n\nOn ${stamp}, ${quoteAuthor} wrote:\n\n${String(
    replyingTo.text_body || '',
  ).trim()}`;
}
