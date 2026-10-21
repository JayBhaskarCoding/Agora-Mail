import React, { useState } from 'react';
import { LogoMark, Wordmark } from './Brand.jsx';
import {
  AlertCircleIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MailIcon,
  Spinner,
} from './Icons.jsx';

/* ============================================================
   Sign-in portal. Same voice and surfaces as agora.in.net:
   eyebrow + display headline on the left, a lit glass card on
   the right, and the agora. lockup above the form.
   ============================================================ */

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
  const year = new Date().getFullYear();

  return (
    <div className="login-screen relative flex flex-col">
      <div className="dot-grid" aria-hidden="true" />

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-5 py-12 sm:px-8 lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:py-16">
        {/* ---------- Brand narrative (desktop only) ---------- */}
        <section className="animate-rise-in hidden lg:block">
          <p className="eyebrow">
            <span className="eyebrow__dot" aria-hidden="true" />
            Agora Mail · @agora.in.net
          </p>

          <h1 className="display mt-6">
            Your mail,
            <br />
            <span className="accent">with room</span>
            <br />
            to think.
          </h1>

          <p className="mt-6 max-w-md text-[1.02rem] leading-relaxed text-muted">
            The ad-free inbox for the Agora community. No algorithms, no attention
            market — just correspondence, in order, with the people who matter.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2.5">
            {['Zero ads', 'No tracking', 'Human support'].map((item) => (
              <span key={item} className="inline-flex items-center gap-2 text-xs text-muted">
                <span className="h-1 w-1 rounded-full bg-brand" aria-hidden="true" />
                {item}
              </span>
            ))}
          </div>

          <span className="brand-rule mt-10" aria-hidden="true" />
        </section>

        {/* ---------- Sign-in card ---------- */}
        <section
          className="panel login-card animate-rise-in w-full max-w-md p-6 sm:p-8 lg:mx-0 lg:max-w-none lg:p-9"
          aria-labelledby="login-title"
        >
          <div className="flex flex-col items-center text-center">
            <LogoMark className="h-12 w-12" />
            <Wordmark className="mt-4 text-[2.15rem]" />
            <h2 id="login-title" className="mt-3 text-[0.95rem] font-semibold text-ink">
              Sign in to your mailbox
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Use your <span className="text-ink">@agora.in.net</span> account.
            </p>
          </div>

          {!configured && (
            <div className="alert alert--info mt-6" role="status">
              <AlertCircleIcon size={16} className="mt-0.5 shrink-0" />
              <p>
                This deployment is missing its Supabase credentials. Set{' '}
                <code className="font-mono text-[0.72rem] text-ink">VITE_SUPABASE_URL</code> and{' '}
                <code className="font-mono text-[0.72rem] text-ink">VITE_SUPABASE_ANON_KEY</code> to
                connect the mailbox.
              </p>
            </div>
          )}

          {error && (
            <div className="alert alert--danger mt-6" role="alert" id="login-error">
              <AlertCircleIcon size={16} className="mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
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
              <div className="flex items-baseline justify-between gap-3">
                <label className="field-label" htmlFor="login-password">
                  Password
                </label>
                <span className="mb-1.5 inline-flex items-center gap-1 text-[0.65rem] text-faint">
                  <LockIcon size={11} />
                  Encrypted in transit
                </span>
              </div>
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

          <div className="mt-6 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-line/10" />
            <span className="micro">Agora Mail</span>
            <span className="h-px flex-1 bg-line/10" />
          </div>

          <p className="mt-5 text-center text-xs leading-relaxed text-faint">
            Accounts are provisioned by Agora. Need access?{' '}
            <a className="text-link" href="mailto:mail@agora.in.net">
              mail@agora.in.net
            </a>
          </p>
        </section>
      </main>

      <footer className="relative z-10 mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 pb-6 text-[0.7rem] text-faint sm:px-8">
        <p>© {year} Agora — a human-first public square.</p>
        <div className="flex items-center gap-4">
          <a className="text-link" href="https://agora.in.net">
            agora.in.net
          </a>
          <a className="text-link" href="mailto:mail@agora.in.net">
            Contact
          </a>
        </div>
      </footer>
    </div>
  );
}
