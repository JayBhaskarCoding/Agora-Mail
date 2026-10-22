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
    EmailList.jsx       search, conversation rows, empty and loading states
    MailReader.jsx      conversation stack, inline reply, message actions
    ComposeModal.jsx    composer with attachments and focus trap
    ConfirmDialog.jsx   glass confirmation for destructive actions
    Toasts.jsx          transient confirmations
    Brand.jsx           wordmark, logo mark, avatars
    Icons.jsx           stroke icon set
  lib/format.js         addresses, dates, snippets, escaping
  lib/emailTheme.js     re-tones inbound HTML for the dark reading card
  lib/teaser.js         writes the inbox teaser (preheader) from a message
  lib/threads.js        conversation grouping, quote stripping, row previews
  lib/mailTemplate.js   message fragment + text twin for the sender worker
worker/
  agora-mail-sender.js  Cloudflare Worker: wraps the fragment, sends via Resend
test/
  deployed-worker.mjs   the worker as deployed, verbatim fixture
  *.test.mjs            contract, colour and conversation tests, `npm test`
```

## Behaviour notes

- **Conversations, not messages.** Rows are grouped by normalised subject — `Re:`,
  `Fwd:` and extra whitespace removed — and shown as one row with a violet `(5)` pill and
  a stacked-layers icon when the thread holds more than one message. Messages with no
  subject are never merged.
- **One pool, both sides.** Inbox and Sent load together with
  `folder=in.(inbox,sent)`, so a conversation is the complete dialogue: what arrived and
  what you sent, interleaved by `created_at` ascending. The list shows a conversation in
  each folder it touches — the same thread can appear in both — while the reader always
  gets every message. Each conversation is ordered oldest first and sorts by its newest
  message; opening it marks every unread message in it as read, as Gmail does, and
  switching between Inbox and Sent keeps the loaded rows on screen.
- **Ours and theirs.** Messages are classified as outgoing by folder or by sender
  (`mail@agora.in.net`, or the signed-in mailbox). Outgoing cards are ruled
  `border-purple-500/30`, name the author as *You* with a violet *Sent by you* tag, and
  summarise as *Sent · To Meera…* when collapsed; incoming cards keep the sender's name
  and avatar and carry a quiet *Received* tag. Everyone else in the thread is listed in
  the header, deduplicated by address, never including your own mailboxes.
- **Sent rows name a person.** `Name <email@domain>` shows `To: Name` with the address
  in smaller muted type beside it; a bare address shows the handle before the `@`
  (`To: jayvardhanbhaskar123`) and the full address in the tooltip. The name, address and
  timestamp all truncate independently, so nothing collides as the pane narrows.
- **The reader is a stack.** The newest message is open on the dark card; older ones are
  summary bars with sender, snippet and time that expand in place. A conversation offers
  *Expand all* / *Collapse all*, and each open message keeps its own Rendered / Plain-text
  toggle.
- **Only the new message is shown.** Every card goes through one cleaner,
  `stripReplyQuotes()` in `lib/threads.js`, which detects HTML or plain text and removes
  what the client dragged along:
  - the sender worker's envelope (its `<!-- Main Message Body -->` marker) and hidden
    preheaders, before anything else runs;
  - `<div data-reply-quote="true">` and everything after it;
  - Gmail's `div.gmail_quote`, Outlook's `divRplyFwdMsg` / `appendonsend`, Yahoo's
    `div#yahoo_quoted_*`, and nested `<blockquote>`s (innermost first, so no empty shells
    are left);
  - `--- Original Message ---` rules;
  - `On … wrote:` attributions in any of the shapes mail clients write them — a date is
    required when the attribution appears mid-message, so ordinary prose ("On that note,
    I wrote…") is never mistaken for one; a line *ending* in `wrote:` is always cut.

  Plain-text bodies lose the same things plus `>`-quoted runs and pasted
  `From:/Sent:/Date:/To:` headers. A message that *is* only a quote renders no body rather
  than a fragment, and list rows draw their preview from the same cleaned text.
- **Outgoing mail carries no quoted history.** `buildMessageBody` / `buildMessageText`
  append the original only when asked (`includeHistory: true`, kept for self-contained
  copies); the composer and the inline reply never ask, so what leaves the worker is just
  the message the sender typed. Agora shows the thread as stacked cards, and each
  recipient's client threads it on its own — embedding the original is what used to
  produce a quote banner inside a quote card.
- **Replying stays in context.** Each conversation ends with an inline reply box that
  names the recipient and the `Re:` subject it will send, and posts through the same
  `sendMessage` path as the composer — same envelope, text part, teaser and worker.
- **List previews** draw once from the text part (falling back to the HTML), drop the
  subject when the body opens by repeating it, and cut at 65 characters, so a row never
  shows the same line twice.
- **Trash works at the conversation level.** The reader header carries *Move thread to
  trash* beside *Reply*. It patches every message of the open conversation — both sides
  of the dialogue, because Inbox and Sent are one pool — then closes the reader and
  refreshes the list, so the thread leaves either folder in one decision. In Trash the
  list header grows a strip with the number of conversations kept there and an *Empty
  Trash* button; it asks *Permanently delete all messages in Trash?* in a glass
  confirmation (a card, not `window.confirm`, which sandboxed frames suppress), then
  issues one `DELETE /rest/v1/emails?folder=eq.trash` — RLS scopes `emails` to the
  signed-in mailbox — and clears the list and the selected conversation. The button
  disables itself once Trash is empty.
- Every mailbox action is optimistic: read state flips immediately, and moving or
  deleting a single message leaves the list at once; failures surface as a toast instead
  of an `alert()`.
- A 401 from PostgREST clears the stored session and returns the visitor to sign-in with
  an explanation.
- The composer escapes typed text before it becomes outgoing HTML, caps attachments at
  10 files / 25 MB each, and closes on `Escape` with focus trapped inside the dialog.
- **Inbox teaser, written automatically.** There is no preview field to fill in. On send,
  `lib/teaser.js` writes the line clients show beside the subject and passes it to the
  worker as `previewText`: a later sentence of the message when there is one, otherwise a
  short description built from the subject and the shape of the message ("A short note
  about Q3 deck", "Reply regarding Review timing · 2 attachments"). The rule is that the
  teaser never opens with the words the body opens with — otherwise Gmail fills its line
  with the preheader and then the same words again, which is the "Do you see this content…
  Do you see this content…" stutter. Teasers are capped at 90 characters, cut on a word
  boundary, and the Sent row previews the same line.
- **Reply quotes** carry `data-reply-quote="true"` on the wrapper, so the worker can drop
  the old thread when it builds the inbox snippet — a reply previews the reply. The quote
  is ruled in violet (`#a855f7`) and set in the card's muted grey (`#a1a1aa`), while the
  message itself is `#f4f4f5` — the ink of the worker's `#121216` card, so nothing lands
  as black-on-black.
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
