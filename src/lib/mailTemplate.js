/* ============================================================
   Outgoing mail template.

   Every message Agora Mail sends is wrapped in this document so the
   "agora." wordmark, the violet period, the MAIL chip and the palette
   match the web app, agora.in.net and the Android app — including the
   sign-in templates Agora already sends (same plain, table-based HTML
   with no external stylesheet, so it renders the same in Gmail, Apple
   Mail and Outlook).

   Inline styles and tables are deliberate: email clients ignore <style>
   blocks and modern layout, and gradients are unreliable, so the brand
   bar is drawn with three solid cells.
   ============================================================ */

import { escapeHtml, snippet } from './format.js';

/** Light-theme Agora palette — the readable one in every mail client. */
export const MAIL_BRAND = {
  canvas: '#F7F9FC',
  surface: '#FFFFFF',
  border: '#E7EBF2',
  ink: '#1A1E23',
  muted: '#4B5563',
  faint: '#5A6472',
  accent: '#6D28D9',
  accentDeep: '#5B21B6',
  accentBlue: '#1D4ED8',
  accentSoft: '#F3EEFF',
  accentBorder: '#DDD6FE',
  quote: '#8B5CF6',
};

const FONT_SANS =
  "'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif";
const FONT_MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";

/** The `agora.` wordmark, with the same treatment as `.brand-word` on the web. */
function wordmark(fontSize = 22) {
  return (
    `<span style="font-family:${FONT_SANS};font-size:${fontSize}px;font-weight:800;` +
    `letter-spacing:-1.3px;line-height:1;color:${MAIL_BRAND.ink};text-transform:lowercase;">` +
    `agora<span style="color:${MAIL_BRAND.accent};">.</span></span>`
  );
}

/** The uppercase "MAIL" chip that sits beside the wordmark in the app. */
function productChip() {
  return (
    `<span style="display:inline-block;margin-left:8px;padding:3px 7px 2px;` +
    `border:1px solid ${MAIL_BRAND.accentBorder};border-radius:999px;` +
    `background-color:${MAIL_BRAND.accentSoft};color:${MAIL_BRAND.accent};` +
    `font-family:${FONT_MONO};font-size:9px;font-weight:600;letter-spacing:2px;` +
    `line-height:1;text-transform:uppercase;vertical-align:3px;">Mail</span>`
  );
}

/** Escape text, then turn blank lines into paragraphs and single breaks into <br />. */
function renderText(value) {
  const paragraphs = String(value || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return '';

  return paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px;font-family:${FONT_SANS};font-size:15px;` +
        `line-height:1.7;color:${MAIL_BRAND.ink};">` +
        `${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`,
    )
    .join('');
}

/**
 * Quoted originals arrive as HTML from the mailbox. Drop anything that could
 * execute in a mail client; everything else is passed through untouched.
 */
function sanitizeQuote(html = '') {
  return String(html)
    .replace(/<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?:script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

function quoteBlock({ replyingTo }) {
  const when = new Date(replyingTo.created_at);
  const stamp = Number.isNaN(when.getTime()) ? '' : when.toLocaleString();
  const original = replyingTo.html_body
    ? sanitizeQuote(replyingTo.html_body)
    : renderText(replyingTo.text_body);

  return `
        <tr>
          <td style="padding:8px 28px 26px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="3" style="width:3px;background-color:${MAIL_BRAND.quote};border-radius:3px;font-size:0;line-height:0;">&nbsp;</td>
                <td style="padding-left:14px;font-family:${FONT_SANS};font-size:13px;line-height:1.65;color:${MAIL_BRAND.muted};">
                  <p style="margin:0 0 8px;font-weight:600;color:${MAIL_BRAND.faint};">
                    On ${escapeHtml(stamp)}, ${escapeHtml(replyingTo.from_address || '')} wrote:
                  </p>
                  <div style="color:${MAIL_BRAND.muted};">${original}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

/**
 * Build the full HTML document for an outgoing message.
 *
 * @param {object}  options
 * @param {string}  options.body        Plain-text body typed in the composer.
 * @param {object=} options.replyingTo  The message being replied to, if any.
 * @param {string=} options.subject     Used for the document title / preheader.
 * @param {string=} options.toAddress   Recipient, for the preheader preview.
 */
export function buildOutgoingHtml({ body, replyingTo, subject = '', toAddress = '' } = {}) {
  const title = subject?.trim() || 'Agora Mail';
  const preheader = snippet(body, 120) || (replyingTo ? `Reply to ${replyingTo.from_address || ''}` : '');
  const recipient = toAddress?.trim();

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
<body style="margin:0;padding:0;width:100%;background-color:${MAIL_BRAND.canvas};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${MAIL_BRAND.canvas};">
    ${escapeHtml(preheader)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${MAIL_BRAND.canvas};">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${MAIL_BRAND.surface};border:1px solid ${MAIL_BRAND.border};border-radius:18px;">

          <!-- Brand bar: three solid stops standing in for the violet → blue gradient.
               It lives in its own table so its cells never add columns to the card. -->
          <tr>
            <td style="padding:0;font-size:0;line-height:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="33%" height="3" style="height:3px;background-color:${MAIL_BRAND.accentDeep};border-radius:18px 0 0 0;font-size:0;line-height:0;">&nbsp;</td>
                  <td width="34%" height="3" style="height:3px;background-color:${MAIL_BRAND.quote};font-size:0;line-height:0;">&nbsp;</td>
                  <td width="33%" height="3" style="height:3px;background-color:#60A5FA;border-radius:0 18px 0 0;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Lockup -->
          <tr>
            <td style="padding:22px 28px 18px;border-bottom:1px solid ${MAIL_BRAND.border};">
              ${wordmark()}${productChip()}
            </td>
          </tr>

          <!-- Message -->
          <tr>
            <td style="padding:26px 28px 10px;">
              ${renderText(body)}
            </td>
          </tr>
          ${replyingTo ? quoteBlock({ replyingTo }) : ''}

          <!-- Footer -->
          <tr>
            <td style="padding:18px 28px 24px;border-top:1px solid ${MAIL_BRAND.border};text-align:center;">
              <div style="width:40px;height:2px;margin:0 auto 12px;background-color:${MAIL_BRAND.accent};border-radius:2px;font-size:0;line-height:0;">&nbsp;</div>
              <p style="margin:0 0 6px;font-family:${FONT_MONO};font-size:10px;letter-spacing:1.8px;line-height:1.6;text-transform:uppercase;color:${MAIL_BRAND.faint};">
                Agora Mail &middot; @agora.in.net
              </p>
              <p style="margin:0;font-family:${FONT_SANS};font-size:11px;line-height:1.6;color:${MAIL_BRAND.faint};">
                <a href="https://agora.in.net" style="color:${MAIL_BRAND.accent};text-decoration:none;">agora.in.net</a>
                &nbsp;&middot;&nbsp; a human-first public square
              </p>
            </td>
          </tr>
        </table>

        <p style="margin:14px 0 0;font-family:${FONT_SANS};font-size:11px;line-height:1.6;color:${MAIL_BRAND.faint};">
          Sent from Agora Mail${recipient ? ` &middot; to ${escapeHtml(recipient)}` : ''}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
