/* ============================================================
   Outgoing mail template.

   The sender worker (agora-mail-sender) already wraps every message in the
   Agora brand header — logo, "agora." wordmark, rule — and closes it with
   "Sent securely via Agora Mail · © agora.in.net". So this document is
   deliberately text-first: it contributes only the message, set in the same
   typography and palette as the app and agora.in.net, and nothing that would
   compete with the wrapper (no second lockup, no card, no gradient bar, no
   duplicate footer).

   Inline styles only: mail clients strip stylesheets and ignore modern
   layout, so the rules live on the elements themselves.
   ============================================================ */

import { escapeHtml, snippet } from './format.js';

/** Light-theme Agora palette — the readable one in every mail client. */
export const MAIL_BRAND = {
  ink: '#1A1E23',
  muted: '#4B5563',
  faint: '#5A6472',
  accent: '#6D28D9',
  quoteRule: '#DDD6FE',
};

const FONT_SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif";
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
        `<p style="margin:0 0 ${index === paragraphs.length - 1 ? '0' : '16px'};` +
        `font-family:${FONT_SANS};font-size:15px;line-height:1.7;` +
        `color:${MAIL_BRAND.ink};">` +
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

/** The message being replied to, set as a quiet violet-ruled aside. */
function quoteBlock(replyingTo) {
  const when = new Date(replyingTo.created_at);
  const stamp = Number.isNaN(when.getTime())
    ? ''
    : when.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const original = replyingTo.html_body
    ? sanitizeQuote(replyingTo.html_body)
    : renderText(replyingTo.text_body);

  return `
<div style="margin:28px 0 0;padding:0 0 0 16px;border-left:2px solid ${MAIL_BRAND.quoteRule};">
  <p style="margin:0 0 10px;font-family:${FONT_MONO};font-size:10px;font-weight:600;` +
    `letter-spacing:1.6px;line-height:1.5;text-transform:uppercase;color:${MAIL_BRAND.faint};">` +
    `On ${escapeHtml(stamp)}, ${escapeHtml(replyingTo.from_address || '')} wrote</p>
  <div style="font-family:${FONT_SANS};font-size:14px;line-height:1.7;color:${MAIL_BRAND.muted};">${original}</div>
</div>`;
}

/**
 * Build the full HTML document for an outgoing message.
 *
 * @param {object}  options
 * @param {string}  options.body        Plain-text body typed in the composer.
 * @param {object=} options.replyingTo  The message being replied to, if any.
 * @param {string=} options.subject     Used for the document title / preheader.
 */
export function buildOutgoingHtml({ body, replyingTo, subject = '' } = {}) {
  const title = subject?.trim() || 'Agora Mail';
  const preheader =
    snippet(body, 120) || (replyingTo ? `Reply to ${replyingTo.from_address || ''}` : '');

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:transparent;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:transparent;">
    ${escapeHtml(preheader)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="padding:0;">
        ${renderText(body)}
        ${replyingTo ? quoteBlock(replyingTo) : ''}
      </td>
    </tr>
  </table>
</body>
</html>`;
}
