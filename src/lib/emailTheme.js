/* ============================================================
   Dark-surface email theming.

   Mail is authored for a white background: near-black text, white cards,
   pale hairlines. Dropping that markup onto a dark reading surface as-is
   produces black text on a black card. Rather than force a white card into
   a dark app, the markup is transcoded: dark text becomes light, white
   panels become dark ones, pale hairlines become visible ones — hue and
   saturation are kept, so a violet headline stays violet.

   Only inline presentation and `bgcolor` attributes are touched, which is
   what mail actually ships. Images are left alone; the outer CSS handles
   the rest.
   ============================================================ */

const NAMED_COLORS = {
  black: { r: 0, g: 0, b: 0 },
  white: { r: 255, g: 255, b: 255 },
  gray: { r: 128, g: 128, b: 128 },
  grey: { r: 128, g: 128, b: 128 },
  silver: { r: 192, g: 192, b: 192 },
  red: { r: 255, g: 0, b: 0 },
  maroon: { r: 128, g: 0, b: 0 },
  green: { r: 0, g: 128, b: 0 },
  olive: { r: 128, g: 128, b: 0 },
  blue: { r: 0, g: 0, b: 255 },
  navy: { r: 0, g: 0, b: 128 },
  teal: { r: 0, g: 128, b: 128 },
  purple: { r: 128, g: 0, b: 128 },
  fuchsia: { r: 255, g: 0, b: 255 },
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** The reader card this markup will sit on: #121216. */
export const CARD = { r: 18, g: 18, b: 22 };

/** Parse `#rgb`, `#rrggbb`, `rgb()`, `rgba()` or a basic named colour. */
export function parseColor(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const hex = raw.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      digits = digits
        .slice(0, 3)
        .split('')
        .map((character) => character + character)
        .join('');
    } else if (digits.length === 6 || digits.length === 8) {
      digits = digits.slice(0, 6);
    } else {
      return null;
    }
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
    };
  }

  const rgb = raw.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  }

  return NAMED_COLORS[raw.toLowerCase()] || null;
}

