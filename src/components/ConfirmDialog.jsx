import React, { useEffect, useRef } from 'react';
import { Spinner, TrashIcon, XIcon } from './Icons.jsx';

/**
 * A destructive confirmation, in the same glass card as the composer.
 *
 * The app uses its own dialog rather than `window.confirm` for two reasons:
 * native dialogs are blocked inside sandboxed preview frames (so the button
 * would appear to do nothing), and they cannot carry the rest of the
 * interface's typography and focus handling. `title` is the question the
 * action is asking; the confirm button names what will happen.
 */
export default function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}) {
  const cardRef = useRef(null);
  const cancelRef = useRef(null);

  /* Focus starts on the safe choice, and returns where it was on close. */
  useEffect(() => {
    const previous = document.activeElement;
    cancelRef.current?.focus();
    return () => {
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== 'Tab') return;

      /* Keep the keyboard inside the question while it is open. */
      const focusable = cardRef.current?.querySelectorAll(
        'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !cardRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !cardRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, onCancel]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={cardRef}
        className="modal-card modal-card--confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={description ? 'confirm-description' : undefined}
      >
        <div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
          <div className="flex items-start justify-between gap-4">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-danger/25 bg-danger/10 text-danger"
              aria-hidden="true"
            >
              <TrashIcon size={19} />
            </span>
            <button
              type="button"
              onClick={onCancel}
              className="icon-btn -mr-1 -mt-1"
              aria-label="Close dialog"
              disabled={busy}
            >
              <XIcon size={17} />
            </button>
          </div>

          <h2 id="confirm-title" className="mt-4 text-lg font-semibold tracking-tight text-ink">
            {title}
          </h2>
          {description && (
            <p
              id="confirm-description"
              className="mt-2 text-[0.82rem] leading-relaxed text-muted"
            >
              {description}
            </p>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              ref={cancelRef}
              type="button"
              onClick={onCancel}
              className="btn btn--ghost btn--sm justify-center"
              disabled={busy}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="btn btn--danger btn--sm justify-center"
              disabled={busy}
            >
              {busy ? <Spinner size={14} /> : <TrashIcon size={14} />}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
