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
  lib/mailTemplate.js   branded HTML document for every outgoing message
```

## Behaviour notes

- Every mailbox action is optimistic: read state flips immediately, moves and deletions
  leave the list at once, and failures surface as a toast instead of an `alert()`.
- A 401 from PostgREST clears the stored session and returns the visitor to sign-in with
  an explanation.
- The composer escapes typed text before it becomes outgoing HTML, caps attachments at
  10 files / 25 MB each, and closes on `Escape` with focus trapped inside the dialog.
- Outgoing mail uses the shared `lib/mailTemplate.js` document — the same `agora.` lockup
  and palette as the app and agora.in.net, built from tables and inline styles so it
  survives Gmail, Apple Mail and Outlook. Replies quote the original with embedded scripts
  and inline event handlers stripped.
- The mailbox polls every 10 seconds; the refresh button forces a pass.
