/* ============================================================
   Moderation reports.

   A report arrives from `noreply@agora.in.net` and names its people inside
   the body: the reporter (`Report by @handle`, `Registered Email: …`) and the
   author of the reported post (`Reported post by @handle`). This module reads
   those out, tidies a report identity for display, groups every message about
   one report under its Report ID, and keeps the status lifecycle that decides
   when a resolved report is deleted.

   Two rules earn their place here:

   - HTML is scrubbed of `<style>`/`<script>` before any text is matched. A
     stylesheet's `@import` and `@media` look exactly like handles, and reading
     them as people is the bug this file exists to prevent.
   - A report ID that the message does not print is derived from its subject,
     so every reply in the thread lands in the same report.
   ============================================================ */

import {
  decodeEntities,
  extractEmailAddress,
  isNoReplyAddress,
  stripStyleAndScript,
} from './format.js';
import { normaliseSubject, NO_SUBJECT } from './threads.js';

/* ---- constants -------------------------------------------------------- */

/** Statuses live here so they survive a reload; markers survive a device. */
export const REPORT_STATUS_KEY = 'agora_report_statuses_v1';

/** A resolved report is deleted two days after it was resolved. */
export const REPORT_TTL_MS = 48 * 60 * 60 * 1000;

/** Handles that are CSS at-rules, never people. */
const RESERVED_HANDLES = new Set([
  'import',
  'media',
  'keyframes',
  'font-face',
  'supports',
  'charset',
  'namespace',
  'page',
  'layer',
  'container',
  'property',
  'document',
  'viewport',
]);

const HANDLE = '@[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,29}';
const HANDLE_EXACT = new RegExp(`^${HANDLE}$`);

const SYSTEM_ADDRESSES = new Set(['mail@agora.in.net', 'noreply@agora.in.net']);

/* ---- small helpers ---------------------------------------------------- */

/** A body as flat text: styles and scripts gone, tags to spaces, entities out. */
export function bodyText(html = '') {
  return decodeEntities(
    stripStyleAndScript(String(html || '')).replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every `@handle` in a value, ignoring CSS at-rules and email addresses. */
export function handlesIn(value = '') {
  const text = String(value || '');
  const found = [];
  const pattern = /(^|[^\w.%+-])(@[A-Za-z0-9_][A-Za-z0-9_.-]{0,29})(?![\w@]|\.[A-Za-z]{2,})/g;
  for (const match of text.matchAll(pattern)) {
    const handle = match[2].replace(/[.-]+$/, '');
    if (!HANDLE_EXACT.test(handle)) continue;
    if (RESERVED_HANDLES.has(handle.slice(1).toLowerCase())) continue;
    if (!found.includes(handle)) found.push(handle);
  }
  return found;
}

/** A display name with its punctuation tidied: `jayvardhan  bhaskar` → Title Case-ish. */
function tidyName(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:–—-]+|[\s:–—-]+$/g, '')
    .trim();
}

/** A body's text, plus the raw HTML — matches run over whichever has it. */
function bodiesOf(email = {}) {
  return [email.html_body, email.text_body].filter(Boolean).map((body) => String(body));
}

function textsOf(email = {}) {
  const html = bodyText(email.html_body || '');
  const text = decodeEntities(String(email.text_body || '')).replace(/\s+/g, ' ').trim();
  return [html, text].filter(Boolean);
}

/* ---- identity --------------------------------------------------------- */

/**
 * Who reported, in the shape the UI shows: a display name, an `@handle`, and
 * the address a reply goes to.
 *
 * Sources, strongest first:
 *   - `Report by @handle` in the sender or the body,
 *   - `[Report: reason] @handle` in the subject,
 *   - `User Tag: @handle` and `Name: Jayvardhan Bhaskar` in the body,
 *   - the `mailto:` / `Registered Email:` address for the reply.
 *
 * @returns {{displayName: string, userTag: string, email: string}}
 *   `displayName` is "Name (@handle)" when both are known, otherwise whichever
 *   half exists, otherwise ''.
 */
