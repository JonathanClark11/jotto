import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { WORDS } from '../data/words.js';
import { GUESS_WORDS } from '../data/guessWords.js';
import { pick, todayKey, dailyWord, loadHistory, saveHistory, puzzleNumber, buildShareText } from './logic.js';
import { APP_NAME } from '../config.js';
import { parseInviteUrl } from './platform.js';
import {
  loadProfile, saveProfile, loadFriends, saveFriends, upsertFriend, removeFriend, normalizeFriendCode,
  loadRemoved, saveRemoved, mergeIncoming, friendKey,
} from './friends.js';

const SECRET_LIST = WORDS.filter((word) => word.length === 5 && new Set(word).size === 5);
const GUESS_SET = new Set(GUESS_WORDS);
const MATCHES_KEY = 'cinq-rival-matches-v1';
const LAST_NAME_KEY = 'cinq-player-name';

function isValidGuess(word) {
  return SECRET_LIST.includes(word) || GUESS_SET.has(word);
}

function isValidSecret(word) {
  return SECRET_LIST.includes(word);
}

function freshRound() {
  return {
    myGuesses: [], rivalGuesses: [], marks: {}, groups: [],
    pendingTool: null, pendingLetters: [], tool: 'type', view: 'you',
    rivalNew: false, thinking: false, result: null, reviewing: false,
    error: '', input: '', setupInput: '', setupName: '', pendingGuess: '', shareFeedback: '',
    dailyStats: null, dailyStatsLoading: false,
  };
}

function loadSavedMatches() {
  try {
    const rows = JSON.parse(localStorage.getItem(MATCHES_KEY) || '[]');
    return Array.isArray(rows) ? rows.filter((row) => row?.code && row?.token) : [];
  } catch {
    return [];
  }
}

function storeMatchSummary(match, token) {
  const rows = loadSavedMatches();
  const next = {
    code: match.code,
    token,
    yourName: match.yourName || 'Player',
    friendName: match.opponentName || 'Waiting for friend',
    friendCode: match.opponentFriendCode || '',
    yourCount: (match.yourGuesses || []).length,
    theirCount: (match.opponentGuesses || []).length,
    status: match.status,
    yourTurn: match.yourTurn,
    pendingGuess: match.pendingGuess || '',
    winner: match.winner,
    role: match.role,
    updatedAt: match.updatedAt || new Date().toISOString(),
    forfeit: Boolean(match.expired),
  };
  const index = rows.findIndex((row) => row.code === match.code);
  if (index >= 0) rows[index] = next; else rows.push(next);
  localStorage.setItem(MATCHES_KEY, JSON.stringify(rows));
  return rows;
}

const initialState = {
  screen: 'home', mode: null, dailyDate: '', setupIntent: '',
  mySecret: '', rivalSecret: '', setupInput: '', setupName: '', input: '', joinCode: '',
  myGuesses: [], rivalGuesses: [], marks: {}, groups: [],
  pendingTool: null, pendingLetters: [], tool: 'type', view: 'you',
  rivalNew: false, thinking: false, result: null, reviewing: false, error: '',
  matchCode: '', playerToken: '', matchStatus: '', playerRole: 0,
  matchUpdatedAt: '', currentTurn: 0, yourTurn: false, opponentJoined: false, winner: null,
  myName: '', opponentName: '', pendingGuess: '', savedMatches: [],
  rematchCode: '', rematchSourceCode: '', rematchSourceToken: '',
  playerStats: null, playerStatsLoading: false, shareFeedback: '',
  matchBusy: false, inviteCopied: false, dailyStats: null, dailyStatsLoading: false,
  showStats: false, shareCopiedDate: null,
  profileName: '', friendCode: '', profileNameInput: '', profileEditing: false, profileBusy: false,
  friends: [], friendInput: '', friendError: '', friendBusy: false, friendIdCopied: false,
  selectedFriend: null, removedFriends: [],
};

