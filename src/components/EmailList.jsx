import React from 'react';
import { Avatar } from './Brand.jsx';
import {
  InboxIcon,
  RefreshIcon,
  SearchIcon,
  SendIcon,
  TrashIcon,
  XIcon,
} from './Icons.jsx';
import {
  cleanPreview,
  cleanSubject,
  displayName,
  formatListTime,
  snippet,
  trimLeadingSubject,
} from '../lib/format.js';

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
  emails,
  loading,
  selectedId,
  searchQuery,
  onSearchChange,
  onSelect,
  onRefresh,
  onClearSearch,
}) {
  const count = emails.length;
  const unreadCount = folder === 'inbox' ? emails.filter((email) => !email.is_read).length : 0;

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
              {count} {count === 1 ? 'message' : 'messages'}
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
            {emails.map((email) => {
              const unread = !email.is_read && folder === 'inbox';
              const selected = selectedId === email.id;
              const correspondent = folder === 'sent' ? email.to_address : email.from_address;
              const sender =
                folder === 'sent'
                  ? `To: ${displayName(email.to_address)}`
                  : displayName(email.from_address);
              /* Entities, tags and the worker's wrapper copy never reach the
                 list: cleanPreview decodes and strips them first. */
              const preview = snippet(
                trimLeadingSubject(
                  cleanPreview(email.text_body || email.html_body),
                  email.subject,
                ),
                180,
              );

              return (
                <li key={email.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(email)}
                    className={`mail-row ${unread ? 'is-unread' : ''} ${selected ? 'is-selected' : ''}`}
                    aria-current={selected ? 'true' : undefined}
                  >
                    <Avatar name={correspondent} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        {unread && <span className="unread-dot" aria-hidden="true" />}
                        <span className="mail-row__sender truncate">{sender}</span>
                        <time className="mail-row__time ml-auto" dateTime={email.created_at}>
                          {formatListTime(email.created_at)}
                        </time>
                      </span>
                      <span className="mail-row__subject mt-0.5 block truncate">
                        {cleanSubject(email.subject) || '(no subject)'}
                      </span>
                      <span className="mail-row__snippet mt-0.5 line-clamp-2">{preview}</span>
                    </span>
                    {unread && <span className="sr-only">Unread</span>}
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
