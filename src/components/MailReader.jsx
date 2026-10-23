import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Wordmark } from './Brand.jsx';
import {
  ArrowLeftIcon,
  CheckCheckIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  ForwardIcon,
  PaperclipIcon,
  PencilIcon,
  ReplyIcon,
  RestoreIcon,
  SendIcon,
  ShieldIcon,
  Spinner,
  TrashIcon,
  XIcon,
} from './Icons.jsx';
import {
  extractEmailAddress,
  formatFullTime,
  formatListTime,
  parseAddress,
  plainBody,
  sanitizeEmailHtml,
} from '../lib/format.js';
import {
  isModerationReport,
  reporterHandle,
  resolveReplyEmail,
} from '../lib/replyTarget.js';
import { themeEmailHtml } from '../lib/emailTheme.js';
import { STATUS_STYLES, describeRemaining, timeUntilDeletion } from '../lib/reports.js';
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
  replyTo = '',
  identity = null,
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
     dressed up as something that arrived. A moderation report speaks for the
     person who filed it, not for the robot that delivered it. */
  const reportSender = Boolean(identity) && !outgoing && isModerationReport(email);
  const who = outgoing
    ? 'You'
    : reportSender
      ? identity.reporterName || identity.reporterTag || from.display
      : from.display;
  const avatarName = reportSender ? who : from.display;
  const toLabel = to.name || to.address;
  /* A reply does not always go back to the sender: a moderation report is
     answered at the reporter's address, so the card says where answers land
     rather than leaving the no-reply sender as the only clue. */
  const replyToAddress = extractEmailAddress(replyTo);
  const senderAddress = from.address || '';
  const rerouted =
    !outgoing &&
    Boolean(replyToAddress) &&
    replyToAddress.toLowerCase() !== senderAddress.toLowerCase();

  const senderLine = outgoing
    ? `to ${toLabel || 'recipient'}`
    : rerouted
      ? `${senderAddress || from.display} • Reply-To: ${replyToAddress}`
      : senderAddress || from.display;

  const meta = [senderLine, formatFullTime(email.created_at)].filter(Boolean).join(' · ');

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
          {/* A long reporter address must stay readable, so this line wraps
              instead of truncating. */}
          <p className="mt-0.5 break-words text-[0.7rem] text-[#a1a1aa]">{meta}</p>
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
  report = null,
  resolving = false,
  onResolveReport,
  onCloseReport,
  onReopenReport,
  onForwardReport,
  onForward,
  onCopyReportId,
  onReply,
  onSendReply,
  replyAddress = '',
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

  /* Where each card says it will send an answer, resolved once per message.
     Declared before the empty state so the hook order never changes. */
  const replyTargets = useMemo(() => {
    const found = new Map();
    for (const message of messages) {
      found.set(message.id, resolveReplyEmail(message, messages, { selfAddresses }));
    }
    return found;
  }, [messages, selfAddresses]);

  /* The reporter behind a moderation report, read once per conversation. */
  const reportHandle = useMemo(() => reporterHandle(messages), [messages]);

  /* A report is more than a thread: it has an id, a status and a clock. The
     App groups and times it; these fallbacks keep the reader whole on its
     own. */
  const reportInfo = report?.meta || null;
  const reportStatus = report?.status || '';
  const reportBadge = STATUS_STYLES[reportStatus] || null;
  /* Recomputed on every render: the App ticks a minute clock, and the banner's
     countdown has to move with it. */
  const reportRemaining = reportStatus === 'resolved' ? timeUntilDeletion(report?.resolvedAt) : 0;

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
  /* The address the reply will actually go to. The App resolves it against
     the whole conversation — a moderation report is answered at the reporter's
     address found inside it — and the fallback keeps the reader usable on its
     own. */
  const resolvedReply =
    replyAddress || resolveReplyEmail(replyTarget, messages, { selfAddresses });
  const replyMailbox = parseAddress(resolvedReply);
  const replyEmail = extractEmailAddress(resolvedReply);
  const senderAddress = extractEmailAddress(replyTarget.from_address || replyTarget.from || '');
  const replyName =
    replyMailbox.name ||
    (replyEmail.toLowerCase() !== senderAddress.toLowerCase()
      ? replyEmail.split('@')[0]
      : replyMailbox.display);

  /* A moderation report names a person rather than an address: `Report by
     @ron`. That handle is what the reply box should say, so a moderator is
     answering a member, not a mailbox. Reports that print no handle fall back
     to an id-shaped form of the address rather than leaving it bare. */
  const replyLabel =
    (reportInfo?.reporterTag && reportInfo?.reporterEmail
      ? `${reportInfo.reporterTag} (${reportInfo.reporterEmail})`
      : '') ||
    reportHandle ||
    (isModerationReport(replyTarget) && replyEmail ? `@${replyEmail.split('@')[0]}` : replyName);

  /* What the header calls the conversation: the person who filed it, if the
     report names them, rather than the noreply mailbox it arrived from. */
  const reporterDisplay = reportInfo?.reporterName || reportInfo?.reporterTag || '';
  const headerTitle = reporterDisplay
    ? `${reporterDisplay}${reportInfo?.reporterEmail ? ` · ${reportInfo.reporterEmail}` : ''}`
    : threadLabel;

  /* The reporter's initials beat "Report by @ron" for the avatar. */
  const bylineName = reporterDisplay || threadNames[0] || parseAddress(latest.from_address).display;

  const submitReply = async (event) => {
    event.preventDefault();
    if (replySending) return;

    if (!replyBody.trim()) {
      setReplyError('Write a reply before sending.');
      return;
    }

    setReplySending(true);
    setReplyError('');

    const result = await onSendReply?.(replyTarget, replyBody.trim(), replyEmail);
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

          {reportInfo && (
            <div className="report-bar glass glass-sheen">
              <div className="report-bar__id">
                <span className="report-bar__label">
                  <ShieldIcon size={12} />
                  Report ID
                </span>
                {/* The full id: this is the bar a moderator copies from. */}
                <code className="report-bar__value" title={report?.reportId}>
                  {report?.reportId}
                </code>
                <button
                  type="button"
                  onClick={() => onCopyReportId?.(report?.reportId)}
                  className="icon-btn !h-7 !w-7"
                  aria-label="Copy the full Report ID"
                  title={report?.reportId}
                >
                  <CopyIcon size={13} />
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {reportBadge && (
                  <span className={`report-card__status border ${reportBadge.className}`}>
                    {reportStatus === 'active' && (
                      <span className="report-card__pulse" aria-hidden="true" />
                    )}
                    {reportBadge.label}
                  </span>
                )}

                {reportStatus === 'active' && (
                  <button
                    type="button"
                    onClick={() => onResolveReport?.(report)}
                    className="btn btn--primary btn--sm"
                    disabled={resolving}
                  >
                    {resolving ? (
                      <Spinner size={13} />
                    ) : (
                      <CheckCheckIcon size={13} />
                    )}
                    {resolving ? 'Resolving & notifying reporter…' : 'Resolve Report'}
                  </button>
                )}

                {reportStatus === 'active' && (
                  <button
                    type="button"
                    onClick={() => onCloseReport?.(report)}
                    className="btn btn--ghost btn--sm"
                    disabled={resolving}
                  >
                    <XIcon size={13} />
                    Close Without Email
                  </button>
                )}

                {reportStatus !== 'active' && (
                  <button
                    type="button"
                    onClick={() => onReopenReport?.(report)}
                    className="btn btn--ghost btn--sm"
                    disabled={resolving}
                  >
                    <RestoreIcon size={13} />
                    Reopen Report
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="mail-byline">
            <Avatar name={bylineName} size="md" />
            <div className="min-w-0">
              <p className="truncate text-[0.82rem] font-semibold text-ink">{headerTitle}</p>
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
                <button
                  type="button"
                  onClick={() => (onForwardReport ? onForwardReport(report) : onForward?.(latest))}
                  className="btn btn--ghost btn--sm"
                  disabled={busy}
                >
                  <ForwardIcon size={14} />
                  Forward
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

        {reportStatus === 'resolved' && (
          <div className="report-banner glass glass-sheen mt-4" role="status">
            <span className="report-banner__check" aria-hidden="true">
              <CheckIcon size={14} />
            </span>
            <p className="text-[0.8rem] leading-relaxed text-ink">
              <strong>This report has been marked as Resolved.</strong> It will be automatically
              deleted in{' '}
              <span className="report-banner__time">{describeRemaining(reportRemaining)}</span>.
            </p>
          </div>
        )}

        <div className="thread-stack mt-4">
          {messages.map((email) => (
            <ThreadMessage
              key={email.id}
              email={email}
              outgoing={isOutgoingMessage(email, selfAddresses)}
              expanded={expandedIds.includes(email.id)}
              view={views[email.id] || 'rendered'}
              replyTo={replyTargets.get(email.id) || ''}
              identity={reportInfo}
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
                    <p className="micro">Replying to {replyLabel}</p>
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
                  placeholder={`Reply to ${replyLabel}…`}
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
                <span className="truncate">Reply to {replyLabel}</span>
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