export function extractReporterIdentity(emailObj, threadMessages = []) {
  const target = emailObj || {};
  const thread = (Array.isArray(threadMessages) ? threadMessages : [threadMessages])
    .filter(Boolean)
    .filter((message) => message !== target);

  const messages = [target, ...thread];

  let userTag = '';
  let named = '';
  let email = '';

  for (const message of messages) {
    const text = [message.from_address, message.subject, ...textsOf(message)].join('\n');

    if (!userTag) {
      const reported = text.match(
        /\b(?:report(?:ed)?\s+by|reporter(?:\s+handle)?|user\s+tag)\s*:?\s*(@[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,29})/i,
      );
      if (reported) userTag = reported[1].replace(/[.-]+$/, '');
    }

    if (!userTag) {
      const inSubject = String(message.subject || '').match(
        /\[Report:[^\]]+\]\s*(@[a-zA-Z0-9_.-]+)/i,
      );
      if (inSubject) userTag = inSubject[1].replace(/[.-]+$/, '');
    }

    if (!userTag) {
      const tag = text.match(/\bUser\s+Tag\s*:?\s*(@[a-zA-Z0-9_.-]+)/i);
      if (tag) userTag = tag[1].replace(/[.-]+$/, '');
    }

    if (!named) {
      const name = bodyText(message.html_body || '').match(
        /\bName\s*:\s*([A-Za-z0-9][A-Za-z0-9 ._-]{1,60}?)(?=\s(?:User\s+Tag|Registered|Report|Email|Post|Reason)\b|$)/i,
      ) ||
        String(message.text_body || '').match(
          /\bName\s*:\s*([A-Za-z0-9][A-Za-z0-9 ._-]{1,60}?)(?=\n|$)/i,
        );
      if (name) named = tidyName(name[1]);
    }

    if (!email) {
      const address = findReporterEmail(message);
      if (address) email = address;
    }
  }

  /* "Jayvardhan Bhaskar (@jaybhaskar)" — the name a moderator recognises,
     with the handle that tells them which account it is. */
  let displayName = named;
  if (named && userTag) displayName = `${named} (${userTag})`;
  else if (!named && userTag) displayName = userTag;

  displayName = displayName.trim();

  return { displayName, userTag, email };
}

/** The reporter's address, from the bodies, skipping Agora's own mailboxes. */
export function findReporterEmail(email = {}) {
  const candidates = [];

  for (const body of bodiesOf(email)) {
    const scrubbed = stripStyleAndScript(body);
    for (const match of scrubbed.matchAll(
      /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
    )) {
      candidates.push(match[1]);
    }
  }

  for (const body of bodiesOf(email)) {
    const text = bodyText(body);
    for (const match of text.matchAll(
      /Registered\s+Email\s*:?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
    )) {
      candidates.push(match[1]);
    }
  }

  const seen = new Set();
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    if (SYSTEM_ADDRESSES.has(lower)) continue;
    if (isNoReplyAddress(lower)) continue;
    return candidate;
  }

  return '';
}

/* ---- report metadata -------------------------------------------------- */

/** A short, stable hex digest of a value — the last-resort report id. */
export function hashSubject(value = '') {
  const input = normaliseSubject(value).toLowerCase();
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(index)) >>> 0;
  }
  /* Two rounds, so short subjects do not collide on a single 32-bit digest. */
  let second = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    second ^= input.charCodeAt(index);
    second = Math.imul(second, 0x01000193) >>> 0;
  }
  return (hash.toString(16).padStart(8, '0') + second.toString(16).padStart(8, '0')).slice(0, 8);
}

