import React from 'react';
import { Avatar } from './Brand.jsx';
import {
  isOutgoingMessage,
  messagePreview,
  NO_SUBJECT,
  threadParticipants,
  threadRecipient,
} from '../lib/threads.js';
import {
  InboxIcon,
  RefreshIcon,
  SearchIcon,
  SendIcon,
  ThreadIcon,
  TrashIcon,
  XIcon,
} from './Icons.jsx';
import { displayName, formatListTime, recipientLabel } from '../lib/format.js';

const EMPTY_COPY = {
  inbox: {
    title: 'Inbox zero',
    body: 'New mail will land here. Nothing else to do right now.',
    Icon: InboxIcon,
  },
  sent: {
    title: 'Nothing sent yet',
    body: 'Messages you send from Agora Mail will appear here.',
    Icon: SendIcon,
  },
  trash: {
    title: 'Trash is empty',
    body: 'Messages you move to trash stay here until you remove them for good.',
    Icon: TrashIcon,
  },
};

function SkeletonRows() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex gap-3 border-b border-line/[0.05] p-4">
          <div className="skeleton h-10 w-10 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2 pt-0.5">
            <div className="skeleton h-2.5 w-1/3" />
            <div className="skeleton h-3 w-4/5" />
            <div className="skeleton h-2.5 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ folder, searchQuery, onClearSearch }) {
  const query = searchQuery.trim();
  const copy = EMPTY_COPY[folder] ?? EMPTY_COPY.inbox;
  const EmptyIcon = copy.Icon;

  if (query) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line/10 bg-brand/10 text-brand-lav">
          <SearchIcon size={20} />
        </span>
        <h3 className="mt-4 text-sm font-semibold text-ink">No matches</h3>
        <p className="mt-1 max-w-[16rem] text-xs leading-relaxed text-muted">
          Nothing in this mailbox matches <span className="text-ink">“{query}”</span>.
        </p>
        <button type="button" onClick={onClearSearch} className="btn btn--ghost btn--sm mt-4">
          <XIcon size={14} />
          Clear search
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line/10 bg-brand/10 text-brand-lav">
        <EmptyIcon size={20} />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-ink">{copy.title}</h3>
      <p className="mt-1 max-w-[16rem] text-xs leading-relaxed text-muted">{copy.body}</p>
    </div>
  );
}

