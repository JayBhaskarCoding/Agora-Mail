/* ============================================================
   Formatting helpers shared by the mail list, reader and composer.
   ============================================================ */

/**
 * Pull the bare address out of `"Name <name@domain>"`.
 * Returns the input trimmed when it is already an address.
 */
export function extractEmailAddress(value = '') {
  const raw = String(value || '').trim();
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1].trim() : raw;
}

/**
 * Split an RFC 5322-ish mailbox string into its parts.
 * `display` is the safest single-line label for the UI.
 */
export function parseAddress(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return { name: '', address: '', display: 'Unknown sender' };

  const match = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].replace(/^["']|["']$/g, '').trim();
    const address = match[2].trim();
    return { name, address, display: name || address };
  }

  return { name: '', address: raw, display: raw };
}

export function displayName(value = '') {
  return parseAddress(value).display;
}

/** One or two initials for the avatar bubble. */
export function initials(value = '') {
  const { name, address, display } = parseAddress(value);
  const source = name || address || display;
  if (!source) return '?';
  if (!name && source.includes('@')) return source.charAt(0).toUpperCase();

  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part.charAt(0)).join('');
  return (letters || source.charAt(0)).toUpperCase();
}

/** Compact stamp for a list row: time today, date this year, year beyond. */
export function formatListTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Full stamp for the reader header. */
export function formatFullTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Collapse whitespace so a snippet never inherits the mail's line breaks. */
export function snippet(value, max = 240) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'No message body.';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).trimEnd()}…`;
}

/** File sizes for the composer's attachment chips. */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Escape user-typed text before it becomes the HTML of an outgoing mail. */
export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
