import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Wordmark } from './Brand.jsx';
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  PaperclipIcon,
  PencilIcon,
  ReplyIcon,
  RestoreIcon,
  SendIcon,
  Spinner,
  TrashIcon,
  XIcon,
} from './Icons.jsx';
import {
  formatFullTime,
  formatListTime,
  parseAddress,
  plainBody,
  replyAddressFor,
  sanitizeEmailHtml,
} from '../lib/format.js';
import { themeEmailHtml } from '../lib/emailTheme.js';
import {
  extractMessageHtml,
  isOutgoingMessage,
  messagePreview,
  replySubject,
  stripPreheader,
  stripReplyQuotes,
  threadParticipants,
} from '../lib/threads.js';

/** Our own messages get a send mark instead of someone else's initials. */
function SenderMark({ outgoing, name, size = 'md' }) {
  if (!outgoing) return <Avatar name={name} size={size} />;

  return (
    <span className={`avatar avatar--${size} avatar--sent`} aria-hidden="true">
      <SendIcon size={size === 'sm' ? 12 : 14} />
    </span>
  );
}

function ReaderEmpty({ onCompose }) {
  return (
    <div className="flex h-full w-full items-center justify-center px-6 py-16">
      <div className="glass glass-sheen w-full max-w-sm rounded-[1.6rem] px-7 py-9 text-center">
        <div className="flex justify-center">
          <Wordmark className="text-[2.1rem]" />
        </div>
        <p className="micro mt-4">Agora Mail</p>
        <h2 className="mt-2 text-base font-semibold text-ink">Select a conversation</h2>
        <p className="mx-auto mt-1.5 max-w-[16rem] text-sm leading-relaxed text-muted">
          Pick a conversation from the list to read it here — or start a new one.
        </p>
        <button type="button" onClick={onCompose} className="btn btn--ghost btn--sm mt-6">
          <PencilIcon size={14} />
          Compose message
        </button>
      </div>
    </div>
  );
}

/**
 * One message in the stack. The body shown is only what this message added:
 * the sender worker's envelope, marked reply quotes, `<blockquote>`s and
 * pasted originals are removed before anything is rendered.
 */
function ThreadMessage({
  email,
  outgoing,
  expanded,
  view,
  onToggle,
  onViewChange,
  actions,
}) {
  const from = parseAddress(email.from_address);
  const to = parseAddress(email.to_address);
  const attachments = Array.isArray(email.attachments) ? email.attachments : [];

  const newHtml = useMemo(
    () =>
      email.html_body
        ? /* Envelope, hidden preheader, then whatever history the sender's
             client left underneath — only this message's own words remain. */
          stripReplyQuotes(stripPreheader(extractMessageHtml(email.html_body)))
        : '',
    [email.html_body],
  );

  const safeHtml = useMemo(
    () => (newHtml ? themeEmailHtml(sanitizeEmailHtml(newHtml)) : ''),
    [newHtml],
  );

  const text = useMemo(() => {
    if (newHtml) return plainBody({ html: newHtml });
    return plainBody({ text: stripReplyQuotes(email.text_body) });
  }, [newHtml, email.text_body]);

  const hasHtml = Boolean(safeHtml);
  const rendered = view !== 'text' && hasHtml;
  const bodyId = `thread-body-${email.id}`;
  const snippetText = messagePreview(email, 84);

  /* Who the card speaks for. Our own mail says so — an outgoing reply is never
     dressed up as something that arrived. */
  const who = outgoing ? 'You' : from.display;
  const avatarName = from.display;
  const toLabel = to.name || to.address;
  const meta = [
    outgoing ? `to ${toLabel || 'recipient'}` : from.address || from.display,
    formatFullTime(email.created_at),
  ]
    .filter(Boolean)
    .join(' · ');

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={`thread-bar glass glass-sheen ${outgoing ? 'is-outgoing' : ''}`}
        aria-expanded="false"
      >
        <SenderMark outgoing={outgoing} name={avatarName} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="thread-bar__name truncate">{who}</span>
            {outgoing && <span className="thread-tag thread-tag--sent">Sent</span>}
            <time className="thread-bar__time ml-auto shrink-0" dateTime={email.created_at}>
              {formatListTime(email.created_at)}
            </time>
          </span>
          <span className="thread-bar__snippet mt-0.5 block truncate">
            {outgoing && toLabel ? `To ${toLabel} · ` : ''}
            {snippetText}
          </span>
        </span>
        <ChevronDownIcon size={15} className="thread-bar__chevron" />
      </button>
    );
  }

  return (
    <article
      className={`mail-paper overflow-hidden rounded-2xl border bg-[#121216] p-5 text-[#f4f4f5] sm:p-6 ${
        outgoing ? 'border-purple-500/30' : 'border-[#27272a]'
      }`}
    >
      <span className="mail-paper__sheen" aria-hidden="true" />

      <header className="flex flex-wrap items-start gap-3">
        <SenderMark outgoing={outgoing} name={avatarName} />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[0.86rem] font-semibold text-[#f4f4f5]">{who}</span>
            <span className={`thread-tag ${outgoing ? 'thread-tag--sent' : 'thread-tag--received'}`}>
              {outgoing ? 'Sent by you' : 'Received'}
            </span>
          </p>
          <p className="mt-0.5 truncate text-[0.7rem] text-[#a1a1aa]">{meta}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <button
            type="button"
            onClick={onToggle}
            className="thread-icon-btn"
            aria-expanded="true"
            aria-controls={bodyId}
            aria-label="Collapse message"
            title="Collapse message"
          >
            <ChevronDownIcon size={15} className="rotate-180" />
          </button>
        </div>
      </header>

      <div className="mt-3 flex items-center justify-between gap-3">
        {hasHtml ? (
          <div className="segmented" role="group" aria-label="Message view">
            <button
              type="button"
              onClick={() => onViewChange('rendered')}
              aria-pressed={rendered}
              className={`segmented__option ${rendered ? 'is-active' : ''}`}
            >
              Rendered
            </button>
            <button
              type="button"
              onClick={() => onViewChange('text')}
              aria-pressed={!rendered}
              className={`segmented__option ${!rendered ? 'is-active' : ''}`}
            >
              Plain text
            </button>
          </div>
        ) : (
          <span className="micro !text-[0.58rem]">Plain text</span>
        )}

        {attachments.length > 0 && (
          <span className="micro !text-[0.58rem] flex items-center gap-1.5">
            <PaperclipIcon size={12} />
            {attachments.length} {attachments.length === 1 ? 'file' : 'files'}
          </span>
        )}
      </div>

      <div id={bodyId} className="mt-3">
        {rendered ? (
          <div className="mail-html" dangerouslySetInnerHTML={{ __html: safeHtml }} />
        ) : (
          <p className="mail-text">{text || 'This message has no body.'}</p>
        )}
      </div>

      {attachments.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Attachments">
          {attachments.map((attachment, attachmentIndex) => (
            <li
              key={`${attachment?.filename || 'file'}-${attachmentIndex}`}
              className="attachment-chip"
              title={attachment?.filename || 'Attachment'}
            >
              <PaperclipIcon size={14} />
              <span className="max-w-[16rem] truncate">{attachment?.filename || 'Attachment'}</span>
            </li>
          ))}
        </ul>
      )}

    </article>
  );
}

