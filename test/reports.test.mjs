/* The moderation pipeline: reading a report out of a message, grouping every
   message about it under one Report ID, and the two-day life of a resolved
   report. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  REPORT_STATUS_KEY,
  REPORT_TTL_MS,
  buildResolutionEmailHtml,
  describeRemaining,
  extractReportMetadata,
  extractReporterIdentity,
  formatRemaining,
  groupIntoReportThreads,
  isDueForDeletion,
  isReportEmail,
  isReportRelated,
  loadReportStatuses,
  reportSubjectKeys,
  resolutionRecipient,
  resolveReportStatus,
  saveReportStatuses,
  shortReportId,
  statusFromMarker,
  timeUntilDeletion,
} from '../src/lib/reports.js';

const REPORT_ID = '2ace8130-9424-4eb7-ae4e-78119372f58a';

const report = (extra = {}) => ({
  id: 'r1',
  folder: 'inbox',
  subject: '[Report: spam]',
  from_address: 'Report by @jaybhaskar <noreply@agora.in.net>',
  to_address: 'mail@agora.in.net',
  created_at: '2026-10-20T09:00:00.000Z',
  is_read: true,
  html_body: `<div>
    <p>MODERATION REPORT</p>
    <p>Report #${REPORT_ID}</p>
    <p>Report by @jaybhaskar</p>
    <p>Name: Jayvardhan Bhaskar</p>
    <p>User Tag: @jaybhaskar</p>
    <p>Registered Email: jayvardhanbhaskar123@gmail.com</p>
    <p>Reason: Spam</p>
    <p>Reported post by @Avigyan</p>
    <p>https://agora.in.net/post/abc-123</p>
    <style>@import url("https://fonts.example/x.css");</style>
  </div>`,
  text_body:
    `MODERATION REPORT\nReport ID: ${REPORT_ID}\nReport by @jaybhaskar\n` +
    'Name: Jayvardhan Bhaskar\nRegistered Email: jayvardhanbhaskar123@gmail.com\nReason: Spam',
  ...extra,
});

const reply = (extra = {}) => ({
  id: 'r2',
  folder: 'sent',
  subject: 'Re: [Report: spam]',
  from_address: 'Agora <mail@agora.in.net>',
  to_address: 'jayvardhanbhaskar123@gmail.com',
  created_at: '2026-10-21T10:00:00.000Z',
  is_read: true,
  html_body: '<p>Thanks, looking into it.</p>',
  text_body: 'Thanks, looking into it.',
  ...extra,
});

/* ---- identity -------------------------------------------------------- */

test('the reporter is read from the body, never from a stylesheet', () => {
  const identity = extractReporterIdentity(report());
  assert.equal(identity.displayName, 'Jayvardhan Bhaskar (@jaybhaskar)');
  assert.equal(identity.userTag, '@jaybhaskar');
  assert.equal(identity.email, 'jayvardhanbhaskar123@gmail.com');
});

test('a stylesheet full of at-rules never becomes a reporter', () => {
  const cssOnly = report({
    from_address: 'noreply@agora.in.net',
    subject: '[Report: spam]',
    html_body:
      '<style>@import url(a.css); @media (min-width: 1px) { body { color: red } }</style><p>Report</p>',
    text_body: '',
  });
  const identity = extractReporterIdentity(cssOnly);
  assert.equal(identity.userTag, '');
});

/* ---- metadata -------------------------------------------------------- */

test('an explicit Report ID beats a subject digest', () => {
  const meta = extractReportMetadata(report());
  assert.equal(meta.reportId, REPORT_ID);
  assert.equal(meta.explicitId, true);
  assert.equal(meta.shortId, '2ace8130');
  assert.equal(meta.reason, 'spam');
  assert.equal(meta.reporterTag, '@jaybhaskar');
  assert.equal(meta.authorTag, '@Avigyan');
  assert.equal(meta.postUrl, 'https://agora.in.net/post/abc-123');
  assert.equal(meta.reporterEmail, 'jayvardhanbhaskar123@gmail.com');
});

test('a report without an id gets a stable one from its subject', () => {
  const first = extractReportMetadata({ subject: '[Report: spam]', html_body: '<p>Report</p>' });
  const second = extractReportMetadata({ subject: 'Re: [Report: spam]', html_body: '<p>Report</p>' });
  assert.equal(first.explicitId, false);
  assert.match(first.reportId, /^[a-f0-9]{8}$/);
  assert.equal(first.reportId, second.reportId);
  assert.equal(shortReportId(first.reportId), first.reportId);
});

test('system mailboxes are never the reporter', () => {
  const meta = extractReportMetadata({
    subject: '[Report: spam]',
    html_body:
      '<p>Report</p><a href="mailto:noreply@agora.in.net">noreply</a>' +
      '<p>Registered Email: mail@agora.in.net</p>',
  });
  assert.equal(meta.reporterEmail, '');
  assert.equal(resolutionRecipient({ meta }), '');
});

/* ---- detection and grouping ------------------------------------------ */

