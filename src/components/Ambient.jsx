import React from 'react';

/* ============================================================
   Ambient light behind the glass: three slow aurora washes and a
   dot matrix, the same idea as the orbs on agora.in.net. Purely
   decorative and never interactive.
   ============================================================ */

export default function Ambient() {
  return (
    <div className="app-ambient" aria-hidden="true">
      <span className="app-ambient__orb app-ambient__orb--violet" />
      <span className="app-ambient__orb app-ambient__orb--blue" />
      <span className="app-ambient__orb app-ambient__orb--rose" />
      <span className="app-ambient__grid" />
    </div>
  );
}