export default function EmailList({
  folder,
  label,
  threads,
  selfAddresses = [],
  loading,
  selectedId,
  searchQuery,
  onSearchChange,
  onSelect,
  onRefresh,
  onClearSearch,
}) {
  const count = threads.length;
  const unreadCount =
    folder === 'inbox' ? threads.reduce((total, thread) => total + thread.unread, 0) : 0;

  /* Who the row is about: in Sent the recipient, everywhere else everyone on
     the other side of the conversation. */
  const describeRow = (thread) => {
    if (folder !== 'sent') {
      const names = threadParticipants(thread, selfAddresses);
      /* If we spoke last, the row still belongs to the person we spoke to. */
      const incoming = [...thread.emails]
        .reverse()
        .find((email) => !isOutgoingMessage(email, selfAddresses));

      return {
        sender:
          names.length > 0 ? names.slice(0, 2).join(', ') : displayName(thread.latest.from_address),
        avatar: incoming?.from_address || thread.latest.from_address,
        prefix: '',
        address: '',
      };
    }

    const recipient = threadRecipient(thread);
    const { primary, secondary } = recipientLabel(recipient.raw);

    return {
      sender: primary,
      avatar: recipient.address || recipient.display,
      prefix: 'To:',
      address: secondary,
    };
  };

  return (
    <>
      <header className="list-head px-4 pb-3 pt-4 md:pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <h2 className="truncate text-base font-semibold tracking-tight text-ink">{label}</h2>
            {unreadCount > 0 && (
              <span className="rounded-full border border-brand/25 bg-brand/15 px-1.5 py-0.5 font-mono text-[0.58rem] font-semibold leading-none text-brand-lav">
                {unreadCount} new
              </span>
            )}
            <span className="micro hidden sm:inline">
              {count} {count === 1 ? 'conversation' : 'conversations'}
            </span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="icon-btn"
            aria-label={`Refresh ${label}`}
            title={`Refresh ${label}`}
          >
            <RefreshIcon size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="relative mt-3">
          <SearchIcon
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={`Search ${label.toLowerCase()}…`}
            aria-label={`Search ${label}`}
            className="field-control py-2 pl-9 pr-9 text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={onClearSearch}
              className="icon-btn absolute right-1 top-1/2 !h-7 !w-7 -translate-y-1/2"
              aria-label="Clear search"
            >
              <XIcon size={13} />
            </button>
          )}
        </div>
      </header>

      <div className="scroll-area min-h-0 flex-1 overflow-y-auto" aria-busy={loading}>
        {loading && count === 0 ? (
          <SkeletonRows />
        ) : count === 0 ? (
          <EmptyState folder={folder} searchQuery={searchQuery} onClearSearch={onClearSearch} />
        ) : (
          <ul>
            {threads.map((thread) => {
              const latest = thread.latest;
              const unreadInFolder = thread.emails.filter(
                (email) => !email.is_read && email.folder === folder,
              ).length;
              const unread = folder === 'inbox' && unreadInFolder > 0;
              const selected = selectedId === thread.key;
              const row = describeRow(thread);
              const preview = messagePreview(latest, 65);
              const ongoing = thread.count > 1;

              return (
                <li key={thread.key}>
                  <button
                    type="button"
                    onClick={() => onSelect(thread)}
                    className={`mail-row ${unread ? 'is-unread' : ''} ${selected ? 'is-selected' : ''}`}
                    aria-current={selected ? 'true' : undefined}
                    title={row.address ? `${row.prefix} ${row.sender} <${row.address}>` : undefined}
                  >
                    <Avatar name={row.avatar} size="md" />

                    <span className="mail-row__body min-w-0 flex-1">
                      {/* Who · when. The name truncates; the stamp never does. */}
                      <span className="mail-row__top flex min-w-0 items-center gap-1.5">
                        {unread && <span className="unread-dot" aria-hidden="true" />}
                        {row.prefix && (
                          <span className="mail-row__prefix shrink-0">{row.prefix}</span>
                        )}
                        <span className="mail-row__sender min-w-0 truncate">{row.sender}</span>
                        {row.address && (
                          <span className="mail-row__address hidden min-w-0 truncate sm:block">
                            {row.address}
                          </span>
                        )}
                        <time
                          className="mail-row__time ml-auto shrink-0"
                          dateTime={latest.created_at}
                        >
                          {formatListTime(latest.created_at)}
                        </time>
                      </span>

                      {/* What · how many. A conversation carries its layers
                          and a count pill; a single message stays plain. */}
                      <span className="mail-row__middle mt-0.5 flex min-w-0 items-center gap-2">
                        <span className="mail-row__subject min-w-0 truncate">
                          {thread.subject === NO_SUBJECT ? '(no subject)' : thread.subject}
                        </span>
                        {ongoing && (
                          <span
                            className="mail-row__thread ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold leading-none text-purple-300"
                            title={`${thread.count} messages in this conversation`}
                          >
                            <ThreadIcon size={10} />
                            <span>{thread.count}</span>
                          </span>
                        )}
                      </span>

                      <span className="mail-row__snippet mt-0.5 line-clamp-2">{preview}</span>
                    </span>

                    {unread && (
                      <span className="sr-only">
                        {unreadInFolder} unread {unreadInFolder === 1 ? 'message' : 'messages'}
                      </span>
                    )}
                    {ongoing && (
                      <span className="sr-only">
                        Conversation of {thread.count} messages
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {loading && count > 0 && (
        <div
          className="flex items-center justify-center gap-2 border-t border-line/10 py-2"
          aria-live="polite"
        >
          <span className="h-1 w-1 animate-pulse rounded-full bg-brand" aria-hidden="true" />
          <span className="micro">Syncing</span>
        </div>
      )}
    </>
  );
}
