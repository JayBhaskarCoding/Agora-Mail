/* ============================================================
   Selecting conversations in the list.

   The list groups messages into conversations, but the mailbox stores
   messages, so a selection is a set of thread keys that only turns into
   message ids when an action needs them. Every helper here returns a new
   Set rather than mutating, which is what lets React see the change.
   ============================================================ */

/** Toggle one conversation in the set. */
export function toggleKey(keys, key) {
  const next = new Set(keys);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/**
 * Select every given conversation — or clear them if they are all chosen
 * already, which is what a "select all" control is expected to do.
 * An empty list leaves the selection untouched.
 */
export function toggleAllKeys(keys, allKeys = []) {
  if (allKeys.length === 0) return keys;
  const everyChosen = allKeys.every((key) => keys.has(key));
  return everyChosen ? new Set() : new Set(allKeys);
}

/**
 * Drop keys that no longer exist — the conversation was moved or deleted,
 * here or in another client. The original set comes back when nothing
 * changed, so the ten-second poll does not re-render the list.
 */
export function pruneKeys(keys, liveKeys = []) {
  if (keys.size === 0) return keys;
  const live = new Set(liveKeys);
  const next = new Set();
  for (const key of keys) if (live.has(key)) next.add(key);
  return next.size === keys.size ? keys : next;
}

/**
 * Every message id behind a selection of conversations, deduplicated.
 * A conversation carries both sides of the dialogue, so a bulk action has
 * to take all of them — otherwise half the thread would stay behind.
 */
export function messageIdsForThreads(threads = []) {
  const ids = new Set();
  for (const thread of threads) {
    for (const email of thread?.emails || []) {
      if (email?.id !== undefined && email?.id !== null) ids.add(email.id);
    }
  }
  return [...ids];
}
