import React, { useState } from 'react';
import { AppLogo, Wordmark } from './Brand.jsx';
import { AlertCircleIcon, EyeIcon, EyeOffIcon, MailIcon, Spinner } from './Icons.jsx';

/* ============================================================
   Sign-in portal — one centred card, no marketing column.
   Brand lockup, a plain description of what Agora Mail is,
   the form, then who provisions accounts and how to ask.
   ============================================================ */

const CONTACT_ADDRESS = 'mail@agora.in.net';
/* Any @agora.in.net address is a mailbox on this service, so the product line
   names the domain it handles rather than repeating one account. */
const SERVICE_DOMAIN = '@agora.in.net';

/* Gmail's web composer. Unlike a mailto: link it still works for
   visitors who have no desktop mail app configured. */
const CONTACT_LINK =
  'https://mail.google.com/mail/?view=cm&fs=1' +
  `&to=${encodeURIComponent(CONTACT_ADDRESS)}` +
  `&su=${encodeURIComponent('Agora Mail access')}`;

export default function LoginScreen({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  error,
  submitting,
  configured,
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="login-screen relative flex flex-col">
      {/* Orbit rings echoing the website hero, behind the glass card. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <span className="login-orbit left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2" />
        <span className="login-orbit left-1/2 top-1/2 h-[48rem] w-[48rem] -translate-x-1/2 -translate-y-1/2 opacity-60" />
      </div>

      <main className="relative z-10 flex w-full flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-[25rem] animate-rise-in">
          <header className="flex flex-col items-center text-center">
            <AppLogo className="h-12 w-12" />
            <div className="mt-4 flex items-baseline gap-1.5">
              <Wordmark className="text-[2.05rem]" />
              <span className="brand-chip">mail</span>
            </div>

            <h1 className="mt-5 text-lg font-semibold tracking-tight text-ink">
              Agora Mail Service
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              For <span className="font-medium text-ink">{SERVICE_DOMAIN}</span> addresses — sign
              in to read, reply and send.
            </p>
          </header>

          <section className="glass--strong glass-sheen login-card mt-7 p-6 sm:p-7" aria-labelledby="login-title">
            <h2 id="login-title" className="text-[0.95rem] font-semibold text-ink">
              Sign in
            </h2>

            {!configured && (
              <div className="alert alert--info mt-4" role="status">
                <AlertCircleIcon size={16} className="mt-0.5 shrink-0" />
                <p>
                  This deployment is missing its Supabase credentials. Set{' '}
                  <code className="font-mono text-[0.72rem] text-ink">VITE_SUPABASE_URL</code> and{' '}
                  <code className="font-mono text-[0.72rem] text-ink">VITE_SUPABASE_ANON_KEY</code>{' '}
                  to connect the mailbox.
                </p>
              </div>
            )}

            {error && (
              <div className="alert alert--danger mt-4" role="alert" id="login-error">
                <AlertCircleIcon size={16} className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <form className="mt-4 space-y-4" onSubmit={onSubmit}>
              <div>
                <label className="field-label" htmlFor="login-email">
                  Email address
                </label>
                <div className="relative">
                  <MailIcon
                    size={16}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
                  />
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    inputMode="email"
                    spellCheck="false"
                    value={email}
                    onChange={(event) => onEmailChange(event.target.value)}
                    placeholder="you@agora.in.net"
                    className="field-control pl-10"
                    aria-describedby={error ? 'login-error' : undefined}
                  />
                </div>
              </div>

              <div>
                <label className="field-label" htmlFor="login-password">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => onPasswordChange(event.target.value)}
                    placeholder="••••••••"
                    className="field-control pr-11"
                    aria-describedby={error ? 'login-error' : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="icon-btn absolute right-1 top-1/2 !h-8 !w-8 -translate-y-1/2"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn btn--brand w-full py-3 text-[0.9rem]"
                disabled={submitting || !configured}
              >
                {submitting ? (
                  <>
                    <Spinner size={16} />
                    Signing in…
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>

            <div className="mt-5 border-t border-line/10 pt-4 text-center">
              <p className="text-xs leading-relaxed text-muted">
                Accounts are provisioned by Agora.{' '}
                <a
                  href={CONTACT_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-link font-medium"
                >
                  Need access?
                </a>
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
