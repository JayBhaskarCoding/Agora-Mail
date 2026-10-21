import React, { useState } from 'react';
import { initials } from '../lib/format.js';

/* ============================================================
   Agora brand primitives.

   The wordmark reproduces .nav__logo from agora.in.net exactly:
   lowercase Inter 700 at −0.065em, fading to 74% toward the right,
   with a violet-to-blue period and a soft bloom.
   ============================================================ */

/**
 * The official Agora application logo, stored in Supabase Storage.
 * `VITE_LOGO_URL` exists so a deployment can point at a different bucket
 * (or a local file for offline development) without a code change.
 */
export const OFFICIAL_LOGO_URL =
  import.meta.env.VITE_LOGO_URL ||
  'https://sepvcatdqrnzjuvxabzh.supabase.co/storage/v1/object/public/assets/logo.png';

/** Served from this app, used whenever the remote logo cannot be fetched. */
const FALLBACK_LOGO_URL = '/agora-logo.svg';

/**
 * Official logo with a graceful fallback. If Storage is unreachable (or the
 * object is missing) the bundled mark takes over rather than leaving a
 * broken-image icon. The box is sized by the caller so nothing shifts.
 */
export function AppLogo({ className = 'h-[34px] w-[34px]', eager = true }) {
  const [src, setSrc] = useState(OFFICIAL_LOGO_URL);

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={`${className} shrink-0 rounded-[0.5rem] object-contain`}
      draggable="false"
      decoding="async"
      loading={eager ? 'eager' : 'lazy'}
      fetchpriority={eager ? 'high' : 'auto'}
      onError={() => {
        if (src !== FALLBACK_LOGO_URL) setSrc(FALLBACK_LOGO_URL);
      }}
    />
  );
}

export function Wordmark({ className = '' }) {
  return (
    <span className={`brand-lockup ${className}`} role="img" aria-label="Agora">
      <span className="brand-word" aria-hidden="true">
        agora
      </span>
      <span className="brand-dot" aria-hidden="true">
        .
      </span>
    </span>
  );
}

/** Logo + `agora.` + the MAIL chip, i.e. "Agora Mail". */
export function BrandLockup({ compact = false, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 ${className}`}
      role="img"
      aria-label="Agora Mail"
    >
      <AppLogo className={compact ? 'h-[26px] w-[26px]' : 'h-[34px] w-[34px]'} eager={!compact} />
      <span className="inline-flex items-center gap-2" aria-hidden="true">
        <Wordmark className={compact ? 'text-[0.98rem]' : ''} />
        <span className="brand-chip">mail</span>
      </span>
    </span>
  );
}

export function Avatar({ name = '', size = 'md', className = '' }) {
  return (
    <span className={`avatar avatar--${size} ${className}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
