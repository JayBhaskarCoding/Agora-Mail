/* ============================================================
   Outgoing-mail contract tests.

   `npm test` renders the real message fragment from lib/mailTemplate.js,
   posts it through both
     - the worker as deployed on Cloudflare (test/deployed-worker.mjs), and
     - the improved worker in the repo (worker/agora-mail-sender.js),
   intercepting Resend and Supabase, then asserts on what would be sent.

   The point is that the frontend keeps working against the *deployed*
   worker: the in-repo worker is an optional upgrade, not a dependency.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import deployedWorker from './deployed-worker.mjs';
import repoWorker from '../worker/agora-mail-sender.js';
import { buildMessageBody, buildMessageText, MAIL_BRAND } from '../src/lib/mailTemplate.js';

const env = {
  RESEND_API_KEY: 'test-key',
  SUPABASE_URL: 'https://mock.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-role',
};

const realFetch = globalThis.fetch;

/** Run a worker once, capturing the Resend payload and the stored row. */
async function deliver(worker, message) {
  let resend = null;
  let stored = null;

  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.includes('api.resend.com')) {
      resend = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: 'mock-resend-id' }), { status: 200 });
    }
    if (target.includes('/rest/v1/emails')) {
      stored = JSON.parse(init.body);
      return new Response('', { status: 201 });
    }
    throw new Error(`unexpected request: ${target}`);
  };

  try {
    const response = await worker.fetch(
      new Request('https://worker.test/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'recipient@example.com',
          customFrom: 'mail@agora.in.net',
          senderName: 'Agora Mail',
          ...message,
        }),
      }),
      env,
    );
    return { status: response.status, body: await response.json(), resend, stored };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const BODY = `Hi Jay,

First paragraph with something worth reading.

Second paragraph.

— Jayvardhan`;

const REPLY_TO = {
  from_address: 'Ananya Rao <ananya@agora.in.net>',
  created_at: '2026-10-20T09:12:00Z',
  text_body: 'Are we still on for Saturday? I can do any time after ten.',
  html_body: '',
};

/* ---- the fragment itself ---------------------------------------------- */

test('the fragment is content only, never a document', () => {
  const html = buildMessageBody({ body: BODY });
  assert.doesNotMatch(html, /<!doctype|<html|<head|<body|<style/i);
  assert.match(html, /<p style="/);
  assert.equal(buildMessageText({ body: BODY }), BODY);
});

test('paragraphs are separated by newlines that survive tag-stripping', () => {
  const html = buildMessageBody({ body: BODY });
  /* The deployed worker builds text/plain by deleting tags, so whitespace
     between block elements is the only thing that keeps paragraphs apart. */
  const stripped = html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>?/gm, '');
  assert.match(stripped, /Hi Jay,\s*\n\s*\n\s*First paragraph/);
  assert.match(stripped, /Second paragraph\.\s*\n\s*\n\s*— Jayvardhan/);
});

test('the reply quote carries the exact marker the worker splits on', () => {
  const html = buildMessageBody({ body: 'Saturday works.', replyingTo: REPLY_TO });
  /* The deployed worker does html.split('<div data-reply-quote="true"').
     The literal has to appear exactly, attribute first, no space between
     the tag name and the attribute. */
  assert.ok(html.includes('<div data-reply-quote="true"'));
  assert.ok(html.split('<div data-reply-quote="true"')[0].includes('Saturday works.'));
  assert.ok(!html.split('<div data-reply-quote="true"')[0].includes('Are we still on'));
});

/* ---- against the worker that is actually deployed ---------------------- */

