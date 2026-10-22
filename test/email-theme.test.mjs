/* Dark reading surface: inbound mail has to stay legible once its white
   paper is replaced by the app's #121216 card. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  themeEmailHtml,
  parseColor,
  luminance,
  lightenForDark,
  darkenForCard,
  contrastRatio,
  CARD,
} from '../src/lib/emailTheme.js';

const contrast = contrastRatio;

const coloursIn = (html) => [...html.matchAll(/#[0-9a-f]{6}\b/gi)].map((match) => match[0]);

/* Declarations that set the *text* colour, which is what has to stay legible. */
const textColoursIn = (html) =>
  [...html.matchAll(/(?:^|[;"\s])color\s*:\s*(#[0-9a-f]{6})\b/gi)].map((match) => match[1]);

/* Declarations that paint a *surface*, which must not glare on the dark card. */
const surfaceColoursIn = (html) => [
  ...[...html.matchAll(/background(?:-color)?\s*:\s*(#[0-9a-f]{6})\b/gi)].map((m) => m[1]),
  ...[...html.matchAll(/bgcolor\s*=\s*["'](#[0-9a-f]{6})["']/gi)].map((m) => m[1]),
];

test('parses the colour formats mail actually ships', () => {
  assert.deepEqual(parseColor('#000'), { r: 0, g: 0, b: 0 });
  assert.deepEqual(parseColor('#121216'), { r: 18, g: 18, b: 22 });
  assert.deepEqual(parseColor('rgb(18, 18, 22)'), { r: 18, g: 18, b: 22 });
  assert.deepEqual(parseColor('rgba(0,0,0,0.5)'), { r: 0, g: 0, b: 0 });
  assert.deepEqual(parseColor('white'), { r: 255, g: 255, b: 255 });
  assert.equal(parseColor('inherit'), null);
  assert.equal(parseColor('rebeccapurple'), null);
});

test('dark text becomes light enough to read on the card', () => {
  for (const ink of ['#000000', '#1a1e23', '#333333', '#4b5563', '#555']) {
    const themed = themeEmailHtml(`<p style="color:${ink}">copy</p>`);
    const colour = parseColor(coloursIn(themed)[0]);
    assert.ok(
      contrast(colour, CARD) >= 4.5,
      `${ink} → ${coloursIn(themed)[0]} has contrast ${contrast(colour, CARD).toFixed(2)}`,
    );
  }
});

test('light text is left alone', () => {
  const themed = themeEmailHtml('<p style="color:#ffffff">copy</p>');
  assert.match(themed, /color:#ffffff/);
});

test('text that already reads on the card is left exactly as written', () => {
  /* Our own messages are authored dark: #a1a1aa muted grey and #f4f4f5 ink.
     Inverting them would flatten the hierarchy the sender designed. */
  const html = '<p style="color:#f4f4f5">ink</p><p style="color:#a1a1aa">muted</p>';
  assert.equal(themeEmailHtml(html), html);
});

test('the author’s hierarchy survives the flip', () => {
  const [body, secondary, footnote] = ['#000000', '#4b5563', '#6b7280'].map((ink) =>
    parseColor(themeEmailHtml(`<p style="color:${ink}">x</p>`).match(/#[0-9a-f]{6}/i)[0]),
  );
  const ratio = (rgb) => contrast(rgb, CARD);
  assert.ok(ratio(body) > ratio(secondary), 'body should out-shine secondary copy');
  assert.ok(ratio(secondary) > ratio(footnote), 'secondary copy should out-shine footnotes');
  assert.ok(ratio(footnote) >= 4.5, 'even the faintest grey must clear AA');
});

test('a violet link keeps its hue but is lifted for the card', () => {
  const themed = themeEmailHtml('<a style="color:#6d28d9">link</a>');
  const colour = parseColor(coloursIn(themed)[0]);
  assert.ok(contrast(colour, CARD) >= 4.5, `contrast ${contrast(colour, CARD).toFixed(2)}`);
  /* Still violet: blue channel leads, red next, green lowest. */
  assert.ok(colour.b > colour.g && colour.r > colour.g, JSON.stringify(colour));
});

test('white panels become dark ones, with a trace of their hue', () => {
  const white = themeEmailHtml('<td style="background-color:#ffffff">x</td>');
  assert.ok(!/#ffffff/i.test(white));
  const panel = parseColor(coloursIn(white)[0]);
  assert.ok(luminance(panel) < 0.05, 'panel should be dark');

  const lavender = themeEmailHtml('<td style="background-color:#f3eeff">x</td>');
  const tinted = parseColor(coloursIn(lavender)[0]);
  assert.ok(luminance(tinted) < 0.05);
  assert.ok(tinted.b > tinted.r, 'should keep the lavender cast');
});

test('backgrounds that are already dark are left alone', () => {
  const themed = themeEmailHtml('<td style="background-color:#000000">x</td>');
  assert.match(themed, /background-color:#000000/);
});

test('gradients and background images are not guessed at', () => {
  const gradient = themeEmailHtml('<td style="background:linear-gradient(90deg,#fff,#000)">x</td>');
  assert.match(gradient, /linear-gradient/);
  const image = themeEmailHtml('<td style="background:#ffffff url(hero.png)">x</td>');
  assert.match(image, /url\(hero\.png\)/);
});

test('pale hairlines stay visible; width and style are preserved', () => {
  const themed = themeEmailHtml('<td style="border:1px solid #e7ebf2">x</td>');
  assert.match(themed, /border:1px solid #[0-9a-f]{6}/i);
  assert.doesNotMatch(themed, /#e7ebf2/i);
  const [colour] = coloursIn(themed);
  assert.ok(luminance(parseColor(colour)) > 0.02, 'border should not vanish into the card');
});

test('bgcolor attributes are darkened too', () => {
  const themed = themeEmailHtml('<table><tr><td bgcolor="#ffffff">x</td></tr></table>');
  assert.doesNotMatch(themed, /bgcolor="#ffffff"/i);
});

test('<font color> is lifted too', () => {
  const themed = themeEmailHtml('<font color="#333333" face="Arial">x</font>');
  const [hex] = themed.match(/#[0-9a-f]{6}/i);
  assert.ok(contrast(parseColor(hex), CARD) >= 4.5);
  assert.match(themed, /face="Arial"/);
});

test('a full document is unwrapped so the reader owns the frame', () => {
  const themed = themeEmailHtml(
    '<!doctype html><html><head><title>News</title><style>p{color:#000}</style></head><body style="background:#fff"><p>Hello</p></body></html>',
  );
  assert.doesNotMatch(themed, /<html|<head|<body|<!doctype/i);
  assert.doesNotMatch(themed, /<title>|<style>/i);
  assert.match(themed, /<p>Hello<\/p>/);
});

test('single-quoted style attributes are handled', () => {
  const themed = themeEmailHtml("<p style='color:#000000'>x</p>");
  assert.doesNotMatch(themed, /#000000/);
});

test('a realistic light newsletter ends up readable', () => {
  const newsletter = `<div style="font-family:Arial,sans-serif;background-color:#ffffff;color:#000000">
    <h1 style="color:#111827;font-size:24px">Take 50% off</h1>
    <p style="color:#4b5563">Limited time offer for subscribers.</p>
    <a href="https://example.com" style="background-color:#7c3aed;color:#ffffff;padding:10px 20px">Claim</a>
    <table><tr><td style="border-top:1px solid #e5e7eb;color:#9ca3af">Unsubscribe</td></tr></table>
  </div>`;

  const themed = themeEmailHtml(newsletter);

  /* No near-black text and no white panel survives. */
  assert.doesNotMatch(themed, /color:#(000|111827|4b5563)/i);
  assert.doesNotMatch(themed, /background-color:#ffffff/i);

  /* Every resulting text colour clears AA against the card. */
  for (const hex of textColoursIn(themed)) {
    const ratio = contrast(parseColor(hex), CARD);
    assert.ok(ratio >= 4.5, `${hex} has contrast ${ratio.toFixed(2)} on #121216`);
  }

  /* Nothing left in the markup is a bright panel that would glare. */
  for (const hex of surfaceColoursIn(themed)) {
    assert.ok(
      luminance(parseColor(hex)) < 0.2,
      `${hex} is still a light surface`,
    );
  }
});

test('repeated runs are stable', () => {
  const html = '<p style="color:#333">x</p><td bgcolor="#ffffff">y</td>';
  const once = themeEmailHtml(html);
  assert.equal(themeEmailHtml(once), once);
});

test('helpers behave monotonically', () => {
  assert.ok(luminance(parseColor(lightenForDark(parseColor('#000')))) > 0.5);
  assert.ok(luminance(parseColor(darkenForCard(parseColor('#fff')))) < 0.05);
  assert.equal(darkenForCard(parseColor('#101010')), null);
});
