/**
 * Localfy Database — Pure JSON, zero native compilation required.
 * Stores everything in JSON files in the user's app data folder.
 * Writes are debounced (300ms) so they never block the UI.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── In-memory store ──────────────────────────────────────────────────────────

let store = {
  tracks: {},         // id -> track object
  playlists: {},      // id -> playlist object
  folders: {},        // id -> folder object
  playlistTracks: {}, // playlistId -> [{trackId, position, addedAt}]
  queue: [],          // [{id, trackId, status, progress, error, createdAt}]
  settings: {},       // key -> value string
  playHistory: [],    // [{id, trackId, playedAt, duration_ms}]
  skipHistory: [],    // [{id, trackId, listenedMs, totalMs, skippedAt}]
  recFeedback: [],    // [{trackId, action, strategy, timestamp}]
};

let dataDir = null;
let loaded = false;

function getDataDir() {
  if (dataDir) return dataDir;
  const { app } = require('electron');
  dataDir = app.getPath('userData');
  return dataDir;
}

function filePath(key) {
  return path.join(getDataDir(), `localfy_${key}.json`);
}

function loadStore() {
  if (loaded) return;
  loaded = true;
  for (const key of Object.keys(store)) {
    const p = filePath(key);
    if (fs.existsSync(p)) {
      try {
        store[key] = JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch (e) {
        console.warn(`[db] Failed to load ${key}:`, e.message);
      }
    }
  }
}

const saveTimers = {};
function saveKey(key) {
  clearTimeout(saveTimers[key]);
  saveTimers[key] = setTimeout(() => {
    try {
      fs.writeFileSync(filePath(key), JSON.stringify(store[key]), 'utf8');
    } catch (e) {
      console.error(`[db] Failed to save ${key}:`, e.message);
    }
  }, 300);
}

function ensureReady() {
  loadStore();
}

// ─── TRACKS ──────────────────────────────────────────────────────────────────

function upsertTrack(track) {
  ensureReady();
  // Find by spotify_id if no id match
  let existing = null;
  if (track.spotify_id) {
    existing = Object.values(store.tracks).find(t => t.spotify_id === track.spotify_id);
  }
  if (existing) {
    store.tracks[existing.id] = { ...existing, ...track, id: existing.id };
    saveKey('tracks');
    return store.tracks[existing.id];
  }
  const id = track.id || crypto.randomUUID();
  store.tracks[id] = { ...track, id, added_at: track.added_at || new Date().toISOString(), play_count: 0 };
  saveKey('tracks');
  return store.tracks[id];
}

function getTrackBySpotifyId(spotifyId) {
  ensureReady();
  return Object.values(store.tracks).find(t => t.spotify_id === spotifyId) || null;
}

function getAllDownloadedTracks() {
  ensureReady();
  return Object.values(store.tracks)
    .filter(t => t.downloaded)
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
}

function getAllLikedTracks() {
  ensureReady();
  return Object.values(store.tracks)
    .filter(t => t.liked)
    .sort((a, b) => new Date(b.added_at || 0) - new Date(a.added_at || 0));
}

function updateTrackDownloaded(id, filePath) {
  ensureReady();
  if (store.tracks[id]) {
    store.tracks[id].downloaded = 1;
    store.tracks[id].file_path = filePath;
    saveKey('tracks');
  } else {
    // Try by spotify_id
    const t = Object.values(store.tracks).find(t => t.spotify_id === id);
    if (t) {
      t.downloaded = 1;
      t.file_path = filePath;
      saveKey('tracks');
    }
  }
}

function updateTrackLiked(id, liked) {
  ensureReady();
  if (store.tracks[id]) {
    store.tracks[id].liked = liked ? 1 : 0;
    saveKey('tracks');
  }
}

function incrementPlayCount(id) {
  ensureReady();
  if (store.tracks[id]) {
    store.tracks[id].play_count = (store.tracks[id].play_count || 0) + 1;
    store.tracks[id].last_played = new Date().toISOString();
    saveKey('tracks');
  }
}

function searchTracks(query) {
  ensureReady();
  const q = query.toLowerCase();
  return Object.values(store.tracks)
    .filter(t =>
      (t.title || '').toLowerCase().includes(q) ||
      (t.artist || '').toLowerCase().includes(q) ||
      (t.album || '').toLowerCase().includes(q)
    )
    .slice(0, 50);
}

function deleteAllDownloads() {
  ensureReady();
  for (const t of Object.values(store.tracks)) {
    t.downloaded = 0;
    t.file_path = null;
  }
  saveKey('tracks');
}

function deleteTrack(id) {
  ensureReady();
  delete store.tracks[id];
  saveKey('tracks');
}

// ─── PLAYLISTS ────────────────────────────────────────────────────────────────

function upsertPlaylist(playlist) {
  ensureReady();
  const id = playlist.id || crypto.randomUUID();
  const existing = store.playlists[id] || {};
  store.playlists[id] = {
    ...existing, ...playlist, id,
    updated_at: new Date().toISOString(),
    created_at: existing.created_at || new Date().toISOString(),
  };
  saveKey('playlists');
  return store.playlists[id];
}

function getAllPlaylists() {
  ensureReady();
  return Object.values(store.playlists)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function getPlaylistTracks(playlistId) {
  ensureReady();
  const entries = (store.playlistTracks[playlistId] || [])
    .sort((a, b) => (a.position || 0) - (b.position || 0));
  return entries
    .map(e => store.tracks[e.trackId])
    .filter(Boolean)
    .map((t, i) => ({ ...t, position: i }));
}

function addTrackToPlaylist(playlistId, trackId, position) {
  ensureReady();
  if (!store.playlistTracks[playlistId]) store.playlistTracks[playlistId] = [];
  const exists = store.playlistTracks[playlistId].some(e => e.trackId === trackId);
  if (!exists) {
    store.playlistTracks[playlistId].push({
      trackId, position: position || store.playlistTracks[playlistId].length,
      addedAt: new Date().toISOString(),
    });
    saveKey('playlistTracks');
  }
}

function createLocalPlaylist(name, folderId) {
  ensureReady();
  const id = crypto.randomUUID();
  store.playlists[id] = {
    id, name, folder_id: folderId || null,
    is_local: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  saveKey('playlists');
  return id;
}

function deletePlaylist(id) {
  ensureReady();
  delete store.playlists[id];
  delete store.playlistTracks[id];
  saveKey('playlists');
  saveKey('playlistTracks');
}

function movePlaylistToFolder(playlistId, folderId) {
  ensureReady();
  if (store.playlists[playlistId]) {
    store.playlists[playlistId].folder_id = folderId || null;
    saveKey('playlists');
  }
}

// ─── FOLDERS ─────────────────────────────────────────────────────────────────

function createFolder(name) {
  ensureReady();
  const id = crypto.randomUUID();
  store.folders[id] = { id, name, created_at: new Date().toISOString() };
  saveKey('folders');
  return id;
}

function getAllFolders() {
  ensureReady();
  return Object.values(store.folders)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function deleteFolder(id) {
  ensureReady();
  delete store.folders[id];
  // Unlink playlists from this folder
  for (const pl of Object.values(store.playlists)) {
    if (pl.folder_id === id) pl.folder_id = null;
  }
  saveKey('folders');
  saveKey('playlists');
}

// ─── DOWNLOAD QUEUE ───────────────────────────────────────────────────────────

function addToQueue(trackId) {
  ensureReady();
  const item = {
    id: crypto.randomUUID(),
    track_id: trackId,
    status: 'queued',
    progress: 0,
    error: null,
    created_at: new Date().toISOString(),
  };
  store.queue.push(item);
  saveKey('queue');
  return item;
}

function updateQueueItem(id, status, progress, error) {
  ensureReady();
  const item = store.queue.find(q => q.id === id);
  if (item) {
    item.status = status;
    item.progress = progress;
    item.error = error || null;
    item.updated_at = new Date().toISOString();
    saveKey('queue');
  }
}

function getQueueStats() {
  ensureReady();
  const total = store.queue.length;
  const done = store.queue.filter(q => q.status === 'done').length;
  const failed = store.queue.filter(q => q.status === 'failed').length;
  const queued = store.queue.filter(q => q.status === 'queued' || q.status === 'downloading').length;
  return { total, done, failed, queued };
}

function getQueueItems() {
  ensureReady();
  return [...store.queue]
    .reverse()
    .slice(0, 200)
    .map(q => ({
      ...q,
      ...(store.tracks[q.track_id] || {}),
      track_id: q.track_id,
    }));
}

function clearQueue() {
  ensureReady();
  store.queue = [];
  saveKey('queue');
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────

function getSetting(key, defaultVal) {
  ensureReady();
  const v = store.settings[key];
  if (v === undefined) return defaultVal;
  try { return JSON.parse(v); } catch { return v; }
}

function setSetting(key, value) {
  ensureReady();
  store.settings[key] = JSON.stringify(value);
  saveKey('settings');
}

// ─── PLAY HISTORY & STATS ────────────────────────────────────────────────────

function recordPlay(trackId, durationMs) {
  ensureReady();
  if (!Array.isArray(store.playHistory)) store.playHistory = [];
  store.playHistory.push({
    id: crypto.randomUUID(),
    trackId,
    playedAt: new Date().toISOString(),
    duration_ms: durationMs || 0,
  });
  if (store.playHistory.length > 10000) {
    console.warn('Play history exceeded 10000 entries, oldest entries trimmed');
    store.playHistory = store.playHistory.slice(-10000);
  }
  saveKey('playHistory');
  // Also increment play_count on the track
  if (store.tracks[trackId]) {
    store.tracks[trackId].play_count = (store.tracks[trackId].play_count || 0) + 1;
    store.tracks[trackId].last_played = new Date().toISOString();
    saveKey('tracks');
  }
}

function getStatsData() {
  ensureReady();
  const history = Array.isArray(store.playHistory) ? store.playHistory : [];
  const tracks = Object.values(store.tracks);

  // Total listening time in ms
  const totalMs = history.reduce((sum, h) => sum + (h.duration_ms || 0), 0);

  // Play counts per track from history
  const playCountMap = {};
  for (const h of history) {
    playCountMap[h.trackId] = (playCountMap[h.trackId] || 0) + 1;
  }

  // Top tracks (by history play count)
  const topTracks = tracks
    .filter(t => playCountMap[t.id] > 0)
    .sort((a, b) => (playCountMap[b.id] || 0) - (playCountMap[a.id] || 0))
    .slice(0, 20)
    .map(t => ({ ...t, plays: playCountMap[t.id] || 0 }));

  // Top artists (aggregate by artist string)
  const artistMap = {};
  for (const t of tracks) {
    const plays = playCountMap[t.id] || 0;
    if (!plays) continue;
    const artists = (t.artist || '').split(', ');
    for (const a of artists) {
      if (!a) continue;
      if (!artistMap[a]) artistMap[a] = { name: a, plays: 0, ms: 0, image: null };
      artistMap[a].plays += plays;
      artistMap[a].ms += plays * (t.duration_ms || 0);
    }
  }
  const topArtists = Object.values(artistMap)
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 12);

  // Daily heatmap (last 365 days)
  const heatmap = {};
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  for (const h of history) {
    if (new Date(h.playedAt) < cutoff) continue;
    const day = h.playedAt.slice(0, 10);
    heatmap[day] = (heatmap[day] || 0) + 1;
  }

  // Recent plays (last 50)
  const recentPlays = history
    .slice(-50)
    .reverse()
    .map(h => ({ ...h, track: store.tracks[h.trackId] || null }))
    .filter(h => h.track);

  // Streak calculation
  let streak = 0;
  const today = new Date().toISOString().slice(0, 10);
  let checkDay = today;
  while (heatmap[checkDay]) {
    streak++;
    const d = new Date(checkDay);
    d.setDate(d.getDate() - 1);
    checkDay = d.toISOString().slice(0, 10);
  }

  return {
    totalMs,
    totalPlays: history.length,
    uniqueTracks: Object.keys(playCountMap).length,
    topTracks,
    topArtists,
    heatmap,
    recentPlays,
    streak,
  };
}

function getAllSpotifyIds() {
  ensureReady();
  return Object.values(store.tracks)
    .map(t => t.spotify_id)
    .filter(Boolean);
}

function getPlayHistory() {
  ensureReady();
  return Array.isArray(store.playHistory) ? store.playHistory : [];
}

function getTrackById(id) {
  ensureReady();
  return store.tracks[id] || null;
}

function getTopPlayedSpotifyIds(limit = 50) {
  ensureReady();
  const history = Array.isArray(store.playHistory) ? store.playHistory : [];
  const playCountMap = {};
  for (const h of history) {
    playCountMap[h.trackId] = (playCountMap[h.trackId] || 0) + 1;
  }
  return Object.entries(playCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([trackId]) => {
      const track = store.tracks[trackId];
      return track ? track.spotify_id : null;
    })
    .filter(Boolean);
}

function getRecentPlayedSpotifyIds(limit = 10) {
  ensureReady();
  const history = Array.isArray(store.playHistory) ? store.playHistory : [];
  const seen = new Set();
  const result = [];
  for (let i = history.length - 1; i >= 0 && result.length < limit; i--) {
    const track = store.tracks[history[i].trackId];
    if (track && track.spotify_id && !seen.has(track.spotify_id)) {
      seen.add(track.spotify_id);
      result.push(track.spotify_id);
    }
  }
  return result;
}

// ─── SKIP TRACKING ──────────────────────────────────────────────────────────

function recordSkip(trackId, listenedMs, totalMs) {
  ensureReady();
  if (!Array.isArray(store.skipHistory)) store.skipHistory = [];
  store.skipHistory.push({
    id: crypto.randomUUID(),
    trackId,
    listenedMs,
    totalMs,
    skippedAt: new Date().toISOString(),
  });
  if (store.skipHistory.length > 5000) {
    store.skipHistory = store.skipHistory.slice(-5000);
  }
  saveKey('skipHistory');
}

function getSkipHistory() {
  ensureReady();
  return Array.isArray(store.skipHistory) ? store.skipHistory : [];
}

function getSkipRate(trackId) {
  ensureReady();
  const history = Array.isArray(store.playHistory) ? store.playHistory : [];
  const skips = Array.isArray(store.skipHistory) ? store.skipHistory : [];
  const playCount = history.filter(h => h.trackId === trackId).length;
  const skipCount = skips.filter(s => s.trackId === trackId).length;
  const total = playCount + skipCount;
  return total === 0 ? 0 : skipCount / total;
}

function getFrequentlySkippedArtists() {
  ensureReady();
  const history = Array.isArray(store.playHistory) ? store.playHistory : [];
  const skips = Array.isArray(store.skipHistory) ? store.skipHistory : [];

  // Aggregate plays by artist
  const artistPlays = {};
  for (const h of history) {
    const track = store.tracks[h.trackId];
    if (!track || !track.artist) continue;
    const artists = track.artist.split(', ');
    for (const a of artists) {
      if (!a) continue;
      if (!artistPlays[a]) artistPlays[a] = { plays: 0, skips: 0 };
      artistPlays[a].plays++;
    }
  }

  // Aggregate skips by artist
  for (const s of skips) {
    const track = store.tracks[s.trackId];
    if (!track || !track.artist) continue;
    const artists = track.artist.split(', ');
    for (const a of artists) {
      if (!a) continue;
      if (!artistPlays[a]) artistPlays[a] = { plays: 0, skips: 0 };
      artistPlays[a].skips++;
    }
  }

  // Return artists with >60% skip rate
  const result = [];
  for (const [artist, data] of Object.entries(artistPlays)) {
    const total = data.plays + data.skips;
    if (total > 0 && data.skips / total > 0.6) {
      result.push({ artist, skipRate: data.skips / total, total });
    }
  }
  return result;
}

// ─── RECOMMENDATION FEEDBACK ────────────────────────────────────────────────

function recordRecFeedback(trackId, action, strategy) {
  ensureReady();
  if (!Array.isArray(store.recFeedback)) store.recFeedback = [];
  store.recFeedback.push({
    trackId,
    action,
    strategy,
    timestamp: new Date().toISOString(),
  });
  if (store.recFeedback.length > 5000) {
    store.recFeedback = store.recFeedback.slice(-5000);
  }
  saveKey('recFeedback');
}

function getRecFeedbackStats() {
  ensureReady();
  const feedback = Array.isArray(store.recFeedback) ? store.recFeedback : [];

  const strategyStats = {};
  for (const entry of feedback) {
    const s = entry.strategy || 'unknown';
    if (!strategyStats[s]) {
      strategyStats[s] = { played: 0, saved: 0, downloaded: 0, skipped: 0, ignored: 0, total: 0 };
    }
    strategyStats[s].total++;
    if (strategyStats[s][entry.action] !== undefined) {
      strategyStats[s][entry.action]++;
    }
  }

  // Overall conversion rate
  let totalAll = 0;
  let convertedAll = 0;
  let bestStrategy = null;
  let bestConversion = -1;

  for (const [strategy, stats] of Object.entries(strategyStats)) {
    totalAll += stats.total;
    const converted = stats.played + stats.saved + stats.downloaded;
    convertedAll += converted;
    const conversion = stats.total > 0 ? converted / stats.total : 0;
    if (conversion > bestConversion) {
      bestConversion = conversion;
      bestStrategy = strategy;
    }
  }

  return {
    perStrategy: strategyStats,
    overallConversionRate: totalAll > 0 ? convertedAll / totalAll : 0,
    bestPerformingStrategy: bestStrategy,
  };
}

function updatePlaylistImage(playlistId, imagePath) {
  ensureReady();
  if (store.playlists[playlistId]) {
    store.playlists[playlistId].image_url = imagePath;
    store.playlists[playlistId].updated_at = new Date().toISOString();
    saveKey('playlists');
    return true;
  }
  return false;
}

function renamePlaylist(playlistId, name) {
  ensureReady();
  if (store.playlists[playlistId]) {
    store.playlists[playlistId].name = name;
    store.playlists[playlistId].updated_at = new Date().toISOString();
    saveKey('playlists');
    return true;
  }
  return false;
}

function renameFolder(folderId, name) {
  ensureReady();
  if (store.folders[folderId]) {
    store.folders[folderId].name = name;
    saveKey('folders');
    return true;
  }
  return false;
}

// ─── BACKUP / RESTORE ───────────────────────────────────────────────────────

function exportAll() {
  ensureReady();
  return JSON.stringify(store);
}

function importAll(jsonString) {
  ensureReady();
  store = JSON.parse(jsonString);
  loaded = true;
  for (const key of Object.keys(store)) {
    saveKey(key);
  }
}

// ─── PLAYLIST EXPORT / IMPORT ───────────────────────────────────────────────

function exportPlaylist(playlistId) {
  ensureReady();
  const playlist = store.playlists[playlistId];
  if (!playlist) return null;
  const entries = (store.playlistTracks[playlistId] || [])
    .sort((a, b) => (a.position || 0) - (b.position || 0));
  const tracks = entries
    .map(e => store.tracks[e.trackId])
    .filter(Boolean);
  return JSON.stringify({ playlist, tracks });
}

function importPlaylistFromJson(jsonData) {
  ensureReady();
  const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
  if (!data.playlist) throw new Error('Invalid playlist data');
  upsertPlaylist(data.playlist);
  if (Array.isArray(data.tracks)) {
    for (let i = 0; i < data.tracks.length; i++) {
      const saved = upsertTrack(data.tracks[i]);
      addTrackToPlaylist(data.playlist.id, saved.id, i);
    }
  }
  return data.playlist.id;
}

// ─── DUPLICATE DETECTION ────────────────────────────────────────────────────

function findDuplicates() {
  ensureReady();
  const groups = {};
  for (const t of Object.values(store.tracks)) {
    const key = `${(t.title || '').toLowerCase().trim()}|${(t.artist || '').toLowerCase().trim()}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  }
  return Object.values(groups).filter(g => g.length > 1);
}

// ─── REMOVE TRACK FROM PLAYLIST ─────────────────────────────────────────────

function removeTrackFromPlaylist(playlistId, trackId) {
  ensureReady();
  if (!store.playlistTracks[playlistId]) return false;
  store.playlistTracks[playlistId] = store.playlistTracks[playlistId].filter(e => e.trackId !== trackId);
  saveKey('playlistTracks');
  return true;
}

// ─── REORDER PLAYLIST TRACKS ────────────────────────────────────────────────

function reorderPlaylistTrack(playlistId, trackId, newPosition) {
  ensureReady();
  if (!store.playlistTracks[playlistId]) return false;
  const entries = store.playlistTracks[playlistId].sort((a, b) => (a.position || 0) - (b.position || 0));
  const idx = entries.findIndex(e => e.trackId === trackId);
  if (idx === -1) return false;
  const [item] = entries.splice(idx, 1);
  entries.splice(newPosition, 0, item);
  // Reassign positions
  for (let i = 0; i < entries.length; i++) {
    entries[i].position = i;
  }
  store.playlistTracks[playlistId] = entries;
  saveKey('playlistTracks');
  return true;
}

module.exports = {
  upsertTrack, getTrackBySpotifyId, getAllDownloadedTracks, getAllLikedTracks,
  updateTrackDownloaded, updateTrackLiked, incrementPlayCount, searchTracks,
  deleteAllDownloads, deleteTrack,
  upsertPlaylist, getAllPlaylists, getPlaylistTracks, addTrackToPlaylist,
  createLocalPlaylist, deletePlaylist, movePlaylistToFolder,
  createFolder, getAllFolders, deleteFolder,
  addToQueue, updateQueueItem, getQueueStats, getQueueItems, clearQueue,
  getSetting, setSetting,
  recordPlay, getStatsData, getAllSpotifyIds, updatePlaylistImage, renamePlaylist, renameFolder,
  exportAll, importAll,
  exportPlaylist, importPlaylistFromJson,
  findDuplicates,
  removeTrackFromPlaylist,
  reorderPlaylistTrack,
  getPlayHistory, getTrackById, getTopPlayedSpotifyIds, getRecentPlayedSpotifyIds,
  recordSkip, getSkipHistory, getSkipRate, getFrequentlySkippedArtists,
  recordRecFeedback, getRecFeedbackStats,
};