/** WCAG relative luminance, 0 (black) → 1 (white). */
export function luminance({ r, g, b }) {
  const channel = (value) => {
    const unit = value / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two parsed colours, 1 → 21. */
export function contrastRatio(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  const [light, dark] = first > second ? [first, second] : [second, first];
  return (light + 0.05) / (dark + 0.05);
}

function rgbToHsl({ r, g, b }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l: lightness };

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let hue;
  if (max === red) hue = ((green - blue) / delta + (green < blue ? 6 : 0)) / 6;
  else if (max === green) hue = ((blue - red) / delta + 2) / 6;
  else hue = ((red - green) / delta + 4) / 6;

  return { h: hue, s: saturation, l: lightness };
}

function hslToHex(h, s, l) {
  const hueToRgb = (p, q, t) => {
    let unit = t;
    if (unit < 0) unit += 1;
    if (unit > 1) unit -= 1;
    if (unit < 1 / 6) return p + (q - p) * 6 * unit;
    if (unit < 1 / 2) return q;
    if (unit < 2 / 3) return p + (q - p) * (2 / 3 - unit) * 6;
    return p;
  };

  let red;
  let green;
  let blue;

  if (s === 0) {
    red = green = blue = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    red = hueToRgb(p, q, h + 1 / 3);
    green = hueToRgb(p, q, h);
    blue = hueToRgb(p, q, h - 1 / 3);
  }

  const toHex = (value) =>
    Math.round(clamp(value, 0, 1) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

/**
 * A readable light tone for text that was authored dark.
 *
 * The mapping is inverted and compressed: the darker the original, the
 * brighter the result. Near-black body copy ends up brightest, a mid-grey
 * footnote stays dimmer, so the author's hierarchy survives the flip instead
 * of every tone collapsing onto one white.
 */
export function lightenForDark(rgb) {
  const { h, s, l } = rgbToHsl(rgb);

  /* Near-greys become true greys: tinting body copy would look ill. */
  if (s < 0.16) return hslToHex(0, 0, clamp(0.94 - 0.62 * l, 0.62, 0.94));

  /* Coloured text keeps its hue, brightened enough to read on #121216. */
  return hslToHex(h, clamp(s * 0.8 + 0.1, 0.2, 0.72), clamp(0.92 - 0.34 * l, 0.6, 0.9));
}

/** A dark panel for a background that was authored light. */
export function darkenForCard(rgb) {
  const { h, s, l } = rgbToHsl(rgb);

  /* White and paper tints become the card itself, with a hint of the hue so
     a lavender panel still reads as lavender-tinted. */
  if (l > 0.92) return hslToHex(h, Math.min(s, 0.22), 0.085);

  /* Mid-tone panels (callouts, table headers) become raised surfaces. */
  if (l > 0.5) return hslToHex(h, Math.min(s, 0.5), 0.14);

  return null;
}

/** A hairline that stays visible on the dark card. */
export function borderForDark(rgb) {
  const { h, s } = rgbToHsl(rgb);
  return hslToHex(h, Math.min(s, 0.18), 0.24);
}

const isOpaqueColor = (value) =>
  Boolean(parseColor(value)) && !/^(transparent|inherit|initial|currentcolor)$/i.test(value.trim());

/** Rewrite one declaration list (the contents of a `style` attribute). */
function transformDeclarations(css) {
  return String(css)
    .split(';')
    .map((declaration) => {
      const match = declaration.match(/^(\s*)([-a-z]+)(\s*:\s*)(.+?)(\s*)$/i);
      if (!match) return declaration;

      const [, lead, rawProperty, colon, rawValue, tail] = match;
      const property = rawProperty.toLowerCase();
      const value = rawValue.trim();

      if (property === 'color') {
        const rgb = isOpaqueColor(value) ? parseColor(value) : null;

        /* Already legible on the card? Leave the author's choice alone — our
           own messages ship their own light-on-dark palette. */
        if (rgb && contrastRatio(rgb, CARD) < 4.5) {
          return `${lead}${rawProperty}${colon}${lightenForDark(rgb)}${tail}`;
        }
        return declaration;
      }

      if (property === 'background' || property === 'background-color') {
        /* Gradients and images are left to themselves — inverting them is
           guesswork, and they usually still read on a dark card. */
        if (/url\(|gradient/i.test(value)) return declaration;
        const rgb = isOpaqueColor(value) ? parseColor(value) : null;
        if (rgb) {
          const dark = darkenForCard(rgb);
          if (dark) return `${lead}${rawProperty}${colon}${dark}${tail}`;
        }
        return declaration;
      }

      if (/^border(-(top|right|bottom|left))?(-color)?$/.test(property)) {
        if (/^(none|0)\b/i.test(value)) return declaration;

        /* Shorthand: rewrite only the colour token, keep width and style. */
        const tokens = value.split(/\s+/);
        const colourIndex = tokens.findIndex((token) => parseColor(token));
        if (colourIndex === -1) return declaration;

        const rgb = parseColor(tokens[colourIndex]);
        if (luminance(rgb) <= 0.5) return declaration;

        tokens[colourIndex] = borderForDark(rgb);
        return `${lead}${rawProperty}${colon}${tokens.join(' ')}${tail}`;
      }

      return declaration;
    })
    .join(';');
}

/**
 * Prepare inbound mail for the app's dark reading card.
 *
 * @param {string} html Raw (already sanitised) message HTML.
 * @returns {string} Markup that reads correctly on #121216.
 */
export function themeEmailHtml(html = '') {
  return String(html)
    /* A stored message may be a whole document — our own Sent mail is. Keep
       the content and let the reader's card be the only frame. */
    .replace(/<!doctype\b[^>]*>/gi, '')
    .replace(/<head\b[\s\S]*?<\/head>/gi, '')
    .replace(/<\/?(?:html|body)\b[^>]*>/gi, '')
    .replace(/\sstyle\s*=\s*"([^"]*)"/gi, (_, css) => ` style="${transformDeclarations(css)}"`)
    .replace(/\sstyle\s*=\s*'([^']*)'/gi, (_, css) => ` style="${transformDeclarations(css)}"`)
    .replace(/\sbgcolor\s*=\s*(["'])([^"']+)\1/gi, (match, quote, colour) => {
      const rgb = isOpaqueColor(colour) ? parseColor(colour) : null;
      if (!rgb) return match;
      const dark = darkenForCard(rgb);
      return dark ? ` bgcolor="${dark}"` : match;
    })
    /* `<font color>` is the oldest way to set text colour, and still turns up
       in marketing mail. */
    .replace(/<font\b[^>]*>/gi, (tag) =>
      tag.replace(/\scolor\s*=\s*(["'])([^"']+)\1/i, (match, quote, colour) => {
        const rgb = isOpaqueColor(colour) ? parseColor(colour) : null;
        if (!rgb || contrastRatio(rgb, CARD) >= 4.5) return match;
        return ` color="${lightenForDark(rgb)}"`;
      }),
    );
}
