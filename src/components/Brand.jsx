import React, { useState } from 'react';
import { initials } from '../lib/format.js';

/* ============================================================
   Agora brand primitives — the same lockup used in the site
   header and inside the Android app: the official logo, the
   lowercase wordmark, and its violet period.
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
 * Official logo with a graceful fallback. The remote PNG is the brand mark
 * everywhere it appears; if Storage is unreachable (or the object is missing)
 * the bundled mark takes over rather than leaving a broken-image icon.
 *
 * Width/height come from the caller's class so the box is reserved up front
 * and the header never shifts while the image loads.
 */
export function AppLogo({ className = 'h-9 w-9', eager = true }) {
  const [src, setSrc] = useState(OFFICIAL_LOGO_URL);

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={`${className} shrink-0 rounded-[0.55rem] object-contain`}
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

/** Official logo + wordmark + the "mail" product chip — reads "Agora Mail". */
export function BrandLockup({ compact = false, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 ${className}`}
      role="img"
      aria-label="Agora Mail"
    >
      <AppLogo className={compact ? 'h-7 w-7' : 'h-9 w-9'} eager={!compact} />
      <span className="inline-flex items-baseline gap-1.5" aria-hidden="true">
        <Wordmark className={compact ? 'text-[1.02rem]' : 'text-[1.28rem]'} />
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
