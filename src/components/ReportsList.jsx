import React from 'react';
import {
  CheckCheckIcon,
  RefreshIcon,
  SearchIcon,
  ShieldIcon,
  ThreadIcon,
  XIcon,
} from './Icons.jsx';
import { formatListTime } from '../lib/format.js';
import { STATUS_STYLES, formatRemaining } from '../lib/reports.js';

/* ============================================================
   The Reports tab.

   Report conversations are not ordinary mail, so they do not get ordinary
   rows: each card answers the four questions a moderator asks — which report,
   is it still open, why, and who reported whom.
   ============================================================ */

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
];

const EMPTY_COPY = {
  all: { title: 'No reports yet', body: 'Reports about posts will arrive here, grouped by Report ID.' },
  active: { title: 'Nothing waiting', body: 'Every report has been resolved or closed.' },
  resolved: { title: 'No resolved reports', body: 'Resolved reports are deleted two days after they are settled.' },
  closed: { title: 'No closed reports', body: 'Closed reports stay here until they are reopened or removed.' },
};

function ReportCard({ report, selected, now, onSelect }) {
  const status = STATUS_STYLES[report.status] || STATUS_STYLES.active;
  const identity = report.meta || {};
  const remaining = report.status === 'resolved' && report.resolvedAt
    ? Math.min(48 * 60 * 60 * 1000, Math.max(0, report.resolvedAt + 48 * 60 * 60 * 1000 - now))
    : 0;

  const subtitle = report.status === 'resolved'
    ? `Resolved • Deletes in ${formatRemaining(remaining)}`
    : report.status === 'closed'
      ? 'Closed without an email'
      : 'Awaiting review';

  return (
    <button
      type="button"
      onClick={() => onSelect(report)}
      className={`report-card ${selected ? 'is-selected' : ''}`}
      aria-current={selected ? 'true' : undefined}
      title={`Report ${report.reportId}`}
    >
      <span className="flex items-center gap-2">
        <span className="report-card__id" title={report.reportId}>
          ID: #{report.shortId}
        </span>
        <span
          className={`report-card__status border ${status.className} ${
            report.status === 'active' ? 'is-active' : ''
          }`}
        >
          {report.status === 'active' && <span className="report-card__pulse" aria-hidden="true" />}
          {status.label}
        </span>
        <time className="ml-auto shrink-0 text-[0.62rem] text-faint" dateTime={report.latest?.created_at}>
          {formatListTime(report.latest?.created_at)}
        </time>
      </span>

      <span className="mt-1.5 flex min-w-0 items-center gap-1.5">
        <span className="truncate text-[0.86rem] font-semibold text-ink">
          {report.subject === '[Report]' ? 'Report' : report.subject}
        </span>
        {identity.reason && (
          <span className="report-card__reason shrink-0">{identity.reason}</span>
        )}
      </span>

      <span className="report-card__meta mt-1 flex min-w-0 items-center gap-1">
        <span className="truncate text-[0.74rem] text-ink/85">
          {identity.reporterTag || identity.reporterEmail || 'Unknown reporter'}
        </span>
        <span className="text-faint" aria-hidden="true">→</span>
        <span className="truncate text-[0.74rem] text-muted">
          {identity.authorTag ? `post by ${identity.authorTag}` : 'unknown post author'}
        </span>
        <span className="report-card__count ml-auto shrink-0">
          <ThreadIcon size={10} />
          {report.count}
        </span>
      </span>

      <span className={`report-card__subtitle mt-1 block text-[0.66rem] ${report.status === 'resolved' ? 'is-resolved' : ''}`}>
        {subtitle}
      </span>
    </button>
  );
}

export default function ReportsList({
  threads = [],
  label = 'Reports',
  loading,
  selectedId,
  searchQuery,
  onSearchChange,
  onClearSearch,
  onSelect,
  onRefresh,
  filter,
  onFilterChange,
  now = Date.now(),
}) {
  const count = threads.length;

  return (
    <>
      <header className="list-head px-4 pb-3 pt-4 md:pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="report-head__icon" aria-hidden="true">
              <ShieldIcon size={15} />
            </span>
            <h2 className="truncate text-base font-semibold tracking-tight text-ink">{label}</h2>
            <span className="micro hidden sm:inline">
              {count} {count === 1 ? 'report' : 'reports'}
            </span>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="icon-btn"
            aria-label="Refresh reports"
            title="Refresh reports"
          >
            <RefreshIcon size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="report-filters mt-3 flex items-center gap-1.5" role="group" aria-label="Filter reports">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onFilterChange(option.id)}
              className={`report-filter ${filter === option.id ? 'is-active' : ''}`}
              aria-pressed={filter === option.id}
            >
              {option.label}
            </button>
          ))}
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
            placeholder="Search reports…"
            aria-label="Search reports"
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
        {count === 0 && loading ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center" aria-live="polite">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" aria-hidden="true" />
            <p className="micro mt-3">Loading reports…</p>
          </div>
        ) : count === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line/10 bg-brand/10 text-brand-lav">
              <ShieldIcon size={20} />
            </span>
            <h3 className="mt-4 text-sm font-semibold text-ink">
              {(EMPTY_COPY[filter] || EMPTY_COPY.all).title}
            </h3>
            <p className="mt-1 max-w-[16rem] text-xs leading-relaxed text-muted">
              {(EMPTY_COPY[filter] || EMPTY_COPY.all).body}
            </p>
          </div>
        ) : (
          <ul className="report-list">
            {threads.map((report) => (
              <li key={report.key}>
                <ReportCard
                  report={report}
                  selected={selectedId === report.key}
                  now={now}
                  onSelect={onSelect}
                />
              </li>
            ))}
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

      {count > 0 && filter === 'all' && (
        <p className="report-foot">
          <CheckCheckIcon size={12} />
          Resolved reports are deleted after 48 hours.
        </p>
      )}
    </>
  );
}
