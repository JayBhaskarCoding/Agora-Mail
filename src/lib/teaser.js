/* ============================================================
   Inbox teaser.

   Mail clients build the inbox line from a hidden preheader and then keep
   filling it with the opening of the body. A preheader that repeats the
   body therefore reads as a stutter — "Do you see this content… Do you see
   this content…" — and the same line is stored on the Sent row.

   This module writes a teaser *about* the message instead of a copy of its
   first words: a later sentence when there is one, and otherwise a short
   description built from the subject and the shape of the message. The
   result never opens with the body's opening, and it is capped so the
   preheader stays one line.
   ============================================================ */

/** Longest teaser we send. Gmail's inbox line is a little longer than this. */
export const TEASER_LIMIT = 90;

/* A greeting is noise in a preview, and it hides the sentence that actually
   starts the message. */
const GREETING = /^(hi|hello|hey|dear|greetings)\b[^,.:!]*[,.:!]?\s*/i;
const CONNECTIVE = /^(and|but|so|also|then|plus|anyway|however)[,\s]+/i;
const SUBJECT_PREFIX = /^((re|fwd?)\s*:\s*)+/i;
const PLAIN = /[^a-z0-9 ]/gi;

const collapse = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** Sentences, keeping a final fragment that has no punctuation. */
function sentencesOf(text) {
  const matched = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  return matched.map((sentence) => sentence.trim()).filter(Boolean);
}

/** The message without its greeting, so teasers compare against real content. */
function coreOf(text) {
  const clean = collapse(text);
  const stripped = collapse(clean.replace(GREETING, ''));
  return stripped || clean;
}

/** The subject with reply/forward prefixes removed; used to name the message. */
function topicFrom(subject, max = 48) {
  const topic = collapse(subject).replace(SUBJECT_PREFIX, '').trim();
  if (!topic) return 'your message';
  if (topic.length <= max) return topic;
  const cut = topic.slice(0, max);
  const boundary = cut.lastIndexOf(' ');
  return (boundary > 20 ? cut.slice(0, boundary) : cut).replace(/[\s,;:.\-–—]+$/, '');
}

/** Does `candidate` open with the same words as the body it summarises? */
function sharesOpening(candidate, opening) {
  const body = collapse(opening).toLowerCase().replace(PLAIN, ' ').replace(/\s+/g, ' ').trim();
  const teaser = collapse(candidate).toLowerCase().replace(PLAIN, ' ').replace(/\s+/g, ' ').trim();
  if (!body || !teaser) return false;
  if (body.startsWith(teaser) || teaser.startsWith(body)) return true;

  const firstWords = body.split(' ').slice(0, 4).join(' ');
  return firstWords.split(' ').length >= 3 && teaser.startsWith(firstWords);
}

/** Cut at a word boundary so the teaser never ends mid-word. */
function fit(text, max = TEASER_LIMIT) {
  const clean = collapse(text);
  if (clean.length <= max) return clean;

  const cut = clean.slice(0, max - 1);
  const boundary = cut.lastIndexOf(' ');
  const body = (boundary > 30 ? cut.slice(0, boundary) : cut).replace(/[\s,;:.\-–—]+$/, '');
  return `${body}…`;
}

/** A teaser that describes the message without quoting it. */
function shapeTeaser({ topic, words, isReply, attachments }) {
  const files =
    attachments > 0 ? `${attachments} attachment${attachments === 1 ? '' : 's'}` : '';

  if (isReply) return `Reply regarding ${topic}${files ? ` · ${files}` : ''}`;
  if (files) return `Includes ${files}`;
  if (words <= 12) return `A short note about ${topic}`;
  if (words <= 40) return `A note about ${topic}`;
  return `An update on ${topic}`;
}

/**
 * Build the inbox teaser for an outgoing message.
 *
 * @param {string}  body           What the sender typed.
 * @param {string}  subject        The subject line, reply prefixes and all.
 * @param {boolean} [isReply]      True when this answers an existing message.
 * @param {number}  [attachments]  How many files ride along.
 * @returns {string} A one-line teaser, at most `TEASER_LIMIT` characters.
 */
export function generateAutoTeaser(body, subject, isReply = false, attachments = 0) {
  const clean = collapse(body);
  const reply = Boolean(isReply);
  const files = Math.max(0, Math.floor(Number(attachments) || 0));
  const topic = topicFrom(subject);
  const words = clean ? clean.split(' ').length : 0;

  if (!clean) return fit(shapeTeaser({ topic, words, isReply: reply, attachments: files }));

  const core = coreOf(clean);
  const sentences = sentencesOf(core);
  const opening = sentences[0] || core;

  /* Prefer a later sentence: it is genuinely about the message and, by
     construction, is not the words the body opens with. */
  for (let index = 1; index < sentences.length; index += 1) {
    const sentence = sentences[index].replace(CONNECTIVE, '').trim();
    if (sentence.length < 16) continue;
    if (sharesOpening(sentence, opening)) continue;
    return fit(sentence);
  }

  /* One sentence long — describe it from the outside instead. */
  return fit(shapeTeaser({ topic, words, isReply: reply, attachments: files }));
}
