import React, { useEffect, useRef } from 'react';
import {
  AlertCircleIcon,
  FileIcon,
  LockIcon,
  PaperclipIcon,
  SendIcon,
  Spinner,
  XIcon,
} from './Icons.jsx';
import { formatBytes, snippet } from '../lib/format.js';

const MAX_ATTACHMENTS = 10;

export default function ComposeModal({
  replyingTo,
  fromAddress,
  to,
  onToChange,
  subject,
  onSubjectChange,
  body,
  onBodyChange,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  sending,
  error,
  onSend,
  onClose,
}) {
  const toRef = useRef(null);
  const bodyRef = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => {
    if (replyingTo) bodyRef.current?.focus();
    else toRef.current?.focus();
  }, [replyingTo]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !sending) {
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      /* Keep keyboard focus inside the dialog while it is open. */
      const focusable = cardRef.current?.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
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
  }, [onClose, sending]);

  const handleFiles = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length > 0) onAddFiles(files, MAX_ATTACHMENTS);
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        ref={cardRef}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compose-title"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line/10 px-5 pb-4 pt-5 sm:px-6">
          <div>
            <p className="micro">{replyingTo ? 'Reply' : 'Compose'}</p>
            <h2 id="compose-title" className="mt-1 text-lg font-semibold tracking-tight text-ink">
              {replyingTo ? 'Reply to message' : 'New message'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-btn -mr-1"
            aria-label="Close composer"
            disabled={sending}
          >
            <XIcon size={18} />
          </button>
        </header>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSend}>
          <div className="scroll-area min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="field-label" htmlFor="compose-from">
                  From
                </label>
                <div className="relative">
                  <LockIcon
                    size={14}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
                  />
                  <input
                    id="compose-from"
                    type="text"
                    value={fromAddress}
                    disabled
                    readOnly
                    className="field-control pl-9"
                  />
                </div>
              </div>

              <div>
                <label className="field-label" htmlFor="compose-to">
                  To
                </label>
                <input
                  id="compose-to"
                  ref={toRef}
                  type="text"
                  required
                  value={to}
                  onChange={(event) => onToChange(event.target.value)}
                  placeholder="recipient@example.com"
                  autoComplete="off"
                  spellCheck="false"
                  className="field-control"
                />
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="compose-subject">
                Subject
              </label>
              <input
                id="compose-subject"
                type="text"
                value={subject}
                onChange={(event) => onSubjectChange(event.target.value)}
                placeholder="Subject line"
                className="field-control"
              />
            </div>

            {replyingTo && (
              <div className="flex items-start gap-3 rounded-r-xl border-l-2 border-brand bg-surface-2 px-3.5 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-ink">
                    Replying to {replyingTo.from_address}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                    {snippet(replyingTo.text_body, 180)}
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="field-label" htmlFor="compose-body">
                Message
              </label>
              <textarea
                id="compose-body"
                ref={bodyRef}
                rows={8}
                value={body}
                onChange={(event) => onBodyChange(event.target.value)}
                placeholder={replyingTo ? 'Write your reply…' : 'Write your message…'}
                className="field-control field-control--area"
              />
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="field-label mb-0">Attachments</span>
                <span className="text-[0.68rem] text-faint">
                  Up to {MAX_ATTACHMENTS} files · 25 MB each
                </span>
              </div>

              <input
                id="compose-files"
                type="file"
                multiple
                onChange={handleFiles}
                className="sr-only"
              />
              <label htmlFor="compose-files" className="btn btn--ghost btn--sm mt-2 cursor-pointer">
                <PaperclipIcon size={14} />
                Attach files
              </label>

              {attachments.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {attachments.map((attachment, index) => (
                    <li
                      key={`${attachment.filename}-${index}`}
                      className="attachment-chip pr-1.5"
                      title={attachment.filename}
                    >
                      <FileIcon size={14} />
                      <span className="max-w-[13rem] truncate">{attachment.filename}</span>
                      {attachment.size ? (
                        <span className="text-[0.65rem] text-faint">
                          {formatBytes(attachment.size)}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onRemoveAttachment(index)}
                        className="icon-btn !h-6 !w-6"
                        aria-label={`Remove ${attachment.filename}`}
                      >
                        <XIcon size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error && (
              <div className="alert alert--danger" role="alert">
                <AlertCircleIcon size={16} className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line/10 px-5 py-4 sm:px-6">
            <p className="micro hidden sm:block">Sent from {fromAddress}</p>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn btn--ghost"
                disabled={sending}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn--brand" disabled={sending}>
                {sending ? (
                  <>
                    <Spinner size={15} />
                    Sending…
                  </>
                ) : (
                  <>
                    <SendIcon size={15} />
                    Send message
                  </>
                )}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