export default function MailReader({
  thread,
  folder,
  selfAddresses = [],
  label,
  busy,
  onReply,
  onSendReply,
  onTrash,
  onTrashThread,
  onRestore,
  onDeleteForever,
  onBack,
  onCompose,
}) {
  /* The newest message is open from the first paint — not after an effect —
     so a conversation never flashes all-collapsed. */
  const [expandedIds, setExpandedIds] = useState(() =>
    thread?.latest?.id === undefined ? [] : [thread.latest.id],
  );
  const [views, setViews] = useState({});
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replyError, setReplyError] = useState('');
  const [replySending, setReplySending] = useState(false);
  const replyRef = useRef(null);

  const messages = thread?.emails || [];
  const latest = thread?.latest;
  const latestId = latest?.id;

  /* Every conversation opens with its newest message expanded and the rest
     folded into summary bars, the way Gmail presents a thread. */
  useEffect(() => {
    setExpandedIds(latestId === undefined ? [] : [latestId]);
    setViews({});
    setReplyOpen(false);
    setReplyBody('');
    setReplyError('');
    setReplySending(false);
  }, [thread?.key, latestId]);

  useEffect(() => {
    if (replyOpen) replyRef.current?.focus();
  }, [replyOpen]);

  if (!thread || !latest) return <ReaderEmpty onCompose={onCompose} />;

  const allExpanded = messages.every((message) => expandedIds.includes(message.id));
  const inTrash = folder === 'trash';

  const toggleMessage = (id) => {
    setExpandedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const toggleAll = () => {
    setExpandedIds(allExpanded ? [] : messages.map((message) => message.id));
  };

  /* A conversation belongs to the people it is with, not to us: the union of
     senders and recipients across both sides, minus our own mailboxes. */
  const threadNames = threadParticipants(thread, selfAddresses);
  const threadLabel =
    threadNames.length > 0
      ? `${threadNames.slice(0, 2).join(', ')}${threadNames.length > 2 ? ` +${threadNames.length - 2}` : ''}`
      : parseAddress(latest.from_address).display;

  const replyTarget = latest;
  /* The address the reply will actually go to: Reply-To when the message
     names one, otherwise its sender (or its recipient, in Sent). */
  const replyAddress = replyAddressFor(replyTarget, { selfAddresses });
  const replyMailbox = parseAddress(replyAddress);
  const replyName = replyMailbox.display;
  const replyEmail = replyMailbox.address || replyAddress;

  const submitReply = async (event) => {
    event.preventDefault();
    if (replySending) return;

    if (!replyBody.trim()) {
      setReplyError('Write a reply before sending.');
      return;
    }

    setReplySending(true);
    setReplyError('');

    const result = await onSendReply?.(replyTarget, replyBody.trim());
    setReplySending(false);

    if (result?.ok) {
      setReplyBody('');
      setReplyOpen(false);
      return;
    }

    setReplyError(result?.error || 'The reply could not be sent. Try again.');
  };

  const messageActions = (email) =>
    inTrash ? (
      <>
        <button
          type="button"
          onClick={() => onRestore(email)}
          className="btn btn--positive btn--sm !px-2.5"
          disabled={busy}
          aria-label="Restore message"
          title="Restore message"
        >
          <RestoreIcon size={14} />
        </button>
        <button
          type="button"
          onClick={() => onDeleteForever(email)}
          className="btn btn--danger btn--sm !px-2.5"
          disabled={busy}
          aria-label="Delete forever"
          title="Delete forever"
        >
          <TrashIcon size={14} />
        </button>
      </>
    ) : (
      <button
        type="button"
        onClick={() => onTrash(email)}
        className="thread-icon-btn"
        disabled={busy}
        aria-label="Move to trash"
        title="Move to trash"
      >
        <TrashIcon size={15} />
      </button>
    );

  return (
    <div key={thread.key} className="reader scroll-area animate-fade-in">
      <div className="reader__body">
        <div className="mb-3 flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={onBack}
            className="icon-btn -ml-2"
            aria-label="Back to conversation list"
          >
            <ArrowLeftIcon size={19} />
          </button>
          <span className="micro">{label}</span>
        </div>

        <header className="reader-head glass glass--strong glass-sheen">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="micro">
                {label} · {thread.count} {thread.count === 1 ? 'message' : 'messages'}
              </p>
              <h1 className="mail-subject mt-2">{thread.subject || '(No subject)'}</h1>
            </div>

            {thread.count > 1 && (
              <button type="button" onClick={toggleAll} className="btn btn--ghost btn--sm shrink-0">
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </button>
            )}
          </div>

          <div className="mail-byline">
            <Avatar name={threadNames[0] || parseAddress(latest.from_address).display} size="md" />
            <div className="min-w-0">
              <p className="truncate text-[0.82rem] font-semibold text-ink">{threadLabel}</p>
              <p className="truncate text-[0.7rem] text-muted">
                {thread.count} {thread.count === 1 ? 'message' : 'messages'} · last activity{' '}
                {formatListTime(latest.created_at)}
              </p>
            </div>
            {!inTrash && (
              <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onReply(latest)}
                  className="btn btn--ghost btn--sm"
                  disabled={busy}
                >
                  <ReplyIcon size={14} />
                  Reply
                </button>
                {/* One decision for the whole conversation: every message in
                    the thread moves, on both sides of the dialogue. */}
                <button
                  type="button"
                  onClick={() => onTrashThread(thread)}
                  className="btn btn--danger btn--sm"
                  disabled={busy}
                  aria-label="Move thread to trash"
                  title="Move every message in this conversation to Trash"
                >
                  <TrashIcon size={14} />
                  <span className="hidden sm:inline">Move thread to trash</span>
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="thread-stack mt-4">
          {messages.map((email) => (
            <ThreadMessage
              key={email.id}
              email={email}
              outgoing={isOutgoingMessage(email, selfAddresses)}
              expanded={expandedIds.includes(email.id)}
              view={views[email.id] || 'rendered'}
              onToggle={() => toggleMessage(email.id)}
              onViewChange={(next) => setViews((current) => ({ ...current, [email.id]: next }))}
              actions={messageActions(email)}
            />
          ))}
        </div>

        {!inTrash && (
          <section className="thread-reply glass glass-sheen mt-4" aria-label="Reply to this conversation">
            {replyOpen ? (
              <form onSubmit={submitReply}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="micro">Replying to {replyName}</p>
                    <p className="mt-1 truncate text-[0.72rem] text-muted">
                      To {replyEmail} · {replySubject(latest.subject)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyOpen(false)}
                    className="icon-btn -mr-1 -mt-1 shrink-0"
                    aria-label="Close reply"
                  >
                    <XIcon size={15} />
                  </button>
                </div>

                <textarea
                  ref={replyRef}
                  rows={4}
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  placeholder={`Reply to ${replyName}…`}
                  className="field-control field-control--area mt-3"
                  aria-label="Reply message"
                />

                {replyError && (
                  <p className="mt-2 text-[0.72rem] text-danger" role="alert">
                    {replyError}
                  </p>
                )}

                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setReplyOpen(false)}
                    className="btn btn--ghost btn--sm"
                    disabled={replySending}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn--brand btn--sm"
                    disabled={replySending || !replyBody.trim()}
                  >
                    {replySending ? <Spinner size={14} /> : <ReplyIcon size={14} />}
                    Send reply
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setReplyOpen(true)}
                className="thread-reply__open"
                disabled={busy}
              >
                <ReplyIcon size={15} />
                Reply to {replyName}
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