test('deployed worker: the message is wrapped once, not twice', async () => {
  const html = buildMessageBody({ body: BODY });
  const { resend, body } = await deliver(deployedWorker, {
    subject: 'Testing',
    html,
    text: buildMessageText({ body: BODY }),
  });

  assert.ok(resend, `no mail captured: ${JSON.stringify(body)}`);
  assert.equal((resend.html.match(/<!DOCTYPE html>/gi) || []).length, 1);
  assert.equal((resend.html.match(/<body/gi) || []).length, 1);
  /* One card: the worker's own. The client no longer ships a second one. */
  assert.equal((resend.html.match(/background-color: #121216/g) || []).length, 1);
  assert.equal((resend.html.match(/Sent securely via Agora Mail/g) || []).length, 1);
  assert.equal((resend.html.match(/>agora<span/g) || []).length, 1);
});

test('deployed worker: no stylesheet leaks into the message', async () => {
  const html = buildMessageBody({ body: BODY });
  const { resend } = await deliver(deployedWorker, { subject: 'S', html, text: 'x' });
  assert.doesNotMatch(resend.html, /!important/);
  assert.doesNotMatch(resend.html, /font-family:Arial/);
});

test('deployed worker: the plain-text part keeps its paragraphs', async () => {
  const html = buildMessageBody({ body: BODY });
  const { resend } = await deliver(deployedWorker, { subject: 'S', html, text: 'x' });
  /* This worker ignores the `text` field and derives its own; newlines in
     the fragment are what make that derivation readable. */
  assert.match(resend.text, /Hi Jay,/);
  assert.match(resend.text, /First paragraph[\s\S]*\n\s*\n[\s\S]*Second paragraph/);
  assert.doesNotMatch(resend.text, /<[a-z/]/i);
});

test('deployed worker: a reply previews the reply, not the thread', async () => {
  const html = buildMessageBody({ body: 'Saturday works.', replyingTo: REPLY_TO });
  const { resend } = await deliver(deployedWorker, {
    subject: 'Re: Weekend plans',
    html,
    text: buildMessageText({ body: 'Saturday works.', replyingTo: REPLY_TO }),
  });

  const preheader = resend.html
    .match(/display: none[\s\S]*?<\/div>/)[0]
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#8203;|\u200b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  assert.match(preheader, /Saturday works\./);
  assert.ok(!preheader.includes('Are we still on'), preheader);
  assert.ok(!/&lt;|<\/?div/i.test(preheader), 'tag debris in the preheader');
});

test('deployed worker: the preview text is used verbatim when supplied', async () => {
  const html = buildMessageBody({ body: BODY });
  const { resend } = await deliver(deployedWorker, {
    subject: 'S',
    html,
    text: 'x',
    previewText: 'The build is green — see you at ten',
  });
  assert.match(resend.html, /The build is green — see you at ten/);
});

/* ---- against the in-repo worker --------------------------------------- */

test('repo worker: same fragment, one shell, clean text part', async () => {
  const html = buildMessageBody({ body: BODY });
  const text = buildMessageText({ body: BODY });
  const { resend, stored } = await deliver(repoWorker, { subject: 'Testing', html, text });

  assert.equal((resend.html.match(/<!doctype html>/gi) || []).length, 1);
  assert.equal((resend.html.match(/<body/gi) || []).length, 1);
  assert.equal(resend.text, text);
  assert.doesNotMatch(resend.text, /font-family|!important|<[a-z/]/i);
  /* This worker records the body, so the Sent list previews the message. */
  assert.match(stored.text_body, /First paragraph/);
  assert.doesNotMatch(stored.text_body, /&#8203;/);
});

test('repo worker: reply preheader stops at the quote', async () => {
  const html = buildMessageBody({ body: 'Saturday works.', replyingTo: REPLY_TO });
  const { resend } = await deliver(repoWorker, {
    subject: 'Re: Weekend plans',
    html,
    text: buildMessageText({ body: 'Saturday works.', replyingTo: REPLY_TO }),
  });
  const preheader = resend.html.match(/display:none[^>]*>([\s\S]*?)<\/div>/)[1]
    .replace(/&#8203;|&nbsp;|\u200b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  assert.ok(preheader.startsWith('Saturday works.'), preheader);
});

test('both workers: the quoted original is sanitised', () => {
  const html = buildMessageBody({
    body: 'ok',
    replyingTo: {
      ...REPLY_TO,
      html_body: '<p onclick="steal()">hi</p><script>evil()</script><a href="javascript:evil()">x</a>',
    },
  });
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /onclick/i);
  assert.doesNotMatch(html, /javascript:/i);
  assert.equal(MAIL_BRAND.quoteRule, '#6D5BD0');
});