/** `#2ace8130` — the badge form of a full UUID. */
export function shortReportId(reportId = '') {
  return String(reportId || '').replace(/^#/, '').slice(0, 8) || 'unknown';
}

const ID_PATTERN = /Report\s*(?:ID|#)\s*:?\s*([a-f0-9-]{8,36})/i;
const MARKER_ID = /<!--\s*AGORA_REPORT_ID:([a-f0-9-]{8,36})\s*-->/i;
const STATUS_MARKER =
  /<!--\s*AGORA_REPORT_STATUS:(ACTIVE|RESOLVED|CLOSED):(\d{10,16})\s*-->/i;

/** Any status marker in a message body, e.g. the resolution email's own. */
export function statusFromMarker(html = '') {
  const match = String(html || '').match(STATUS_MARKER);
  if (!match) return null;
  return { status: match[1].toLowerCase(), at: Number(match[2]) };
}

/**
 * What a message says about its report.
 *
 * @param {object} emailObj
 * @returns {{reportId, shortId, reason, reporterTag, reporterName, reporterEmail,
 *   authorTag, postUrl, subject, marker}}
 */
export function extractReportMetadata(emailObj = {}) {
  const message = emailObj || {};
  const subject = String(message.subject || '');
  const html = String(message.html_body || '');
  const texts = textsOf(message);
  const everything = [subject, ...texts].join('\n');

  /* An explicit id wins; a marker is next; the subject digest is the floor. */
  const explicit =
    everything.match(ID_PATTERN) ||
    html.match(MARKER_ID) ||
    String(message.text_body || '').match(MARKER_ID);
  const reportId = explicit ? explicit[1].toLowerCase() : hashSubject(subject);

  const reasonMatch =
    subject.match(/\[Report:\s*([^\]]+)\]/i) ||
    everything.match(/\bReported\s+Reason\s*:?\s*([^\n]{2,60})/i) ||
    everything.match(/\bReason\s*:\s*([^\n]{2,60})/i);
  const reason = reasonMatch ? tidyName(reasonMatch[1]).replace(/[.;]+$/, '') : '';

  const identity = extractReporterIdentity(message);

  const authorMatch =
    everything.match(/\breported\s+post\s+by\s*(@[a-zA-Z0-9_.-]+)/i) ||
    everything.match(/\bpost\s+(?:author|by)\s*:?\s*(@[a-zA-Z0-9_.-]+)/i);
  const authorTag = authorMatch ? authorMatch[1].replace(/[.-]+$/, '') : '';

  const urlMatch = html.match(/https:\/\/agora\.in\.net\/post\/[a-zA-Z0-9-]+/i) ||
    String(message.text_body || '').match(/https:\/\/agora\.in\.net\/post\/[a-zA-Z0-9-]+/i);

  return {
    reportId,
    explicitId: Boolean(explicit),
    shortId: shortReportId(reportId),
    reason,
    reporterTag: identity.userTag,
    reporterName: identity.displayName,
    reporterEmail: identity.email,
    authorTag,
    postUrl: urlMatch ? urlMatch[0] : '',
    subject: normaliseSubject(subject),
    marker: statusFromMarker(html),
  };
}

/* ---- is this a report? ------------------------------------------------ */

/**
 * Does this message belong to the moderation pipeline?
 *
 * A report, a reply to one, or a resolution email all qualify — the subject
 * keeps `[Report: …]`, so the check is mostly about the subject.
 */
export function isReportEmail(email = {}) {
  const message = email || {};
  const subject = String(message.subject || '');
  if (/\[Report:/i.test(subject) || /Report\s*(?:ID|#)\s*:/i.test(subject)) return true;

  const from = String(message.from_address || message.from || '');
  if (/Report\s+by\s+@/i.test(from) || /Agora\s+Moderation/i.test(from)) return true;

  for (const body of bodiesOf(message)) {
    const scrubbed = stripStyleAndScript(body);
    if (/MODERATION\s+REPORT/i.test(scrubbed)) return true;
    if (/Report\s*(?:#|ID\s*:)/i.test(scrubbed)) return true;
  }

  return false;
}

/**
 * The set of normalised subjects that belong to reports, so a reply whose
 * subject was rewritten ("Re: …") still lands in the Reports tab.
 */
export function reportSubjectKeys(emails = []) {
  const keys = new Set();
  for (const email of emails) {
    if (!email || !isReportEmail(email)) continue;
    const key = normaliseSubject(email.subject).toLowerCase();
    /* Threads without a subject are keyed by id, never merged — claiming the
       placeholder would hide every subject-less conversation in Inbox. */
    if (key && key !== NO_SUBJECT) keys.add(key);
  }
  return keys;
}

/** Is this message part of any report conversation? */
export function isReportRelated(email, subjectKeys = new Set()) {
  if (!email) return false;
  if (isReportEmail(email)) return true;
  return subjectKeys.has(normaliseSubject(email.subject).toLowerCase());
}

/* ---- statuses --------------------------------------------------------- */

/** Read the status store, tolerating anything that was left behind. */
export function loadReportStatuses(storage) {
  try {
    const raw = storage?.getItem(REPORT_STATUS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

/** Write the status store; a private window may refuse, which is fine. */
export function saveReportStatuses(storage, statuses) {
  try {
    storage?.setItem(REPORT_STATUS_KEY, JSON.stringify(statuses || {}));
  } catch {
    /* storage unavailable — the markers on the messages still carry it */
  }
}

const STATUSES = new Set(['active', 'resolved', 'closed']);

/**
 * The status of one report, from the stored record or a marker in the thread.
 *
 * A marker travels with the mail, so it wins: it is how a resolution made on
 * another device — or by the worker itself — reaches this browser.
 */
export function resolveReportStatus(reportId, messages = [], statuses = {}) {
  const stored = statuses?.[reportId];
  const base = stored && STATUSES.has(stored.status)
    ? {
        status: stored.status,
        resolvedAt: Number(stored.resolvedAt) || 0,
        closedAt: Number(stored.closedAt) || 0,
      }
    : { status: 'active', resolvedAt: 0, closedAt: 0 };

  /* A decision made here — resolve, close, or reopen — is newer than any
     marker already in the mail, so the marker must not undo it. Another
     device's newer marker still wins, which is how a resolution lands here. */
  const decided = Number(stored?.updatedAt) || 0;

  for (const message of messages) {
    const marker = statusFromMarker(message?.html_body);
    if (!marker) continue;
    if (marker.at <= decided) continue;
    if (marker.at < (base.status === marker.status ? base.resolvedAt || base.closedAt : 0)) continue;
    if (marker.status === 'resolved' && marker.at >= base.resolvedAt) {
      base.status = 'resolved';
      base.resolvedAt = marker.at;
      base.closedAt = 0;
    } else if (marker.status === 'closed' && marker.at >= base.closedAt) {
      base.status = 'closed';
      base.closedAt = marker.at;
      base.resolvedAt = 0;
    } else if (marker.status === 'active' && base.status === 'active') {
      base.resolvedAt = 0;
      base.closedAt = 0;
    }
  }

  return base;
}

/** How long a resolved report has left before it is deleted. */
export function timeUntilDeletion(resolvedAt, now = Date.now()) {
  if (!resolvedAt) return REPORT_TTL_MS;
  return Math.max(0, Number(resolvedAt) + REPORT_TTL_MS - now);
}

/** `1d 22h`, `47h`, `12m` — short enough for a badge, precise enough to trust. */
export function formatRemaining(ms) {
  const remaining = Math.max(0, Number(ms) || 0);
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours >= 1) return `${hours}h`;
  return `${Math.max(1, minutes)}m`;
}

/** The same span in words, for the banner above a resolved thread. */
export function describeRemaining(ms) {
  const remaining = Math.max(0, Number(ms) || 0);
  if (remaining <= 0) return 'any moment now';

  /* Rounded to the hour: a report resolved a second ago has two days left,
     not "one day and 23h". */
  const totalHours = Math.max(1, Math.round(remaining / 3_600_000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days >= 1) {
    const dayPart = `${days} ${days === 1 ? 'day' : 'days'}`;
    return hours > 0 ? `${dayPart} and ${hours}h` : dayPart;
  }
  if (totalHours >= 1) return `${totalHours} ${totalHours === 1 ? 'hour' : 'hours'}`;
  return `${Math.max(1, Math.round(remaining / 60_000))} minutes`;
}

/** Should this resolved report be deleted now? */
export function isDueForDeletion(status, now = Date.now()) {
  if (!status || status.status !== 'resolved' || !status.resolvedAt) return false;
  return now - Number(status.resolvedAt) >= REPORT_TTL_MS;
}

/* ---- grouping --------------------------------------------------------- */

/**
 * Group every message about a report under one Report ID.
 *
 * The first pass learns which explicit id belongs to which subject, because a
 * reply usually carries only the subject (`Re: [Report: spam]`) while the
 * original printed `Report ID:` in its body. The second pass files every
 * message under that id, falling back to its own explicit id and finally to
 * the subject digest — the same digest the original would have used.
 */
export function groupIntoReportThreads(emails = [], { statuses = {}, now = Date.now() } = {}) {
  const messages = emails.filter((email) => email && email.id !== undefined && email.id !== null);

  const bySubject = new Map();
  const metadata = new Map();

  for (const message of messages) {
    const info = extractReportMetadata(message);
    metadata.set(message.id, info);
    const key = normaliseSubject(message.subject).toLowerCase();
    const existing = bySubject.get(key);
    /* An explicit id beats a digest, which is how a hash-derived original gets
       corrected once any message in its thread spells the id out. */
    if (!existing || (info.explicitId && existing === hashSubject(message.subject))) {
      bySubject.set(key, info.reportId);
    }
  }

  const buckets = new Map();
  for (const message of messages) {
    const info = metadata.get(message.id);
    const key = normaliseSubject(message.subject).toLowerCase();
    const reportId = bySubject.get(key) || info.reportId || hashSubject(message.subject);

    const bucket = buckets.get(reportId) || {
      key: `report:${reportId}`,
      reportId,
      shortId: shortReportId(reportId),
      emails: [],
      meta: null,
    };
    bucket.emails.push(message);
    /* The original report carries the fullest metadata; keep the first with
       a reason, a reporter, or an author rather than whichever came last. */
    const score = (value) =>
      (value?.reason ? 2 : 0) + (value?.reporterEmail ? 2 : 0) + (value?.authorTag ? 1 : 0);
    if (!bucket.meta || score(info) > score(bucket.meta)) {
      bucket.meta = { ...info, reportId, shortId: shortReportId(reportId) };
    }
    buckets.set(reportId, bucket);
  }

  const threads = [...buckets.values()].map((bucket) => {
    const ordered = [...bucket.emails].sort((a, b) => {
      const left = Date.parse(a.created_at) || 0;
      const right = Date.parse(b.created_at) || 0;
      return left - right;
    });
    const latest = ordered[ordered.length - 1];
    const folders = ordered.reduce((counts, message) => {
      const folder = message.folder || 'inbox';
      counts[folder] = (counts[folder] || 0) + 1;
      return counts;
    }, {});

    const status = resolveReportStatus(bucket.reportId, ordered, statuses);
    const remaining = status.status === 'resolved'
      ? timeUntilDeletion(status.resolvedAt, now)
      : 0;

    return {
      key: bucket.key,
      reportId: bucket.reportId,
      shortId: bucket.shortId,
      subject: bucket.meta?.subject && bucket.meta.subject !== NO_SUBJECT
        ? bucket.meta.subject
        : normaliseSubject(latest?.subject),
      emails: ordered,
      latest,
      count: ordered.length,
      folders,
      unread: ordered.filter((m) => !m.is_read && (m.folder || 'inbox') === 'inbox').length,
      meta: bucket.meta || extractReportMetadata(latest),
      status: status.status,
      resolvedAt: status.resolvedAt,
      closedAt: status.closedAt,
      remaining,
    };
  });

  return threads.sort((a, b) => {
    const left = Date.parse(b.latest?.created_at) || 0;
    const right = Date.parse(a.latest?.created_at) || 0;
    return left - right;
  });
}

/** The status pill classes for a report, as the design system spells them. */
export const STATUS_STYLES = {
  active: {
    label: 'Active',
    className: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  resolved: {
    label: 'Resolved',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  closed: {
    label: 'Closed',
    className: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  },
};

/* ---- the resolution email -------------------------------------------- */

/** The body sent to a reporter when their report is resolved. */
export function buildResolutionEmailHtml({
  reportId = '',
  reason = '',
  reporterName = '',
  reporterTag = '',
  authorTag = '',
  now = Date.now(),
} = {}) {
  const greeting = reporterName || reporterTag || 'there';
  const author = authorTag || 'an Agora user';
  const reported = reason || 'a community report';

  return [
    `<!-- AGORA_REPORT_STATUS:RESOLVED:${now} -->`,
    `<!-- AGORA_REPORT_ID:${reportId} -->`,
    `<p>Hi <strong>${escapeText(greeting)}</strong>,</p>`,
    `<p>This is a message from the <strong>Agora Team</strong>. We are writing to let you know that we have reviewed and <strong>resolved</strong> your report regarding the post by <strong>${escapeText(author)}</strong>.</p>`,
    '<div style="margin: 18px 0; padding: 14px 18px; background-color: #161826; border-left: 3px solid #10B981; border-radius: 6px; font-size: 13.5px; color: #E2E8F0;">',
    `  <div><strong>Report ID:</strong> <span style="font-family: monospace;">#${escapeText(reportId)}</span></div>`,
    `  <div style="margin-top: 4px;"><strong>Reported Reason:</strong> ${escapeText(reported)}</div>`,
    '  <div style="margin-top: 4px;"><strong>Status:</strong> <span style="color: #34D399; font-weight: 700;">Resolved ✓</span></div>',
    '</div>',
    '<p>Thank you for helping us keep Agora a safe, thoughtful town square for free speech. If you have any additional questions or context to share, you can reply directly to this email.</p>',
    '<p style="margin-top: 16px;">Warm regards,<br/><strong>The Agora Team</strong></p>',
  ].join('\n');
}

/** The same message as plain text, for the part clients preview. */
export function buildResolutionEmailText({
  reportId = '',
  reason = '',
  reporterName = '',
  reporterTag = '',
  authorTag = '',
} = {}) {
  const greeting = reporterName || reporterTag || 'there';
  const author = authorTag || 'an Agora user';
  return [
    `Hi ${greeting},`,
    '',
    `This is a message from the Agora Team. We have reviewed and resolved your report regarding the post by ${author}.`,
    '',
    `Report ID: #${reportId}`,
    `Reported Reason: ${reason || 'a community report'}`,
    'Status: Resolved',
    '',
    'Thank you for helping us keep Agora a safe, thoughtful town square for free speech. If you have any additional questions or context to share, you can reply directly to this email.',
    '',
    'Warm regards,',
    'The Agora Team',
  ].join('\n');
}

/** `Your Agora report (#2ace8130) has been reviewed and resolved by the Agora Team.` */
export function resolutionPreview(shortId) {
  return `Your Agora report (#${shortId}) has been reviewed and resolved by the Agora Team.`;
}

function escapeText(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Where a resolution goes: the reporter's address, cleaned of the robot. */
export function resolutionRecipient(thread) {
  const meta = thread?.meta || {};
  const address = extractEmailAddress(meta.reporterEmail || '');
  if (address && !SYSTEM_ADDRESSES.has(address.toLowerCase()) && !isNoReplyAddress(address)) {
    return address;
  }
  return '';
}