function savedState(next) {
  return {
    screen: next.screen, mode: next.mode, dailyDate: next.dailyDate,
    setupIntent: next.setupIntent, mySecret: next.mySecret, rivalSecret: next.rivalSecret,
    setupInput: next.setupInput, setupName: next.setupName, input: next.input, joinCode: next.joinCode,
    myGuesses: next.myGuesses, rivalGuesses: next.rivalGuesses,
    marks: next.marks, groups: next.groups, view: next.view,
    result: next.result, reviewing: next.reviewing,
    matchCode: next.matchCode, playerToken: next.playerToken,
    matchStatus: next.matchStatus, playerRole: next.playerRole,
    currentTurn: next.currentTurn, yourTurn: next.yourTurn, matchUpdatedAt: next.matchUpdatedAt,
    opponentJoined: next.opponentJoined, winner: next.winner,
    myName: next.myName, opponentName: next.opponentName, pendingGuess: next.pendingGuess,
    rematchCode: next.rematchCode, rematchSourceCode: next.rematchSourceCode,
    rematchSourceToken: next.rematchSourceToken,
  };
}

async function jsonRequest(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `${APP_NAME} could not complete that request`);
  return data;
}

function anonymousDailyKey() {
  const storageKey = 'cinq-daily-player';
  let key = localStorage.getItem(storageKey);
  if (!key) {
    key = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(storageKey, key);
  }
  return key;
}

function playerProfileKey() {
  const storageKey = 'cinq-player-profile';
  let key = localStorage.getItem(storageKey);
  if (!key) {
    key = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(storageKey, key);
  }
  return key;
}

