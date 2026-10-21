/* ============================================================
   Agora Mail — outbound sender (Cloudflare Worker)

   Receives a message fragment from the webmail, wraps it in the Agora
   card, and hands it to Resend. Also records the message in Supabase for
   the Sent folder.

   What changed in this revision
   - The client sends the message *body* only; this file owns the shell.
     Previously the client sent a whole document — doctype, head, a white
     card — and it was injected inside a div in the middle of this one, so
     every mail was a white card nested in a dark card.
   - `text` is honoured when the client supplies it, and otherwise derived
     properly: blocks become blank lines, `<br>` and `<li>` are respected,
     and `<style>`/comments/hidden preheaders never reach the text part.
     The old derivation put the client's `mso` CSS and the hidden
     preheader straight into the plain-text body.
   - The preheader is derived from the body *before* the reply quote, cut
     at `data-reply-quote`, with the subject de-duplicated and entities
     decoded — so a reply previews the reply, not the thread.
   - Escape the preview text. It is user input, interpolated into HTML.
   - Sent rows record the real text body rather than the preview line.

   Bindings: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
   ============================================================ */

const BRAND = {
  canvas: '#F4F4F7',
  card: '#101116',
  cardEdge: '#262833',
  ink: '#F5F6FA',
  body: '#D3D7E1',
  muted: '#A5ABBB',
  faint: '#7B8295',
  accent: '#8B5CF6',
  accentDeep: '#5B21B6',
  accentBlue: '#60A5FA',
  rule: '#4C3D8F',
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";

const LOGO_URL =
  'https://sepvcatdqrnzjuvxabzh.supabase.co/storage/v1/object/public/assets/logo.png';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/* ---------- text helpers ------------------------------------------------ */

const NAMED = {
  nbsp: ' ', ensp: ' ', emsp: ' ', middot: '·', bull: '•', hellip: '…',
  mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", copy: '©', reg: '®',
};

function decodeEntities(value = '') {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z][a-z0-9]+);/gi, (match, name) => NAMED[name.toLowerCase()] ?? match);
}

function escapeHtml(value = '') {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
}

