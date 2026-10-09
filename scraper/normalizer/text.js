/** Collapse all whitespace (incl. non-breaking and zero-width spaces) and trim. Returns null if empty. */
export function clean(s) {
  if (s === undefined || s === null) return null;
  const out = String(s)
    .replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return out === '' ? null : out;
}

/** Truncate to n characters on a word boundary, adding an ellipsis. */
export function truncate(s, n = 600) {
  if (!s || s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, '') + '...';
}