test('reports are recognised by subject, sender and body', () => {
  assert.equal(isReportEmail(report()), true);
  assert.equal(isReportEmail({ subject: 'Report ID: 2ace8130' }), true);
  assert.equal(isReportEmail({ from_address: 'Agora Moderation <x@agora.in.net>' }), true);
  /* A reply keeps `[Report: …]`, so it belongs to the pipeline too. */
  assert.equal(isReportEmail(reply()), true);
  assert.equal(isReportEmail({ subject: 'Lunch', html_body: '<p>hi</p>' }), false);
});

test('every message about a report shares one id, replies included', () => {
  const threads = groupIntoReportThreads([report(), reply()]);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].reportId, REPORT_ID);
  assert.equal(threads[0].count, 2);
  assert.equal(threads[0].status, 'active');
  assert.equal(threads[0].subject, '[Report: spam]');
  /* Oldest first inside the stack. */
  assert.deepEqual(
    threads[0].emails.map((email) => email.id),
    ['r1', 'r2'],
  );
});

test('a reply is claimed by the report whose subject it answers', () => {
  const keys = reportSubjectKeys([report()]);
  assert.equal(isReportRelated(reply(), keys), true);
  assert.equal(isReportRelated({ subject: 'Re: lunch', html_body: '<p>hi</p>' }, keys), false);
});

/* ---- lifecycle ------------------------------------------------------- */

test('resolved status is read back from the hidden marker', () => {
  const marker = `<!-- AGORA_REPORT_STATUS:RESOLVED:${Date.parse('2026-10-21T10:00:00.000Z')} -->`;
  assert.deepEqual(statusFromMarker(marker), {
    status: 'resolved',
    at: Date.parse('2026-10-21T10:00:00.000Z'),
  });

  const threads = groupIntoReportThreads([report(), reply({ html_body: `<p>done</p>${marker}` })]);
  assert.equal(threads[0].status, 'resolved');
  assert.equal(threads[0].resolvedAt, Date.parse('2026-10-21T10:00:00.000Z'));
});

test('a decision made here outranks an older marker', () => {
  const at = Date.parse('2026-10-21T10:00:00.000Z');
  const messages = [{ html_body: `<!-- AGORA_REPORT_STATUS:RESOLVED:${at} -->` }];

  /* Reopened after the marker was written. */
  const reopened = resolveReportStatus(REPORT_ID, messages, {
    [REPORT_ID]: { status: 'active', resolvedAt: 0, closedAt: 0, updatedAt: at + 1000 },
  });
  assert.equal(reopened.status, 'active');

  /* A newer decision from another device still arrives. */
  const across = resolveReportStatus(REPORT_ID, messages, {
    [REPORT_ID]: { status: 'active', resolvedAt: 0, closedAt: 0, updatedAt: at - 1000 },
  });
  assert.equal(across.status, 'resolved');
});

test('the status store survives bad input and a locked-down window', () => {
  assert.deepEqual(loadReportStatuses(null), {});
  assert.deepEqual(loadReportStatuses({ getItem: () => '{not json' }), {});

  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  const statuses = { [REPORT_ID]: { status: 'closed', closedAt: 1 } };
  saveReportStatuses(storage, statuses);
  assert.equal(memory.has(REPORT_STATUS_KEY), true);
  assert.deepEqual(loadReportStatuses(storage), statuses);
});

test('a resolved report is deleted exactly two days later', () => {
  const resolvedAt = Date.parse('2026-10-21T10:00:00.000Z');
  const status = { status: 'resolved', resolvedAt };

  assert.equal(isDueForDeletion({ status: 'active', resolvedAt }, resolvedAt + REPORT_TTL_MS), false);
  assert.equal(isDueForDeletion(status, resolvedAt + REPORT_TTL_MS - 1000), false);
  assert.equal(isDueForDeletion(status, resolvedAt + REPORT_TTL_MS), true);

  assert.equal(timeUntilDeletion(resolvedAt, resolvedAt + 3_600_000), REPORT_TTL_MS - 3_600_000);
  assert.equal(formatRemaining(47 * 3_600_000), '1d 23h');
  assert.equal(describeRemaining(2 * 86_400_000), '2 days');
  assert.equal(describeRemaining(45 * 3_600_000), '1 day and 21h');
});

/* ---- the resolution email -------------------------------------------- */

test('the resolution email carries both markers and no double branding', () => {
  const now = Date.parse('2026-10-22T12:00:00.000Z');
  const html = buildResolutionEmailHtml({
    reportId: REPORT_ID,
    reason: 'Spam',
    reporterName: 'Jayvardhan Bhaskar',
    reporterTag: '@jaybhaskar',
    now,
  });

  assert.match(html, /^<!-- AGORA_REPORT_STATUS:RESOLVED:\d{13} -->/);
  assert.match(html, new RegExp(`<!-- AGORA_REPORT_ID:${REPORT_ID} -->`));
  assert.match(html, /Resolved ✓/);
  assert.match(html, /#161826/);
  assert.match(html, /emerald|10b981|34d399|6ee7b7/i);
  assert.match(html, /Spam/);
  /* The worker supplies the header and footer, so the body adds neither. */
  assert.doesNotMatch(html, /<img/i);
});

test('the short id is what the preview and the card show', () => {
  assert.equal(shortReportId(REPORT_ID), '2ace8130');
  assert.equal(shortReportId('#2ace8130'), '2ace8130');
  assert.equal(shortReportId(''), 'unknown');
});
