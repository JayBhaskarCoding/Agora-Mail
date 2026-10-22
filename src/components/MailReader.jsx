import React, { useEffect, useMemo, useState } from 'react';
import { Avatar, Wordmark } from './Brand.jsx';
import {
  ArrowLeftIcon,
  PaperclipIcon,
  PencilIcon,
  ReplyIcon,
  RestoreIcon,
  TrashIcon,
} from './Icons.jsx';
import {
  cleanSubject,
  formatFullTime,
  parseAddress,
  plainBody,
  sanitizeEmailHtml,
} from '../lib/format.js';
import { themeEmailHtml } from '../lib/emailTheme.js';

function ReaderEmpty({ onCompose }) {
  return (
    <div className="flex h-full w-full items-center justify-center px-6 py-16">
      <div className="glass glass-sheen w-full max-w-sm rounded-[1.6rem] px-7 py-9 text-center">
        <div className="flex justify-center">
          <Wordmark className="text-[2.1rem]" />
        </div>
        <p className="micro mt-4">Agora Mail</p>
        <h2 className="mt-2 text-base font-semibold text-ink">Select a message</h2>
        <p className="mx-auto mt-1.5 max-w-[16rem] text-sm leading-relaxed text-muted">
          Pick a message from the list to read it here — or start a new one.
        </p>
        <button type="button" onClick={onCompose} className="btn btn--ghost btn--sm mt-6">
          <PencilIcon size={14} />
          Compose message
        </button>
      </div>
    </div>
  );
}

export default function MailReader({
  email,
  folder,
  label,
  busy,
  onReply,
  onTrash,
  onRestore,
  onDeleteForever,
  onBack,
  onCompose,
}) {
  const [view, setView] = useState('rendered');

  /* Every message opens rendered; the plain-text toggle is per message. */
  useEffect(() => {
    setView('rendered');
  }, [email?.id]);

  /* Sanitise, then transcode for the dark card. Mail is authored for white
     paper, so its near-black text and white panels have to be re-toned or it
     lands unreadable on #121216. */
  const safeHtml = useMemo(
    () => (email?.html_body ? themeEmailHtml(sanitizeEmailHtml(email.html_body)) : ''),
    [email?.html_body],
  );

  const text = useMemo(
    () => (email ? plainBody({ text: email.text_body, html: email.html_body }) : ''),
    [email],
  );

  if (!email) return <ReaderEmpty onCompose={onCompose} />;

  const from = parseAddress(email.from_address);
  const to = parseAddress(email.to_address);
  const attachments = Array.isArray(email.attachments) ? email.attachments : [];
  const inTrash = folder === 'trash';
  const hasHtml = Boolean(safeHtml);

  const actions = inTrash ? (
    <>
      <button
        type="button"
        onClick={() => onRestore(email)}
        className="btn btn--positive btn--sm"
        disabled={busy}
      >
        <RestoreIcon size={14} />
        Restore
      </button>
      <button
        type="button"
        onClick={() => onDeleteForever(email)}
        className="btn btn--danger btn--sm"
        disabled={busy}
      >
        <TrashIcon size={14} />
        Delete
      </button>
    </>
  ) : (
    <>
      <button
        type="button"
        onClick={() => onReply(email)}
        className="btn btn--brand btn--sm"
        disabled={busy}
      >
        <ReplyIcon size={14} />
        Reply
      </button>
      <button
        type="button"
        onClick={() => onTrash(email)}
        className="icon-btn"
        disabled={busy}
        aria-label="Move to trash"
        title="Move to trash"
      >
        <TrashIcon size={16} />
      </button>
    </>
  );

  return (
    <div key={email.id} className="reader scroll-area animate-fade-in">
      <div className="reader__body">
        <div className="mb-3 flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={onBack}
            className="icon-btn -ml-2"
            aria-label="Back to message list"
          >
            <ArrowLeftIcon size={19} />
          </button>
          <span className="micro">{label}</span>
        </div>

        <header className="reader-head glass glass--strong glass-sheen">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="micro">
                {label} · {formatFullTime(email.created_at)}
              </p>
              <h1 className="mail-subject mt-2">{cleanSubject(email.subject) || '(No subject)'}</h1>
            </div>
            <div className="hidden shrink-0 items-center gap-2 sm:flex">{actions}</div>
          </div>

          <div className="mail-byline">
            <Avatar name={from.display} size="md" />
            <div className="min-w-0">
              <p className="truncate text-[0.85rem] font-semibold text-ink">{from.display}</p>
              {from.name && from.address && (
                <p className="truncate text-[0.7rem] text-muted">{from.address}</p>
              )}
            </div>
            <span className="ml-auto hidden max-w-[45%] truncate text-[0.7rem] text-faint sm:inline">
              to {to.name || to.address}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2 sm:hidden">{actions}</div>
        </header>

        <div className="mt-4 flex items-center justify-between gap-3">
          {hasHtml ? (
            <div className="segmented" role="group" aria-label="Message view">
              <button
                type="button"
                onClick={() => setView('rendered')}
                aria-pressed={view === 'rendered'}
                className={`segmented__option ${view === 'rendered' ? 'is-active' : ''}`}
              >
                Rendered
              </button>
              <button
                type="button"
                onClick={() => setView('text')}
                aria-pressed={view === 'text'}
                className={`segmented__option ${view === 'text' ? 'is-active' : ''}`}
              >
                Plain text
              </button>
            </div>
          ) : (
            <span className="micro">Plain text</span>
          )}

          {attachments.length > 0 && (
            <span className="micro flex items-center gap-1.5">
              <PaperclipIcon size={12} />
              {attachments.length} {attachments.length === 1 ? 'file' : 'files'}
            </span>
          )}
        </div>

        {/* The message sits on the app's own dark surface, so what you read
            here matches what the sender sees. */}
        <div className="mail-paper mt-3 overflow-hidden rounded-2xl border border-[#27272a] bg-[#121216] p-6 text-[#f4f4f5]">
          <span className="mail-paper__sheen" aria-hidden="true" />
          {view === 'rendered' && hasHtml ? (
            <div className="mail-html" dangerouslySetInnerHTML={{ __html: safeHtml }} />
          ) : (
            <p className="mail-text">{text || 'This message has no body.'}</p>
          )}
        </div>

        {attachments.length > 0 && (
          <section className="mt-5" aria-labelledby="attachments-title">
            <h2 id="attachments-title" className="micro">
              Attachments · {attachments.length}
            </h2>
            <ul className="mt-2.5 flex flex-wrap gap-2">
              {attachments.map((attachment, index) => (
                <li
                  key={`${attachment?.filename || 'file'}-${index}`}
                  className="attachment-chip"
                  title={attachment?.filename || 'Attachment'}
                >
                  <PaperclipIcon size={14} />
                  <span className="max-w-[16rem] truncate">
                    {attachment?.filename || 'Attachment'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
