import React from 'react';
import { Avatar, Wordmark } from './Brand.jsx';
import {
  ArrowLeftIcon,
  MailIcon,
  PaperclipIcon,
  PencilIcon,
  ReplyIcon,
  RestoreIcon,
  TrashIcon,
} from './Icons.jsx';
import { formatFullTime, parseAddress } from '../lib/format.js';

function ReaderEmpty({ onCompose }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <div className="relative flex flex-col items-center">
        <span
          className="pointer-events-none absolute -inset-x-16 -inset-y-10 -z-10 rounded-full bg-brand/10 blur-3xl"
          aria-hidden="true"
        />
        <Wordmark className="text-[2.6rem]" />
      </div>
      <p className="micro mt-5">Agora Mail</p>
      <h2 className="mt-2 text-base font-semibold text-ink">Select a message</h2>
      <p className="mt-1 max-w-[17rem] text-sm leading-relaxed text-muted">
        Pick a message from the list to read it here — or start a new one.
      </p>
      <button type="button" onClick={onCompose} className="btn btn--ghost btn--sm mt-6">
        <PencilIcon size={14} />
        Compose message
      </button>
      <span className="brand-rule mt-8" aria-hidden="true" />
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
  if (!email) return <ReaderEmpty onCompose={onCompose} />;

  const from = parseAddress(email.from_address);
  const to = parseAddress(email.to_address);
  const attachments = Array.isArray(email.attachments) ? email.attachments : [];
  const inTrash = folder === 'trash';

  return (
    <div key={email.id} className="scroll-area h-full w-full animate-fade-in overflow-y-auto">
      <article className="mx-auto w-full max-w-3xl px-5 pb-12 pt-4 sm:px-8 md:pt-8">
        <div className="flex items-center gap-2 md:hidden">
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

        <p className="micro mt-4 hidden md:block">
          {label} · {formatFullTime(email.created_at)}
        </p>

        <h1 className="mail-subject mt-2.5">{email.subject || '(No subject)'}</h1>

        <div className="mail-meta panel panel--flat mt-5">
          <Avatar name={from.display} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-[0.9rem] font-semibold text-ink">{from.display}</p>
            {from.name && from.address && (
              <p className="truncate text-xs text-muted">{from.address}</p>
            )}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {inTrash ? (
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
                  Delete forever
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
                  className="btn btn--danger btn--sm"
                  disabled={busy}
                  title="Move to trash"
                >
                  <TrashIcon size={14} />
                  Trash
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted">
          <span className="min-w-0 truncate">
            To <span className="text-ink">{to.name || to.address}</span>
            {to.name && to.address && (
              <span className="text-faint"> · {to.address}</span>
            )}
          </span>
          <time className="text-faint" dateTime={email.created_at}>
            {formatFullTime(email.created_at)}
          </time>
        </div>

        <div className="panel mt-6 p-5 md:p-7">
          {email.html_body ? (
            <div className="mail-html" dangerouslySetInnerHTML={{ __html: email.html_body }} />
          ) : (
            <p className="mail-html whitespace-pre-wrap">
              {email.text_body || 'This message has no body.'}
            </p>
          )}
        </div>

        {attachments.length > 0 && (
          <section className="mt-6" aria-labelledby="attachments-title">
            <h2 id="attachments-title" className="micro">
              Attachments · {attachments.length}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
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

        <footer className="mt-10 flex items-center gap-2.5 border-t border-line/10 pt-5 text-faint">
          <MailIcon size={14} />
          <p className="micro">Agora Mail · @agora.in.net</p>
        </footer>
      </article>
    </div>
  );
}