/** Strip markup without leaving CSS or preheader copy behind. */
function htmlToText(html = '') {
  return decodeEntities(
    String(html)
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|head|title)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<div[^>]*(?:display\s*:\s*none|mso-hide)[^>]*>[\s\S]*?<\/div>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n• ')
      .replace(/<\/(p|div|tr|h[1-6]|blockquote|table|ul|ol|section)>/gi, '\n\n')
      .replace(/<\/td>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** One clean line: what a mail client shows beside the subject. */
function toSnippet(value = '', max = 150) {
  const text = decodeEntities(String(value))
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u200b-\u200d\ufeff\u00a0]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Remove a subject the body repeats, without mangling a body that happens to
 * open with the same words.
 *
 * "Weekend plans: Saturday then" loses the subject. "Weekend plans are set"
 * keeps it: a bare space after the subject is ambiguous, so only punctuation
 * or a second copy of the subject counts as repetition.
 */
function stripLeadingSubject(line, subject) {
  const clean = String(subject || '').trim();
  if (!clean) return line;

  let out = line;
  for (let pass = 0; pass < 3; pass += 1) {
    if (!out.toLowerCase().startsWith(clean.toLowerCase())) break;
    const rest = out.slice(clean.length);
    const afterSpace = rest.replace(/^[\s]+/, '');
    const repeats = afterSpace.toLowerCase().startsWith(clean.toLowerCase());

    if (repeats || /^\s*[:,.\-—–|·»]/.test(rest)) {
      out = afterSpace.replace(/^[:,.\-—–|·»]+\s*/, '');
      continue;
    }
    break;
  }

  return out;
}

/**
 * The preview line for a message.
 *
 * An explicit `previewText` always wins. Otherwise use the message before
 * the reply quote, so a reply does not preview the thread it answers.
 */
function derivePreheader({ html = '', previewText = '', subject = '' }) {
  let line = String(previewText || '').trim();

  if (line) {
    line = toSnippet(stripLeadingSubject(toSnippet(line), subject));
  } else {
    /* Cut on the whole opening tag: splitting at the attribute name alone
       leaves a dangling `<div` that escapes as text. */
    const quoted = /<div[^>]*data-reply-quote[^>]*>/i;
    const bodyOnly = String(html).split(quoted)[0];
    line = toSnippet(stripLeadingSubject(toSnippet(htmlToText(bodyOnly)), subject));
  }

  return line;
}

/* ---------- the mail ---------------------------------------------------- */

/** Three solid cells: Outlook drops linear-gradient, so the stops are real. */
function gradientEdge(radius) {
  const cap = radius ? 'border-radius:18px 18px 0 0;' : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;${cap}">
  <tr>
    <td width="34%" height="3" style="height:3px;background-color:${BRAND.accentDeep};font-size:0;line-height:0;">&nbsp;</td>
    <td width="33%" height="3" style="height:3px;background-color:${BRAND.accent};font-size:0;line-height:0;">&nbsp;</td>
    <td width="33%" height="3" style="height:3px;background-color:${BRAND.accentBlue};font-size:0;line-height:0;">&nbsp;</td>
  </tr>
</table>`;
}

function brandedDocument({ html, preheader }) {
  const year = new Date().getFullYear();
  const spacer = '&#8203;&nbsp;'.repeat(120);

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <title>Agora Mail</title>
  <!--[if mso]><style>body,table,td,p,a{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${BRAND.canvas};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.canvas};">
    ${escapeHtml(preheader)}${spacer}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.canvas};border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:36px 16px;">

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:separate;">
          <tr>
            <td style="padding:0;font-size:0;line-height:0;">${gradientEdge(true)}</td>
          </tr>
          <tr>
            <td style="background-color:${BRAND.card};border:1px solid ${BRAND.cardEdge};border-top:0;border-radius:0 0 18px 18px;padding:30px 32px 32px;">

              <!-- Brand row -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 24px;">
                <tr>
                  <td style="padding:0 10px 0 0;vertical-align:middle;">
                    <!-- The violet cell is the fallback: if Storage is
                         unreachable the mark still reads as the app icon
                         instead of a broken-image placeholder. -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                      <tr>
                        <td width="26" height="26" bgcolor="${BRAND.accent}" style="width:26px;height:26px;background-color:${BRAND.accent};border-radius:7px;font-size:0;line-height:0;">
                          <img src="${LOGO_URL}" alt="Agora" width="26" height="26" style="display:block;width:26px;height:26px;border-radius:7px;border:0;outline:none;text-decoration:none;" />
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-family:${FONT};font-size:20px;font-weight:700;letter-spacing:-1.1px;line-height:1;color:${BRAND.ink};">agora<span style="color:${BRAND.accent};">.</span></span>
                  </td>
                </tr>
              </table>

              <div style="height:1px;background-color:${BRAND.cardEdge};font-size:0;line-height:0;margin:0 0 26px;">&nbsp;</div>

              <!-- Message -->
              <div style="font-family:${FONT};font-size:15px;line-height:1.7;color:${BRAND.body};">
                ${html}
              </div>

              <!-- Footer -->
              <div style="height:1px;background-color:${BRAND.cardEdge};font-size:0;line-height:0;margin:32px 0 16px;">&nbsp;</div>
              <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.faint};">
                Sent securely via Agora Mail&nbsp;&bull;&nbsp;&copy; ${year} Agora.in.net
              </p>

            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ---------- handler ----------------------------------------------------- */

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    try {
      const payload = await request.json();
      const {
        to,
        subject,
        html,
        text,
        customFrom,
        senderName,
        attachments,
        previewText,
      } = payload;

      if (!to || !String(to).trim()) return json({ error: 'A recipient is required.' }, 400);
      if (!html || !String(html).trim()) return json({ error: 'A message body is required.' }, 400);

      const rawAddress = (customFrom || 'mail@agora.in.net').trim();
      const displayName = (senderName || 'Agora Mail').trim();
      const formattedSender = rawAddress.includes('<')
        ? rawAddress
        : `${displayName} <${rawAddress}>`;

      /* The client's plain-text part is the most faithful one it can build;
         fall back to deriving it from the HTML when it is absent. */
      const plainText = String(text || '').trim() || htmlToText(html);
      const preheader = derivePreheader({ html, previewText, subject });
      const brandedHtml = brandedDocument({ html, preheader });

      const resendBody = {
        from: formattedSender,
        to: [String(to).trim()],
        reply_to: rawAddress.includes('<') ? rawAddress.replace(/.*<([^>]+)>.*/, '$1') : rawAddress,
        subject: subject || '(no subject)',
        html: brandedHtml,
        text: plainText,
      };

      if (Array.isArray(attachments) && attachments.length > 0) {
        resendBody.attachments = attachments;
      }

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
        },
        body: JSON.stringify(resendBody),
      });

      const resendData = await resendRes.json().catch(() => ({}));
      if (!resendRes.ok) {
        return json({ error: resendData.message || 'Failed to send' }, 400);
      }

      /* Record the message for the Sent folder. The stored text is the real
         body, so the webmail's list preview shows the message rather than
         the preheader line. */
      await fetch(`${env.SUPABASE_URL}/rest/v1/emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          from_address: formattedSender,
          to_address: String(to).trim(),
          subject: subject || '(no subject)',
          text_body: plainText,
          html_body: brandedHtml,
          folder: 'sent',
          is_read: true,
          attachments: Array.isArray(attachments)
            ? attachments.map((attachment) => ({ filename: attachment.filename }))
            : [],
          created_at: new Date().toISOString(),
        }),
      });

      return json({ success: true, data: resendData });
    } catch (error) {
      return json({ error: error.message }, 500);
    }
  },
};
