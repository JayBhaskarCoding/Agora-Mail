# Agora Mail

The webmail for **@agora.in.net** — sign in, read, reply and send. Built with React + Vite
and a Supabase backend (PostgREST for the mailbox, Supabase Auth for sessions) plus a
Resend-backed worker for outbound mail.

It shares the Agora design system with [agora.in.net](https://agora.in.net) and the
Android app: obsidian surfaces, hairline edges, the violet → blue brand gradient, the
`agora.` lockup and Inter + JetBrains Mono. Both the dark and the light
(`prefers-color-scheme`) themes are supported and measured for WCAG AA contrast.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static bundle in dist/
```

Configuration is read from Vite env vars at build time:

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL (`https://<ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key — safe to ship in a browser bundle |
| `VITE_MAIL_SENDER_URL` | Optional override for the outbound-mail worker |
| `VITE_LOGO_URL` | Optional override for the official logo (defaults to the Supabase Storage object) |

Without the two Supabase values the sign-in screen explains what is missing and disables
the form instead of failing silently.

## Design system

`src/index.css` is the single source of truth. Colour channels are declared once per
theme and every surface, hairline and glow composes them with `rgb(var(--x-rgb) / a)`;
`tailwind.config.js` bridges the same channels to Tailwind utilities (`text-ink`,
`bg-surface`, `border-line/10`, `text-brand-lav`, …). Components keep semantic class
hooks (`.btn--brand`, `.field-control`, `.mail-row`, `.panel`) so the look can change
without touching markup.

- **Surfaces**: canvas `#0A0B0E`, surfaces `#13141D` / `#191B27`, hairlines at 8–16% white.
- **Brand**: violet `#8B5CF6` → blue `#60A5FA`; primary buttons are gradient pills with
  dark plum ink in the dark theme and white ink on the deepened light gradient.
- **Type**: Inter for UI, JetBrains Mono for uppercase micro labels and timestamps.
- **Motion**: short eased transitions only, fully disabled under `prefers-reduced-motion`.
- **Assets**: the official application logo is loaded from Supabase Storage
  (`…/storage/v1/object/public/assets/logo.png`) and shown beside the `agora.` wordmark and
  the `MAIL` chip in the sidebar, the mobile header and the sign-in card. `public/agora-logo.svg`
  is bundled as an automatic fallback if Storage is unreachable, so a storage hiccup never
  leaves a broken image. Fonts are self-hosted through `@fontsource`, so the only third-party
  request the UI makes is the logo itself.
- **Sign-in**: one centred card — lockup, service name and domain, form, then the
  provisioning note with the access request ("Need access?" opens a Gmail compose window
  to `mail@agora.in.net`, so no desktop mail client is required).

## Structure

```
src/
  App.jsx               session, mailbox state, Supabase + sender calls
  components/
    LoginScreen.jsx     sign-in portal
    Sidebar.jsx         brand lockup, folders, account card
    EmailList.jsx       search, rows, empty and loading states
    MailReader.jsx      message view, reply/trash/restore actions
    ComposeModal.jsx    composer with attachments and focus trap
    Toasts.jsx          transient confirmations
    Brand.jsx           wordmark, logo mark, avatars
    Icons.jsx           stroke icon set
  lib/format.js         addresses, dates, snippets, escaping
  lib/emailTheme.js     re-tones inbound HTML for the dark reading card
  lib/mailTemplate.js   message fragment + text twin for the sender worker
worker/
  agora-mail-sender.js  Cloudflare Worker: wraps the fragment, sends via Resend
test/
  deployed-worker.mjs   the worker as deployed, verbatim fixture
  *.test.mjs            contract + colour tests, `npm test`
```

## Behaviour notes

- Every mailbox action is optimistic: read state flips immediately, moves and deletions
  leave the list at once, and failures surface as a toast instead of an `alert()`.
- A 401 from PostgREST clears the stored session and returns the visitor to sign-in with
  an explanation.
- The composer escapes typed text before it becomes outgoing HTML, caps attachments at
  10 files / 25 MB each, and closes on `Escape` with focus trapped inside the dialog.
- **Inbox preview text.** The composer takes an optional snippet under the subject. It is
  sent to the worker as `previewText` and, when filled, written into the message as a
  hidden preheader; left blank, the field is omitted so clients fall back to the opening
  of the message rather than to duplicated wrapper copy. It resets on cancel and on send.
- **Reply quotes** carry `data-reply-quote="true"` on the wrapper, so the worker can drop
  the old thread when it builds the inbox snippet — a reply previews the reply.
- **The reading surface is dark.** A message renders on the app's own card — `#121216`
  with a `#27272a` hairline, `#f4f4f5` ink — rather than on white paper, so the reader
  looks like the rest of Agora. Mail is authored for white, though, so `lib/emailTheme.js`
  transcodes it on the way in: after sanitising, dark text is lifted, light panels are
  darkened, pale hairlines are raised, `bgcolor` and `<font color>` are rewritten the same
  way. The lift is contrast-aware (anything already legible on the card is left exactly as
  written — our own messages ship their own palette) and monotonic, so a newsletter's
  body/secondary/footnote hierarchy survives the flip instead of collapsing to one white.
  Images, gradients and background images are never touched. 16 unit tests pin the
  behaviour, including AA contrast for every text colour a realistic newsletter produces.
- **Two workers, one contract.** `test/deployed-worker.mjs` is the sender worker exactly as
  it runs on Cloudflare; `test/mail-pipeline.test.mjs` (`npm test`) drives both it and the
  in-repo worker with the real fragment and asserts on what Resend would send. The frontend
  is verified against the *deployed* worker, so interface work never depends on a deploy;
  `worker/agora-mail-sender.js` is an optional upgrade that additionally honours the
  client's `text` part, escapes the preview text, and stores the body in the Sent row
  instead of the preview line.
- **Who owns what.** `lib/mailTemplate.js` renders only the message fragment — paragraphs
  and, for a reply, the quoted original — styled for the dark card it will sit in. The
  Cloudflare worker (`worker/agora-mail-sender.js`, deployed separately) owns the envelope:
  the 600px dark Agora card, the gradient edge, the logo and `agora.` wordmark, the footer
  and the hidden preheader. The client therefore sends a fragment, not a document; sending
  a whole document previously meant a white card nested inside the dark one, duplicate
  `<head>`/`<body>` tags, and the client's `mso` stylesheet leaking into the plain-text part.
- **The worker** also honours the client's `text` part (deriving one properly when absent,
  with no CSS, comments or hidden preheaders), builds the preheader from the body *before*
  `data-reply-quote` with the subject de-duplicated and entities decoded, escapes the
  preview text, and stores the real body in the Sent row rather than the preview line.
  `npm test` runs that handler against a fake Resend and Supabase: transport, shell
  structure, plain text, preheader, replies, attachments and failure paths.
- Replies quote the original with scripts and inline handlers stripped, attributed by
  display name ("On 20 Oct, Ananya Rao wrote:") rather than by raw mailbox.
- The mailbox polls every 10 seconds; the refresh button forces a pass.
