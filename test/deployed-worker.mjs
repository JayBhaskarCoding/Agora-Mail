/* Fixture: the sender worker exactly as deployed on Cloudflare (Oct 2026),
   kept verbatim so the frontend contract can be tested against reality
   rather than against an idealised version. Do not edit to make a test
   pass — if the deployed behaviour is wrong, assert what it does and fix
   the frontend, or deploy worker/agora-mail-sender.js and update this
   fixture with the new code. */

/* The worker exactly as deployed today, verbatim from the user. */
export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const { to, subject, html, customFrom, senderName, attachments, previewText } = await request.json();

      const rawAddress = customFrom || 'mail@agora.in.net';
      const displayName = senderName || 'Agora Mail';
      const formattedSender = rawAddress.includes('<') ? rawAddress : `${displayName} <${rawAddress}>`;

      const plainText = html
        ? html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>?/gm, '').trim()
        : '';

      const cleanBodyOnly = html
        ? html.split('<div data-reply-quote="true"')[0].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>?/gm, '').trim()
        : '';

      let finalPreheader = (previewText && previewText.trim() !== '')
        ? previewText.trim()
        : cleanBodyOnly;

      if (subject && finalPreheader.toLowerCase().startsWith(subject.toLowerCase())) {
        finalPreheader = finalPreheader.substring(subject.length).trim();
        finalPreheader = finalPreheader.replace(/^[:,\-\s]+/, '');
      }

      const preheaderPadding = '&zwnj; '.repeat(150);
      const LOGO_URL = "https://sepvcatdqrnzjuvxabzh.supabase.co/storage/v1/object/public/assets/logo.png";

      const brandedHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #09090b; color: #f4f4f5; padding: 40px 20px; margin: 0;">

            <div style="display: none; max-height: 0px; overflow: hidden; opacity: 0; font-size: 1px; line-height: 1px; color: #09090b; mso-hide: all;">
              ${finalPreheader}
              ${preheaderPadding}
            </div>

            <div style="max-width: 600px; margin: auto; background-color: #121216; border: 1px solid #27272a; padding: 36px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">

              <!-- Header with Logo and agora. branding -->
              <div style="margin-bottom: 28px; border-bottom: 1px solid #27272a; padding-bottom: 20px;">
                <table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
                  <tr>
                    <td style="padding-right: 12px; vertical-align: middle;">
                      <img src="${LOGO_URL}" alt="" width="32" height="32" style="display: block; width: 32px; height: 32px; border-radius: 8px;" />
                    </td>
                    <td style="vertical-align: middle;">
                      <span style="font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; font-family: inherit;">agora<span style="color: #a855f7;">.</span></span>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Main Message Body -->
              <div style="font-size: 15px; line-height: 1.6; color: #d4d4d8;">
                ${html}
              </div>

              <!-- Footer -->
              <div style="margin-top: 40px; border-top: 1px solid #27272a; padding-top: 20px; font-size: 12px; color: #71717a; text-align: center;">
                Sent securely via Agora Mail &bull; &copy; ${new Date().getFullYear()} Agora.in.net
              </div>

            </div>
          </body>
        </html>
      `;

      const resendBody = {
        from: formattedSender,
        to: [to],
        reply_to: rawAddress,
        subject: subject,
        html: brandedHtml,
        text: plainText,
      };

      if (attachments && attachments.length > 0) {
        resendBody.attachments = attachments;
      }

      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        },
        body: JSON.stringify(resendBody),
      });

      const resendData = await resendRes.json();
      if (!resendRes.ok) {
        return Response.json({ error: resendData.message || "Failed to send" }, { status: 400, headers: { "Access-Control-Allow-Origin": "*" } });
      }

      await fetch(`${env.SUPABASE_URL}/rest/v1/emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          from_address: formattedSender,
          to_address: to,
          subject: subject,
          text_body: finalPreheader || plainText,
          html_body: brandedHtml,
          folder: 'sent',
          is_read: true,
          attachments: attachments ? attachments.map(a => ({ filename: a.filename })) : [],
          created_at: new Date().toISOString()
        })
      });

      return Response.json({ success: true, data: resendData }, { headers: { "Access-Control-Allow-Origin": "*" } });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
    }
  }
};
