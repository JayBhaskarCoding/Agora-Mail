import React from 'react';
import { initials } from '../lib/format.js';

/* ============================================================
   Agora brand primitives — the same lockup used in the site
   header and inside the Android app: the original mark, the
   lowercase wordmark, and its violet period.
   ============================================================ */

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

export function LogoMark({ className = 'h-9 w-9' }) {
  return (
    <img
      src="/agora-logo.svg"
      alt=""
      aria-hidden="true"
      className={`${className} object-contain`}
      draggable="false"
    />
  );
}

/** Mark + wordmark + the "mail" product chip. */
export function BrandLockup({ compact = false, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className={compact ? 'h-7 w-7' : 'h-9 w-9'} />
      <span className="inline-flex items-baseline gap-1.5">
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