export function useCinq() {
  const [state, setState] = useState(initialState);
  const stateRef = useRef(state);
  const queuedSubmitRef = useRef('');
  useEffect(() => { stateRef.current = state; }, [state]);

  const set = useCallback((patch) => {
    setState((previous) => {
      const next = typeof patch === 'function' ? patch(previous) : { ...previous, ...patch };
      try { localStorage.setItem('cinq-game-v3', JSON.stringify(savedState(next))); } catch { /* optional */ }
      return next;
    });
  }, []);

  const applyMatch = useCallback((match, token) => {
    set((previous) => {
      const sameMatch = previous.matchCode === match.code;
      const madeGuess = sameMatch && (match.yourGuesses || []).length > previous.myGuesses.length;
      const base = sameMatch ? previous : { ...previous, ...freshRound() };
      const finished = match.status === 'finished';
      const won = finished && match.winner === match.role;
      const result = finished ? {
        won,
        n: won ? match.yourGuesses.length : match.opponentGuesses.length,
        attempts: match.yourGuesses.length,
        multiplayer: true,
      } : null;
      const acceptedQueue = sameMatch && match.pendingGuess && match.pendingGuess !== previous.pendingGuess;
      let savedMatches = previous.savedMatches;
      try { savedMatches = storeMatchSummary(match, token); } catch { /* optional device index */ }
      let friends = previous.friends;
      if (match.opponentFriendCode && match.opponentName && !loadRemoved().includes(match.opponentFriendCode)) {
        friends = upsertFriend(previous.friends, { friendCode: match.opponentFriendCode, name: match.opponentName });
        if (friends !== previous.friends) saveFriends(friends);
      }
      return {
        ...base,
        friends,
        screen: 'game', mode: 'rival',
        matchCode: match.code, playerToken: token,
        matchStatus: match.status, playerRole: match.role,
        currentTurn: match.currentTurn, yourTurn: match.yourTurn, matchUpdatedAt: match.updatedAt || '',
        opponentJoined: match.opponentJoined, winner: match.winner,
        myName: match.yourName || '', opponentName: match.opponentName || '',
        pendingGuess: match.pendingGuess || '', savedMatches,
        rematchCode: match.rematchCode || '',
        mySecret: match.yourSecret || '', rivalSecret: match.opponentSecret || '',
        myGuesses: match.yourGuesses || [], rivalGuesses: match.opponentGuesses || [],
        input: (madeGuess || acceptedQueue) ? '' : base.input,
        rivalNew: (match.opponentGuesses || []).length > previous.rivalGuesses.length && previous.view !== 'rival',
        result,
        reviewing: result && previous.result ? previous.reviewing : false,
        matchBusy: false,
      };
    });
  }, [set]);

  const syncMatch = useCallback(async (code, token, quiet = false) => {
    try {
      const data = await jsonRequest(`/api/matches/${code}`, {
        headers: { 'x-cinq-player': token },
      });
      applyMatch(data.match, token);
    } catch (error) {
      if (!quiet) set({ error: error.message });
    }
  }, [applyMatch, set]);

  const refreshSavedMatches = useCallback(async () => {
    const savedMatches = loadSavedMatches();
    for (const savedMatch of savedMatches) {
      try {
        const data = await jsonRequest(`/api/matches/${savedMatch.code}`, {
          headers: { 'x-cinq-player': savedMatch.token },
        });
        storeMatchSummary(data.match, savedMatch.token);
      } catch { /* leave unavailable matches in the device list */ }
    }
    set({ savedMatches: loadSavedMatches() });
  }, [set]);

  const loadDailyStats = useCallback(async (date, guesses, record) => {
    set({ dailyStatsLoading: true });
    try {
      const data = record
        ? await jsonRequest('/api/daily-stats', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ date, guesses, playerKey: anonymousDailyKey() }),
          })
        : await jsonRequest(`/api/daily-stats?date=${date}&guesses=${guesses}`);
      set({ dailyStats: data, dailyStatsLoading: false });
    } catch {
      set({ dailyStats: null, dailyStatsLoading: false });
    }
  }, [set]);

  const loadPlayerStats = useCallback(async () => {
    set({ playerStatsLoading: true });
    try {
      const data = await jsonRequest(`/api/player-stats?playerKey=${encodeURIComponent(playerProfileKey())}`);
      set({ playerStats: data, playerStatsLoading: false });
    } catch {
      set({ playerStats: null, playerStatsLoading: false });
    }
  }, [set]);

  // Creates/renames this device's anonymous profile and stores the friend ID the server returns.
  const registerProfile = useCallback(async (name) => {
    const cleaned = name.replace(/\s+/g, ' ').trim().slice(0, 24);
    if (!cleaned) return null;
    set({ profileBusy: true, error: '' });
    try {
      const data = await jsonRequest('/api/players', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: cleaned, playerKey: playerProfileKey() }),
      });
      saveProfile({ name: data.name, friendCode: data.friendCode });
      localStorage.setItem(LAST_NAME_KEY, data.name);
      set({
        profileName: data.name, friendCode: data.friendCode,
        profileNameInput: '', profileEditing: false, profileBusy: false,
      });
      return data;
    } catch (error) {
      set({ profileBusy: false, error: error.message });
      return null;
    }
  }, [set]);

  const addFriendByCode = useCallback(async (rawCode) => {
    const code = normalizeFriendCode(rawCode);
    if (code.length !== 6) { set({ friendError: 'Friend IDs are 6 characters' }); return; }
    if (code === stateRef.current.friendCode) { set({ friendError: 'That is your own friend ID' }); return; }
    set({ friendBusy: true, friendError: '' });
    try {
      const data = await jsonRequest('/api/friends', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerKey: playerProfileKey(), friendCode: code }),
      });
      const stillRemoved = loadRemoved().filter((removedCode) => removedCode !== code);
      saveRemoved(stillRemoved);
      set((previous) => {
        const friends = upsertFriend(previous.friends, { friendCode: data.friendCode, name: data.name });
        saveFriends(friends);
        return {
          ...previous, friends, removedFriends: stillRemoved, friendInput: '', friendBusy: false, friendError: '',
        };
      });
    } catch (error) {
      set({ friendBusy: false, friendError: error.message });
    }
  }, [set]);

  // People who added our friend ID show up here without us adding them back.
  const syncIncomingFriends = useCallback(async () => {
    try {
      const data = await jsonRequest(`/api/friends/incoming?playerKey=${encodeURIComponent(playerProfileKey())}`);
      set((previous) => {
        const friends = mergeIncoming(previous.friends, data.friends || [], loadRemoved());
        if (friends === previous.friends) return previous;
        saveFriends(friends);
        return { ...previous, friends };
      });
    } catch { /* offline: try again next time */ }
  }, [set]);

  useEffect(() => {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('cinq-game-v3') || 'null'); } catch { /* ignore */ }
    if (saved?.mode === 'daily' && saved.dailyDate !== todayKey()) saved = null;
    const savedMatches = loadSavedMatches();
    const profile = loadProfile();
    const friends = loadFriends();
    const profileFields = {
      profileName: profile.name, friendCode: profile.friendCode, friends, removedFriends: loadRemoved(),
    };
    // One-time hydration from localStorage on mount; it can't run during render without breaking SSR/hydration.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (saved) setState((previous) => ({ ...previous, ...saved, savedMatches, ...profileFields }));
    else setState((previous) => ({ ...previous, savedMatches, ...profileFields }));
    loadPlayerStats();
    /* eslint-enable react-hooks/set-state-in-effect */
    syncIncomingFriends();

    // Players who already picked a name in an earlier version get a friend ID without retyping it.
    const legacyName = profile.name || localStorage.getItem(LAST_NAME_KEY) || '';
    if (legacyName && !profile.friendCode) registerProfile(legacyName);

    const params = new URLSearchParams(window.location.search);
    const friendParam = normalizeFriendCode(params.get('friend'));
    if (friendParam) {
      setState((previous) => ({ ...previous, screen: 'multiplayer', mode: 'rival', error: '' }));
      addFriendByCode(friendParam);
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    const inviteCode = params.get('join');
    if (inviteCode) {
      setState((previous) => ({
        ...previous,
        screen: 'multiplayer', mode: 'rival',
        joinCode: inviteCode.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8),
        error: '',
      }));
      return;
    }
    if (saved?.mode === 'rival' && saved.matchCode && saved.playerToken) {
      syncMatch(saved.matchCode, saved.playerToken, true);
    } else if (saved?.mode === 'daily' && saved.result && saved.dailyDate) {
      loadDailyStats(saved.dailyDate, saved.result.n, true);
    }
  }, [addFriendByCode, loadDailyStats, loadPlayerStats, registerProfile, syncIncomingFriends, syncMatch]);

  useEffect(() => {
    if (state.screen !== 'game' || state.mode !== 'rival' || !state.matchCode || !state.playerToken) return undefined;
    const timer = window.setInterval(() => syncMatch(state.matchCode, state.playerToken, true), 2200);
    return () => window.clearInterval(timer);
  }, [state.screen, state.mode, state.matchCode, state.playerToken, state.matchStatus, syncMatch]);

  useEffect(() => {
    if (state.screen !== 'game' || state.mode !== 'rival' || state.matchStatus !== 'active'
      || !state.yourTurn || !state.pendingGuess) return undefined;
    const queueKey = `${state.matchCode}:${state.pendingGuess}`;
    if (queuedSubmitRef.current === queueKey) return undefined;
    queuedSubmitRef.current = queueKey;
    let cancelled = false;
    jsonRequest(`/api/matches/${state.matchCode}/guess`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: state.playerToken, word: state.pendingGuess }),
    }).then((data) => {
      if (!cancelled) applyMatch(data.match, state.playerToken);
    }).catch(() => {
      if (!cancelled) syncMatch(state.matchCode, state.playerToken, true);
    }).finally(() => {
      if (queuedSubmitRef.current === queueKey) queuedSubmitRef.current = '';
    });
    return () => { cancelled = true; };
  }, [state.screen, state.mode, state.matchStatus, state.yourTurn, state.pendingGuess,
    state.matchCode, state.playerToken, applyMatch, syncMatch]);

  useEffect(() => {
    if (state.screen !== 'home' && state.screen !== 'multiplayer' && state.screen !== 'friend') return undefined;
    if (state.savedMatches.length === 0 && state.screen === 'home') return undefined;
    const refresh = () => {
      refreshSavedMatches();
      if (state.screen === 'multiplayer' || state.screen === 'friend') syncIncomingFriends();
    };
    refresh();
    const timer = window.setInterval(refresh, 8000);
    return () => window.clearInterval(timer);
  }, [state.screen, state.savedMatches.length, refreshSavedMatches, syncIncomingFriends]);

  useEffect(() => {
    if (state.mode === 'rival' && state.matchStatus === 'finished') loadPlayerStats(); // eslint-disable-line react-hooks/set-state-in-effect -- fetch on match finish; sets loading flag first
  }, [state.mode, state.matchStatus, state.matchCode, loadPlayerStats]);

  const startDaily = useCallback(() => {
    const key = todayKey();
    const record = loadHistory().find((item) => item.date === key);
    if (record) {
      set({
        ...freshRound(), screen: 'game', mode: 'daily', dailyDate: key,
        rivalSecret: record.word || dailyWord(key, SECRET_LIST),
        myGuesses: record.guesses || [], result: { won: true, n: record.n, daily: true },
        dailyStatsLoading: true,
      });
      loadDailyStats(key, record.n, true);
      return;
    }
    set({
      ...freshRound(), screen: 'game', mode: 'daily', dailyDate: key,
      mySecret: '', rivalSecret: dailyWord(key, SECRET_LIST),
    });
  }, [loadDailyStats, set]);

  const startSolo = useCallback(() => {
    set({ ...freshRound(), screen: 'game', mode: 'solo', mySecret: '', rivalSecret: pick(SECRET_LIST) });
  }, [set]);

  const startRival = useCallback(() => {
    set({
      ...freshRound(), screen: 'multiplayer', mode: 'rival', joinCode: stateRef.current.joinCode || '',
      savedMatches: loadSavedMatches(),
    });
  }, [set]);

  const beginCreateMatch = useCallback((opponentName = '') => {
    set({
      ...freshRound(), screen: 'setup', mode: 'rival', setupIntent: 'create',
      setupName: stateRef.current.profileName || localStorage.getItem(LAST_NAME_KEY) || '',
      opponentName: typeof opponentName === 'string' ? opponentName : '',
    });
  }, [set]);

  const beginJoinMatch = useCallback(() => {
    const code = stateRef.current.joinCode;
    if (code.length !== 8) { set({ error: 'Enter the 8-character match code' }); return; }
    set({
      ...freshRound(), screen: 'setup', mode: 'rival', setupIntent: 'join', joinCode: code,
      setupName: stateRef.current.profileName || localStorage.getItem(LAST_NAME_KEY) || '',
    });
  }, [set]);

  const beginRematch = useCallback(() => {
    const current = stateRef.current;
    if (current.mode !== 'rival' || current.matchStatus !== 'finished') return;
    set({
      ...freshRound(), screen: 'setup', mode: 'rival', setupIntent: 'rematch',
      setupName: current.profileName || current.myName || localStorage.getItem(LAST_NAME_KEY) || '',
      rematchSourceCode: current.matchCode, rematchSourceToken: current.playerToken,
      opponentName: current.opponentName,
    });
  }, [set]);

  const setSetupName = useCallback((value) => {
    set({ setupName: value.replace(/\s+/g, ' ').slice(0, 24), error: '' });
  }, [set]);

  const setJoinCode = useCallback((value) => {
    set({ joinCode: value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8), error: '' });
  }, [set]);

  const resumeRival = useCallback((code, token) => {
    const current = stateRef.current;
    const matchCode = code || current.matchCode;
    const playerToken = token || current.playerToken;
    if (!matchCode || !playerToken) return;
    set({ ...freshRound(), screen: 'game', mode: 'rival', matchCode, playerToken, error: '' });
    syncMatch(matchCode, playerToken, false);
  }, [set, syncMatch]);

  const setFriendInput = useCallback((value) => {
    set({ friendInput: normalizeFriendCode(value), friendError: '' });
  }, [set]);

  const addFriend = useCallback(() => addFriendByCode(stateRef.current.friendInput), [addFriendByCode]);

  const openFriend = useCallback((friend) => {
    set({
      screen: 'friend', mode: 'rival', savedMatches: loadSavedMatches(),
      selectedFriend: { friendCode: friend.friendCode || '', friendName: friend.friendName },
    });
  }, [set]);

  const closeFriend = useCallback(() => {
    set({ screen: 'multiplayer', selectedFriend: null, savedMatches: loadSavedMatches() });
  }, [set]);

  // Hides the friend everywhere (list, incoming adds, auto-add from matches). Adding their ID again brings them back.
  const removeSelectedFriend = useCallback(() => {
    const friend = stateRef.current.selectedFriend;
    if (!friend) return;
    if (!window.confirm(`Remove ${friend.friendName} from your friends?`)) return;
    const key = friendKey(friend);
    const removedFriends = Array.from(new Set(loadRemoved().concat([key])));
    saveRemoved(removedFriends);
    set((previous) => {
      const friends = removeFriend(previous.friends, friend.friendCode);
      saveFriends(friends);
      return { ...previous, friends, removedFriends, selectedFriend: null, screen: 'multiplayer' };
    });
  }, [set]);

  const setProfileNameInput = useCallback((value) => {
    set({ profileNameInput: value.replace(/\s+/g, ' ').slice(0, 24), error: '' });
  }, [set]);

  const saveProfileName = useCallback(() => {
    const current = stateRef.current;
    const name = current.profileNameInput.trim();
    if (!name) { set({ error: 'Enter your name' }); return; }
    registerProfile(name);
  }, [registerProfile, set]);

  const editProfile = useCallback(() => {
    set((previous) => ({ ...previous, profileEditing: true, profileNameInput: previous.profileName }));
  }, [set]);

  const cancelEditProfile = useCallback(() => set({ profileEditing: false, profileNameInput: '' }), [set]);

  const shareFriendId = useCallback(async () => {
    const code = stateRef.current.friendCode;
    if (!code) return;
    const link = `${window.location.origin}${window.location.pathname}?friend=${code}`;
    const text = `Add me on ${APP_NAME}! My friend ID is ${code}.\n${link}`;
    try {
      if (navigator.share) await navigator.share({ title: APP_NAME, text });
      else await navigator.clipboard.writeText(text);
      set({ friendIdCopied: true });
      window.setTimeout(() => set({ friendIdCopied: false }), 1800);
    } catch (error) {
      if (error?.name !== 'AbortError') set({ error: `Your friend ID is ${code}` });
    }
  }, [set]);

  const startRematchFrom = useCallback((code, token, opponentName) => {
    set({
      ...freshRound(), screen: 'setup', mode: 'rival', setupIntent: 'rematch',
      setupName: stateRef.current.profileName || stateRef.current.myName || localStorage.getItem(LAST_NAME_KEY) || '',
      rematchSourceCode: code, rematchSourceToken: token,
      opponentName: opponentName || '',
    });
  }, [set]);

  // Rematch the last finished game with this friend, or start a fresh match to send them.
  const challengeFriend = useCallback((friend) => {
    if (friend.rematchMatch) {
      startRematchFrom(friend.rematchMatch.code, friend.rematchMatch.token, friend.friendName);
    } else {
      beginCreateMatch(friend.friendName);
    }
  }, [beginCreateMatch, startRematchFrom]);

  const openStats = useCallback(() => set({ showStats: true }), [set]);
  const closeStats = useCallback(() => set({ showStats: false }), [set]);

  const goHome = useCallback(() => {
    set({
      ...freshRound(), screen: 'home', mode: null, mySecret: '', rivalSecret: '',
      matchCode: '', playerToken: '', matchStatus: '', opponentJoined: false,
      savedMatches: loadSavedMatches(), showStats: false,
    });
    window.history.replaceState({}, '', window.location.pathname);
  }, [set]);

  const tapLetter = useCallback((letter) => {
    const current = stateRef.current;
    if (current.screen === 'setup') {
      if (current.setupInput.length < 5 && !current.setupInput.includes(letter)) set({ setupInput: current.setupInput + letter, error: '' });
      return;
    }
    if (current.screen !== 'game' || current.result) return;
    if (current.mode === 'rival' && current.matchStatus !== 'active') return;
    if (current.pendingTool) {
      const letters = current.pendingLetters.slice();
      const index = letters.indexOf(letter);
      if (index >= 0) letters.splice(index, 1); else letters.push(letter);
      set({ pendingLetters: letters });
      return;
    }
    if (current.tool === 'elim' || current.tool === 'has') {
      const marks = { ...current.marks };
      if (marks[letter] === current.tool) delete marks[letter]; else marks[letter] = current.tool;
      set({ marks });
      return;
    }
    if (current.input.length < 5 && !current.input.includes(letter)) set({ input: current.input + letter, error: '' });
  }, [set]);

  const backspace = useCallback(() => {
    const current = stateRef.current;
    if (current.screen === 'setup') set({ setupInput: current.setupInput.slice(0, -1), error: '' });
    else if (current.screen === 'game' && !current.result) set({ input: current.input.slice(0, -1), error: '' });
  }, [set]);

  const commitPending = useCallback(() => {
    const current = stateRef.current;
    if (current.pendingLetters.length >= 2) {
      set({
        groups: current.groups.concat([{ count: Number(current.pendingTool), letters: current.pendingLetters.slice().sort() }]),
        pendingTool: null, pendingLetters: [], tool: 'type',
      });
    } else {
      set({
        pendingTool: null, pendingLetters: [], tool: 'type',
        error: current.pendingLetters.length === 1 ? 'A group needs at least 2 letters' : '',
      });
    }
  }, [set]);

  const tapTool = useCallback((id) => {
    const current = stateRef.current;
    if (current.pendingTool === id) { commitPending(); return; }
    if (['1', '2', '3'].includes(id)) {
      set({ pendingTool: id, pendingLetters: [], tool: 'group', error: '' });
      return;
    }
    set({ pendingTool: null, pendingLetters: [], tool: id, error: '' });
  }, [commitPending, set]);

  const removeGroup = useCallback((index) => {
    const groups = stateRef.current.groups.slice();
    groups.splice(index, 1);
    set({ groups });
  }, [set]);

  const action = useCallback(async () => {
    const current = stateRef.current;
    if (current.screen === 'setup') {
      if (!current.setupName.trim()) { set({ error: 'Enter your name' }); return; }
      if (current.setupInput.length < 5) { set({ error: 'Your word needs 5 letters' }); return; }
      if (!isValidSecret(current.setupInput)) { set({ error: 'Choose a common word from the secret-word list' }); return; }
      if (current.mode === 'rival') {
        set({ matchBusy: true, error: '' });
        try {
          localStorage.setItem(LAST_NAME_KEY, current.setupName.trim());
          const endpoint = current.setupIntent === 'create'
            ? '/api/matches'
            : (current.setupIntent === 'rematch'
                ? `/api/matches/${current.rematchSourceCode}/rematch`
                : `/api/matches/${current.joinCode}/join`);
          const data = await jsonRequest(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              name: current.setupName.trim(), secret: current.setupInput,
              playerKey: playerProfileKey(),
              ...(current.setupIntent === 'rematch' ? { token: current.rematchSourceToken } : {}),
            }),
          });
          applyMatch(data.match, data.token);
          if (!current.profileName || !current.friendCode) registerProfile(current.setupName);
        } catch (error) {
          set({ matchBusy: false, error: error.message });
        }
        return;
      }
    }
    if (current.screen !== 'game' || current.result) return;
    if (current.pendingTool) { commitPending(); return; }
    const word = current.input;
    if (word.length < 5) { set({ error: 'Guesses need 5 letters' }); return; }
    if (current.myGuesses.some((guess) => guess.word === word)) { set({ error: 'Already guessed' }); return; }
    if (!isValidGuess(word)) { set({ error: 'Not in the word list' }); return; }

    if (current.mode === 'rival') {
      set({ matchBusy: true, error: '' });
      try {
        const data = await jsonRequest(`/api/matches/${current.matchCode}/guess`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: current.playerToken, word }),
        });
        applyMatch(data.match, current.playerToken);
      } catch (error) {
        set({ matchBusy: false, error: error.message });
      }
      return;
    }

    const count = word.split('').filter((letter) => current.rivalSecret.includes(letter)).length;
    const myGuesses = current.myGuesses.concat([{ word, count }]);
    if (word === current.rivalSecret) {
      if (current.mode === 'daily') {
        const key = current.dailyDate || todayKey();
        const history = loadHistory();
        if (!history.some((record) => record.date === key)) {
          history.push({ date: key, n: myGuesses.length, word: current.rivalSecret, guesses: myGuesses, won: true, puzzleNumber: puzzleNumber(key) });
          saveHistory(history);
        }
        set({ myGuesses, input: '', result: { won: true, n: myGuesses.length, daily: true }, dailyStatsLoading: true });
        loadDailyStats(key, myGuesses.length, true);
        return;
      }
      set({ myGuesses, input: '', result: { won: true, n: myGuesses.length } });
      return;
    }
    set({ myGuesses, input: '', error: '' });
  }, [applyMatch, commitPending, loadDailyStats, registerProfile, set]);

  const playAgain = useCallback(() => {
    const current = stateRef.current;
    if (current.mode === 'daily') goHome();
    else if (current.mode === 'solo') startSolo();
    else startRival();
  }, [goHome, startRival, startSolo]);

  const setView = useCallback((view) => {
    set(view === 'rival' ? { view, rivalNew: false } : { view });
  }, [set]);

  const reviewResult = useCallback(() => set({ reviewing: true }), [set]);
  const showResults = useCallback(() => set({ reviewing: false }), [set]);

  const shareResult = useCallback(async () => {
    const current = stateRef.current;
    if (!current.result) return;
    const result = current.result;
    let text;
    if (result.daily) {
      const pNum = puzzleNumber(current.dailyDate || todayKey());
      text = buildShareText(pNum, current.myGuesses, result.won !== false);
    } else if (current.mode === 'solo') {
      text = `I cracked ${APP_NAME} in ${result.n} ${result.n === 1 ? 'guess' : 'guesses'}!\n\ncinq.app`;
    } else if (result.won) {
      text = `I beat ${current.opponentName || 'a friend'} at ${APP_NAME} in ${result.n} ${result.n === 1 ? 'guess' : 'guesses'}!\n\ncinq.app`;
    } else {
      text = `${current.opponentName || 'My friend'} won our ${APP_NAME} match — rematch?\n\ncinq.app`;
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: `${APP_NAME}`, text });
        set({ shareFeedback: 'SHARED' });
      } else {
        await navigator.clipboard.writeText(text);
        set({ shareFeedback: 'COPIED' });
      }
      window.setTimeout(() => set({ shareFeedback: '' }), 2200);
    } catch (error) {
      if (error?.name !== 'AbortError') set({ shareFeedback: 'SHARE FAILED' });
    }
  }, [set]);

  const shareHistoryItem = useCallback(async (date) => {
    const history = loadHistory();
    const record = history.find((r) => r.date === date);
    if (!record || !record.guesses) return;
    const pNum = record.puzzleNumber || puzzleNumber(date);
    const text = buildShareText(pNum, record.guesses, record.won !== false);
    try {
      if (navigator.share) {
        await navigator.share({ title: `${APP_NAME} #${pNum}`, text });
      } else {
        await navigator.clipboard.writeText(text);
      }
      set({ shareCopiedDate: date });
      window.setTimeout(() => set({ shareCopiedDate: null }), 2200);
    } catch {
      // user cancelled share sheet
    }
  }, [set]);

  const copyInvite = useCallback(async () => {
    const code = stateRef.current.matchCode;
    if (!code) return;
    const link = `${window.location.origin}${window.location.pathname}?join=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      set({ inviteCopied: true, error: '' });
      window.setTimeout(() => set({ inviteCopied: false }), 1800);
    } catch {
      set({ error: `Share code ${code} with your friend` });
    }
  }, [set]);

  // Links that open the app: Universal Links (https) and the cinqle:// scheme. A cold start delivers the URL
  // before this page has loaded, so ask for the launch URL too (once per URL per session).
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    const openInvite = (url) => {
      const invite = parseInviteUrl(url);
      if (!invite) return;
      if (invite.kind === 'friend') {
        set({ screen: 'multiplayer', mode: 'rival', error: '', savedMatches: loadSavedMatches() });
        addFriendByCode(invite.code);
      } else {
        set({ screen: 'multiplayer', mode: 'rival', joinCode: invite.code, error: '' });
      }
    };
    CapApp.getLaunchUrl().then((launch) => {
      if (!launch?.url) return;
      const seenKey = `cinq-launch-url:${launch.url}`;
      try {
        if (sessionStorage.getItem(seenKey)) return;
        sessionStorage.setItem(seenKey, '1');
      } catch { /* optional */ }
      openInvite(launch.url);
    }).catch(() => {});
    const handle = CapApp.addListener('appUrlOpen', ({ url }) => openInvite(url));
    return () => { handle.then((h) => h.remove()); };
  }, [addFriendByCode, set]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const current = stateRef.current;
      if (current.screen !== 'setup' && current.screen !== 'game') return;
      if (current.result) return;
      if (/^[a-zA-Z]$/.test(event.key)) tapLetter(event.key.toUpperCase());
      else if (event.key === 'Backspace') backspace();
      else if (event.key === 'Enter') action();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [action, backspace, tapLetter]);

  const actions = useMemo(() => ({
    startDaily, startSolo, startRival, beginCreateMatch, beginJoinMatch, beginRematch,
    setJoinCode, setSetupName, resumeRival, goHome, startRematchFrom,
    setFriendInput, addFriend, openFriend, closeFriend, removeSelectedFriend, challengeFriend, shareFriendId,
    setProfileNameInput, saveProfileName, editProfile, cancelEditProfile,
    openStats, closeStats, tapLetter, backspace, tapTool,
    removeGroup, action, playAgain, setView, reviewResult, showResults, copyInvite, shareResult,
    shareHistoryItem,
  }), [
    startDaily, startSolo, startRival, beginCreateMatch, beginJoinMatch, beginRematch,
    setJoinCode, setSetupName, resumeRival, goHome, startRematchFrom,
    setFriendInput, addFriend, openFriend, closeFriend, removeSelectedFriend, challengeFriend, shareFriendId,
    setProfileNameInput, saveProfileName, editProfile, cancelEditProfile,
    openStats, closeStats, tapLetter, backspace, tapTool,
    removeGroup, action, playAgain, setView, reviewResult, showResults, copyInvite, shareResult,
    shareHistoryItem,
  ]);

  return { state, actions, secretList: SECRET_LIST, showWordsLeft: true };
}
