export const PROFILE_KEY = 'cinq-profile';
export const FRIENDS_KEY = 'cinq-friends';
export const REMOVED_KEY = 'cinq-friends-removed';
export const FRIEND_CODE_LENGTH = 6;

export function normalizeFriendCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, FRIEND_CODE_LENGTH);
}

export function loadProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
    if (profile && typeof profile.name === 'string') {
      return { name: profile.name, friendCode: profile.friendCode || '' };
    }
  } catch { /* ignore */ }
  return { name: '', friendCode: '' };
}

export function saveProfile(profile) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* optional */ }
}

export function loadFriends() {
  try {
    const rows = JSON.parse(localStorage.getItem(FRIENDS_KEY) || '[]');
    return Array.isArray(rows) ? rows.filter((row) => row?.friendCode && row?.name) : [];
  } catch {
    return [];
  }
}

export function saveFriends(friends) {
  try { localStorage.setItem(FRIENDS_KEY, JSON.stringify(friends)); } catch { /* optional */ }
}

// Adds a friend or refreshes their name; the friend ID is the identity, the name just a label.
export function upsertFriend(friends, { friendCode, name }) {
  const code = normalizeFriendCode(friendCode);
  if (!code || !name) return friends;
  const index = friends.findIndex((friend) => friend.friendCode === code);
  if (index >= 0) {
    if (friends[index].name === name) return friends;
    const next = friends.slice();
    next[index] = { ...next[index], name };
    return next;
  }
  return friends.concat([{ friendCode: code, name, addedAt: new Date().toISOString() }]);
}

export function removeFriend(friends, friendCode) {
  return friends.filter((friend) => friend.friendCode !== friendCode);
}

// One row per person. Saved friends (known friend ID) come first; opponents from older
// matches that never had a friend ID are grouped by name so nobody disappears.
export function buildFriendList(friends, savedMatches) {
  const entries = new Map();
  const byName = new Map();
  for (const friend of friends) {
    const entry = { friendCode: friend.friendCode, friendName: friend.name, latestAt: '', rematchMatch: null };
    entries.set(`code:${friend.friendCode}`, entry);
    byName.set(friend.name.toLowerCase(), entry);
  }
  for (const match of savedMatches) {
    const name = match.friendName || 'Friend';
    // A waiting match has no opponent yet; it shows under active games instead.
    if (match.status === 'waiting') continue;
    let entry = match.friendCode ? entries.get(`code:${match.friendCode}`) : null;
    if (!entry) entry = byName.get(name.toLowerCase());
    if (!entry) {
      entry = { friendCode: match.friendCode || '', friendName: name, latestAt: '', rematchMatch: null };
      entries.set(match.friendCode ? `code:${match.friendCode}` : `name:${name.toLowerCase()}`, entry);
      byName.set(name.toLowerCase(), entry);
    }
    const updatedAt = match.updatedAt || '';
    if (updatedAt > entry.latestAt) entry.latestAt = updatedAt;
    if (match.status === 'finished'
      && (!entry.rematchMatch || updatedAt > (entry.rematchMatch.updatedAt || ''))) {
      entry.rematchMatch = match;
    }
  }
  return Array.from(entries.values()).sort((a, b) => {
    if (a.latestAt !== b.latestAt) return String(b.latestAt).localeCompare(String(a.latestAt));
    return a.friendName.localeCompare(b.friendName, undefined, { sensitivity: 'base' });
  });
}

// Friends the user deleted must not come back when the server reports they once added us.
export function loadRemoved() {
  try {
    const rows = JSON.parse(localStorage.getItem(REMOVED_KEY) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export function saveRemoved(codes) {
  try { localStorage.setItem(REMOVED_KEY, JSON.stringify(codes)); } catch { /* optional */ }
}

export function mergeIncoming(friends, incoming, removedCodes = []) {
  const removed = new Set(removedCodes);
  let next = friends;
  for (const person of incoming) {
    if (removed.has(normalizeFriendCode(person.friendCode))) continue;
    next = upsertFriend(next, { friendCode: person.friendCode, name: person.name });
  }
  return next;
}
