const { app, BrowserWindow, ipcMain, shell, dialog, protocol, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const crypto = require('crypto');

const isDev = process.env.NODE_ENV === 'development';
const { autoUpdater } = require('electron-updater');

let tray = null;
let isQuitting = false;
const apiCache = new Map();
const activeProcs = new Map(); // trackId -> { proc, queueItemId, cancelled, suppressEvents }

// ─── Single-instance lock + deep-link handler ─────────────────────────────────
// Must happen BEFORE app.whenReady so the second-instance event fires early.

const gotSingleLock = app.requestSingleInstanceLock();

if (!gotSingleLock) {
  // A second instance was launched — just quit; the first instance handles it
  app.quit();
}

// When Windows activates the app via localfy:// URI, a second Electron process
// is spawned. requestSingleInstanceLock makes it quit and fire this event in
// the FIRST instance, passing the command-line args (which contain the URL).
app.on('second-instance', (_event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  const deepLink = argv.find(a => a.startsWith('localfy://'));
  if (deepLink) handleDeepLink(deepLink);
});

// macOS: protocol link opens app directly
app.on('open-url', (event, deepLink) => {
  event.preventDefault();
  handleDeepLink(deepLink);
});

// ─── Register custom protocol (localfy://) ────────────────────────────────────
// In dev mode we point to the electron binary + main.js path so it works
// even before the app is packaged.

function registerProtocol() {
  if (isDev) {
    // electron.exe -- /path/to/main.js %1
    app.setAsDefaultProtocolClient('localfy', process.execPath, [
      '--',
      path.resolve(process.argv[1]),
    ]);
  } else {
    app.setAsDefaultProtocolClient('localfy');
  }
}

// ─── Window ──────────────────────────────────────────────────────────────────

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#07080D',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Minimize to tray instead of quitting when close button is clicked
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  registerProtocol();
  createWindow();

  // ─── System Tray ────────────────────────────────────────────────────────────
  const trayIconPath = path.join(__dirname, '../public/icon.ico');
  const trayIcon = nativeImage.createFromPath(trayIconPath);
  tray = new Tray(trayIcon);
  tray.setToolTip('Localfy');
  const trayMenu = Menu.buildFromTemplate([
    { label: 'Show/Hide Window', click: () => { if (mainWindow) { mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); } } },
    { type: 'separator' },
    { label: 'Play/Pause', click: () => { mainWindow?.webContents.send('media:playPause'); } },
    { label: 'Next', click: () => { mainWindow?.webContents.send('media:next'); } },
    { label: 'Previous', click: () => { mainWindow?.webContents.send('media:prev'); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(trayMenu);
  tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });

  // ─── Media Key Support ──────────────────────────────────────────────────────
  globalShortcut.register('MediaPlayPause', () => { mainWindow?.webContents.send('media:playPause'); });
  globalShortcut.register('MediaNextTrack', () => { mainWindow?.webContents.send('media:next'); });
  globalShortcut.register('MediaPreviousTrack', () => { mainWindow?.webContents.send('media:prev'); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!mainWindow) createWindow(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); });

ipcMain.handle('window:close', () => { isQuitting = true; app.quit(); });

// ─── Auto-Updater ────────────────────────────────────────────────────────────

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger = { info: (...a) => console.log('[updater]', ...a), warn: (...a) => console.warn('[updater]', ...a), error: (...a) => console.error('[updater]', ...a) };

function sendUpdateStatus(status, data = {}) {
  if (mainWindow) mainWindow.webContents.send('updater:status', { status, ...data });
}

autoUpdater.on('checking-for-update', () => sendUpdateStatus('checking'));
autoUpdater.on('update-available', (info) => sendUpdateStatus('available', { version: info.version, releaseNotes: info.releaseNotes }));
autoUpdater.on('update-not-available', () => sendUpdateStatus('up-to-date'));
autoUpdater.on('download-progress', (progress) => sendUpdateStatus('downloading', { percent: Math.round(progress.percent), bytesPerSecond: progress.bytesPerSecond, total: progress.total, transferred: progress.transferred }));
autoUpdater.on('update-downloaded', (info) => sendUpdateStatus('ready', { version: info.version }));
autoUpdater.on('error', (err) => sendUpdateStatus('error', { message: err?.message || 'Update check failed' }));

ipcMain.handle('updater:check', async () => {
  if (isDev) return { status: 'dev', message: 'Updates disabled in dev mode' };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { status: 'ok', updateInfo: result?.updateInfo };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
});

ipcMain.handle('updater:download', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { status: 'ok' };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
});

ipcMain.handle('updater:install', () => {
  isQuitting = true;
  autoUpdater.quitAndInstall(false, true);
});

// Check for updates 30 seconds after launch (production only)
app.whenReady().then(() => {
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 30_000);
  }
});

// ─── Settings helpers ─────────────────────────────────────────────────────────

function getSetting(key, def) {
  return require('./db').getSetting(key, def);
}
function setSetting(key, value) {
  return require('./db').setSetting(key, value);
}

// ─── Spotify OAuth (PKCE + custom URI scheme) ─────────────────────────────────

const SPOTIFY_REDIRECT_URI = 'localfy://callback';
const SPOTIFY_SCOPES = [
  'user-read-private', 'user-read-email', 'user-library-read',
  'playlist-read-private', 'playlist-read-collaborative',
  'user-top-read', 'user-read-recently-played',
].join(' ');

let pendingOAuth = null; // { resolve, reject, state, verifier, clientId }

function handleDeepLink(deepLinkUrl) {
  // deepLinkUrl looks like: localfy://callback?code=...&state=...
  if (!deepLinkUrl.startsWith('localfy://callback')) return;

  // Parse as a normal URL by swapping scheme
  let parsed;
  try {
    parsed = new URL(deepLinkUrl.replace('localfy://callback', 'https://localfy.app/callback'));
  } catch {
    return;
  }

  const code  = parsed.searchParams.get('code');
  const state = parsed.searchParams.get('state');
  const error = parsed.searchParams.get('error');

  const pending = pendingOAuth;
  pendingOAuth = null;
  if (!pending) return;
  const { resolve, reject, state: expectedState, verifier, clientId } = pending;

  if (error) {
    reject(new Error(`Spotify auth error: ${error}`));
    return;
  }

  if (state !== expectedState) {
    reject(new Error('OAuth state mismatch — possible CSRF attack'));
    return;
  }

  // Exchange code for tokens
  exchangeCode(code, clientId, verifier)
    .then(tokens => {
      setSetting('spotify.tokens', JSON.stringify(tokens));
      resolve({ success: true, tokens });
    })
    .catch(err => reject(err));
}

function generateCodeVerifier() {
  return crypto.randomBytes(64).toString('base64url');
}
function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

ipcMain.handle('spotify:login', async (_, clientId) => {
  return new Promise((resolve, reject) => {
    const verifier  = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    const state     = crypto.randomBytes(16).toString('hex');

    setSetting('spotify.clientId', clientId);

    pendingOAuth = { resolve, reject, state, verifier, clientId };

    const params = new URLSearchParams({
      response_type:         'code',
      client_id:             clientId,
      scope:                 SPOTIFY_SCOPES,
      redirect_uri:          SPOTIFY_REDIRECT_URI,
      code_challenge_method: 'S256',
      code_challenge:        challenge,
      state,
    });

    shell.openExternal(`https://accounts.spotify.com/authorize?${params}`);

    // Timeout after 5 minutes
    setTimeout(() => {
      if (pendingOAuth) {
        pendingOAuth = null;
        reject(new Error('Login timed out. Please try again.'));
      }
    }, 300_000);
  });
});

async function exchangeCode(code, clientId, verifier) {
  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  SPOTIFY_REDIRECT_URI,
    client_id:     clientId,
    code_verifier: verifier,
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${txt}`);
  }
  const data = await res.json();
  data.expires_at = Date.now() + data.expires_in * 1000;
  return data;
}

ipcMain.handle('spotify:logout', () => {
  setSetting('spotify.tokens', '');
  setSetting('spotify.clientId', '');
});

ipcMain.handle('spotify:getTokens', () => {
  const raw = getSetting('spotify.tokens', '');
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
});

ipcMain.handle('spotify:refreshToken', async () => {
  const raw      = getSetting('spotify.tokens', '');
  const tokens   = raw ? JSON.parse(raw) : null;
  const clientId = getSetting('spotify.clientId', '');
  if (!tokens || !clientId) throw new Error('Not logged in');

  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id:     clientId,
  });

  const res  = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${txt}`);
  }
  const data = await res.json();
  data.expires_at = Date.now() + data.expires_in * 1000;
  if (!data.refresh_token) data.refresh_token = tokens.refresh_token;
  setSetting('spotify.tokens', JSON.stringify(data));
  return data;
});

// ─── Spotify API Helper ───────────────────────────────────────────────────────

async function spotifyFetch(endpoint, options = {}) {
  const raw = getSetting('spotify.tokens', '');
  let tokens = raw ? JSON.parse(raw) : null;
  if (!tokens) throw new Error('Not authenticated');

  if (Date.now() > (tokens.expires_at || 0) - 60_000) {
    const clientId = getSetting('spotify.clientId', '');
    const body = new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id:     clientId,
    });
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    tokens = await r.json();
    tokens.expires_at = Date.now() + tokens.expires_in * 1000;
    if (!tokens.refresh_token) {
      const prev = JSON.parse(getSetting('spotify.tokens', '{}'));
      tokens.refresh_token = prev.refresh_token;
    }
    setSetting('spotify.tokens', JSON.stringify(tokens));
  }

  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Spotify ${endpoint}: ${res.status} — ${err}`);
  }
  return res.json();
}

// ─── Spotify API Caching ─────────────────────────────────────────────────────

async function cachedSpotifyFetch(endpoint, ttlMs = 60000) {
  const cached = apiCache.get(endpoint);
  if (cached && (Date.now() - cached.timestamp) < ttlMs) {
    return cached.data;
  }
  const data = await spotifyFetch(endpoint);
  apiCache.set(endpoint, { data, timestamp: Date.now() });
  return data;
}

ipcMain.handle('cache:clear', () => { apiCache.clear(); });

// ─── Spotify Data Handlers ────────────────────────────────────────────────────

ipcMain.handle('spotify:getMe', () => spotifyFetch('/me'));

ipcMain.handle('spotify:getRecommendations', async () => {
  // /recommendations is deprecated for new apps — fall back to top tracks
  let mediumItems = [];
  try {
    const top = await spotifyFetch('/me/top/tracks?limit=20&time_range=medium_term');
    mediumItems = top.items || [];
  } catch {}
  if (mediumItems.length) return { tracks: mediumItems };
  try {
    const short = await spotifyFetch('/me/top/tracks?limit=20&time_range=short_term');
    return { tracks: short.items || [] };
  } catch { return { tracks: [] }; }
});

ipcMain.handle('spotify:getRecentlyPlayed', async () => {
  try {
    const data = await spotifyFetch('/me/player/recently-played?limit=20');
    // De-duplicate by track id
    const seen = new Set();
    const tracks = (data.items || [])
      .map(i => i.track)
      .filter(t => { if (!t || seen.has(t.id)) return false; seen.add(t.id); return true; });
    return { tracks };
  } catch { return { tracks: [] }; }
});

ipcMain.handle('spotify:getLikedSongs', async (_, offset = 0) =>
  spotifyFetch(`/me/tracks?limit=50&offset=${offset}`)
);

ipcMain.handle('spotify:getPlaylists', async () => {
  const all = [];
  let endpoint = '/me/playlists?limit=50';
  while (endpoint) {
    const data = await spotifyFetch(endpoint);
    all.push(...(data.items || []));
    endpoint = data.next ? data.next.replace('https://api.spotify.com/v1', '') : null;
  }
  return all;
});

ipcMain.handle('spotify:getPlaylist', (_, id) =>
  spotifyFetch(`/playlists/${id}/tracks?limit=100`)
);

ipcMain.handle('spotify:search', (_, q) =>
  spotifyFetch(`/search?q=${encodeURIComponent(q)}&type=track,album,artist,playlist&limit=20`)
);

// /browse/featured-playlists was removed from Spotify API in 2024 — use user's own playlists instead
ipcMain.handle('spotify:getFeatured', async () => {
  try {
    const data = await cachedSpotifyFetch('/me/playlists?limit=8', 120000);
    // Return in the same shape the Home page expects: { playlists: { items: [...] } }
    return { playlists: { items: data.items || [] } };
  } catch (e) {
    return { playlists: { items: [] } };
  }
});
ipcMain.handle('spotify:getNewReleases', () => cachedSpotifyFetch('/browse/new-releases?limit=10', 300000));
ipcMain.handle('spotify:getCategories',  () => cachedSpotifyFetch('/browse/categories?limit=20', 300000));

ipcMain.handle('spotify:getArtist', (_, id) => cachedSpotifyFetch(`/artists/${id}`, 300000));
ipcMain.handle('spotify:getArtistTopTracks', (_, id) =>
  spotifyFetch(`/artists/${id}/top-tracks?market=from_token`)
);
ipcMain.handle('spotify:getArtistAlbums', (_, id) =>
  spotifyFetch(`/artists/${id}/albums?include_groups=album,single&market=from_token&limit=20`)
);
ipcMain.handle('spotify:getAlbumTracks', (_, id) =>
  spotifyFetch(`/albums/${id}/tracks?limit=50`)
);
// /artists/{id}/related-artists was removed from Spotify API in 2024 — return empty gracefully
ipcMain.handle('spotify:getRelatedArtists', async (_, id) => {
  try {
    return await cachedSpotifyFetch(`/artists/${id}/related-artists`, 300000);
  } catch (e) {
    return { artists: [] };
  }
});

ipcMain.handle('spotify:getTopArtists', (_, range = 'medium_term') =>
  spotifyFetch(`/me/top/artists?limit=10&time_range=${range}`)
);
ipcMain.handle('spotify:getDiscoverTracks', async () => {
  try {
    const [topTracks, topArtists] = await Promise.all([
      spotifyFetch('/me/top/tracks?limit=5&time_range=short_term'),
      spotifyFetch('/me/top/artists?limit=5&time_range=short_term'),
    ]);
    const seedTracks = (topTracks?.items || []).slice(0, 3).map(t => t.id);
    const seedArtists = (topArtists?.items || []).slice(0, 2).map(a => a.id);
    const params = new URLSearchParams({ limit: '50' });
    if (seedTracks.length) params.set('seed_tracks', seedTracks.join(','));
    if (seedArtists.length) params.set('seed_artists', seedArtists.join(','));
    const recs = await spotifyFetch(`/recommendations?${params}`);
    // Filter out tracks already in local DB
    const known = new Set(db.getAllSpotifyIds());
    const fresh = (recs?.tracks || []).filter(t => !known.has(t.id));
    return { tracks: fresh, seeds: { artists: topArtists?.items?.slice(0, 5) || [], tracks: topTracks?.items?.slice(0, 5) || [] } };
  } catch (e) {
    return { tracks: [], seeds: { artists: [], tracks: [] }, error: e.message };
  }
});

// ─── DB Handlers ─────────────────────────────────────────────────────────────

const db = require('./db');
const { getSmartRecommendations } = require('./recommendations');

// ─── Smart Recommendations ──────────────────────────────────────────────────

ipcMain.handle('recommendations:get', async () => {
  return getSmartRecommendations(db, spotifyFetch, cachedSpotifyFetch);
});

ipcMain.handle('db:getDownloaded',      ()       => db.getAllDownloadedTracks());
ipcMain.handle('db:getLiked',           ()       => db.getAllLikedTracks());
ipcMain.handle('db:getTrack',           (_, query = {}) => {
  if (query.id) {
    const byId = db.getTrackById(query.id);
    if (byId) return byId;
  }
  if (query.spotifyId) return db.getTrackBySpotifyId(query.spotifyId);
  return null;
});
ipcMain.handle('db:getPlaylists',       ()       => db.getAllPlaylists());
ipcMain.handle('db:getPlaylistTracks',  (_, id)  => db.getPlaylistTracks(id));
ipcMain.handle('db:getFolders',         ()       => db.getAllFolders());
ipcMain.handle('db:searchTracks',       (_, q)   => db.searchTracks(q));
ipcMain.handle('db:createPlaylist',     (_, n, f) => db.createLocalPlaylist(n, f));
ipcMain.handle('db:deletePlaylist',     (_, id)  => db.deletePlaylist(id));
ipcMain.handle('db:createFolder',       (_, n)   => db.createFolder(n));
ipcMain.handle('db:deleteFolder',       (_, id)  => db.deleteFolder(id));
ipcMain.handle('db:movePlaylist',       (_, p,f) => db.movePlaylistToFolder(p, f));
ipcMain.handle('db:incrementPlay',      (_, id)  => db.incrementPlayCount(id));
ipcMain.handle('db:deleteAllDownloads', ()       => db.deleteAllDownloads());

ipcMain.handle('db:toggleLike', (_, track) => {
  const existing = db.getTrackBySpotifyId(track.spotify_id);
  if (existing) {
    const nowLiked = !existing.liked;
    db.updateTrackLiked(existing.id, nowLiked);
    return nowLiked;
  }
  db.upsertTrack({ ...track, id: crypto.randomUUID(), liked: 1 });
  return true;
});

ipcMain.handle('db:recordPlay',          (_, trackId, durationMs) => db.recordPlay(trackId, durationMs));
ipcMain.handle('db:getStatsData',        () => db.getStatsData());
ipcMain.handle('db:getAllSpotifyIds',    () => db.getAllSpotifyIds());
ipcMain.handle('db:updatePlaylistImage', (_, playlistId, imagePath) => db.updatePlaylistImage(playlistId, imagePath));
ipcMain.handle('db:renamePlaylist',      (_, id, name) => db.renamePlaylist(id, name));
ipcMain.handle('db:renameFolder',        (_, id, name) => db.renameFolder(id, name));

ipcMain.handle('db:removeTrackFromPlaylist', (_, playlistId, trackId) => db.removeTrackFromPlaylist(playlistId, trackId));
ipcMain.handle('db:reorderPlaylistTrack', (_, playlistId, trackId, newPosition) => db.reorderPlaylistTrack(playlistId, trackId, newPosition));
ipcMain.handle('db:findDuplicates', () => db.findDuplicates());

// ─── Skip Detection ─────────────────────────────────────────────────────────
ipcMain.handle('db:recordSkip',           (_, trackId, listenedMs, totalMs) => db.recordSkip(trackId, listenedMs, totalMs));
ipcMain.handle('db:getSkipHistory',       () => db.getSkipHistory());

// ─── Recommendation Feedback ────────────────────────────────────────────────
ipcMain.handle('db:recordRecFeedback',    (_, trackId, action, strategy) => db.recordRecFeedback(trackId, action, strategy));
ipcMain.handle('db:getRecFeedbackStats',  () => db.getRecFeedbackStats());

// ─── Backup / Restore ────────────────────────────────────────────────────────

ipcMain.handle('db:export', async () => {
  const data = db.exportAll();
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Database Backup',
    defaultPath: 'localfy-backup.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, data, 'utf8');
  return result.filePath;
});

ipcMain.handle('db:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Database Backup',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const data = fs.readFileSync(result.filePaths[0], 'utf8');
  db.importAll(data);
  return { success: true };
});

// ─── Playlist Export / Import ────────────────────────────────────────────────

ipcMain.handle('playlist:export', async (_, playlistId) => {
  const data = db.exportPlaylist(playlistId);
  if (!data) return null;
  const parsed = JSON.parse(data);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Playlist',
    defaultPath: `${(parsed.playlist.name || 'playlist').replace(/[<>:"/\\|?*]/g, '_')}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, data, 'utf8');
  return result.filePath;
});

ipcMain.handle('playlist:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Playlist',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const data = fs.readFileSync(result.filePaths[0], 'utf8');
  const playlistId = db.importPlaylistFromJson(data);
  return { success: true, playlistId };
});

// ─── Offline Detection ───────────────────────────────────────────────────────

ipcMain.handle('network:status', () => {
  const dns = require('dns');
  return dns.promises.lookup('api.spotify.com').then(() => true).catch(() => false);
});

ipcMain.handle('settings:chooseImage', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Playlist Image',
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const fp = result.filePaths[0].replace(/\\/g, '/');
  return fp.startsWith('/') ? `file://${fp}` : `file:///${fp}`;
});

// ─── Import ───────────────────────────────────────────────────────────────────

ipcMain.handle('import:likedSongs', async () => {
  let offset = 0, total = 0, imported = 0;
  try {
    do {
      const data = await spotifyFetch(`/me/tracks?limit=50&offset=${offset}`);
      total = data.total || 0;
      for (const item of (data.items || [])) {
        const t = item.track;
        if (!t) continue;
        db.upsertTrack({
          id: crypto.randomUUID(), spotify_id: t.id,
          title: t.name, artist: t.artists?.map(a => a.name).join(', ') || '',
          album: t.album?.name || '', album_art: t.album?.images?.[0]?.url || '',
          duration_ms: t.duration_ms, liked: 1,
        });
        imported++;
      }
      mainWindow?.webContents.send('import:progress', { imported, total, type: 'liked' });
      offset += 50;
    } while (offset < total);
    return { success: true, imported, total };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('import:playlists', async () => {
  try {
    const playlists = await spotifyFetch('/me/playlists?limit=50');
    const items = playlists.items || [];
    let imported = 0;
    for (const pl of items) {
      db.upsertPlaylist({
        id: pl.id, spotify_id: pl.id, name: pl.name,
        description: pl.description || '', image_url: pl.images?.[0]?.url || '',
        owner: pl.owner?.display_name || '', folder_id: null,
      });
      let endpoint = `/playlists/${pl.id}/tracks?limit=100`;
      let pos = 0;
      while (endpoint) {
        const td = await spotifyFetch(endpoint);
        for (const item of (td.items || [])) {
          const t = item.track;
          if (!t || t.is_local) continue;
          const saved = db.upsertTrack({
            id: crypto.randomUUID(), spotify_id: t.id, title: t.name,
            artist: t.artists?.map(a => a.name).join(', ') || '',
            album: t.album?.name || '', album_art: t.album?.images?.[0]?.url || '',
            duration_ms: t.duration_ms, liked: 0,
          });
          db.addTrackToPlaylist(pl.id, saved.id, pos++);
        }
        endpoint = td.next ? td.next.replace('https://api.spotify.com/v1', '') : null;
      }
      imported++;
      mainWindow?.webContents.send('import:progress', { imported, total: items.length, type: 'playlists' });
    }
    return { success: true, imported };
  } catch (e) { return { success: false, error: e.message }; }
});

// ─── Downloads ────────────────────────────────────────────────────────────────

let downloadQueue  = [];
let isDownloading  = false;
const AUDIO_EXTENSIONS = /\.(mp3|m4a|opus|ogg|webm)$/i;

function getDownloadPath() {
  const custom = getSetting('downloadPath', '');
  if (custom && fs.existsSync(custom)) return custom;
  const dir = path.join(app.getPath('music'), 'Localfy');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function findYtDlp() {
  const candidates = [
    'yt-dlp',
    'yt-dlp.exe',
    path.join(app.getPath('userData'), 'yt-dlp.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'yt-dlp', 'yt-dlp.exe'),
  ];
  for (const c of candidates) {
    try { execSync(`"${c}" --version`, { stdio: 'ignore', timeout: 5000 }); return c; }
    catch { continue; }
  }
  return null;
}

ipcMain.handle('download:checkYtDlp', () => {
  const ytDlp = findYtDlp();
  return { available: !!ytDlp, path: ytDlp };
});

function emitDownloadProgress(job, status, progress = 0, extra = {}) {
  if (job?.queueItemId) {
    db.updateQueueItem(job.queueItemId, status, progress, extra.error);
  }
  mainWindow?.webContents.send('download:progress', {
    queueItemId: job?.queueItemId || null,
    trackId: job?.track?.id || extra.trackId,
    status,
    progress,
    title: job?.track?.title || extra.title,
    artist: job?.track?.artist || extra.artist,
    ...extra,
  });
}

function resolveStoredTrack(track) {
  if (!track) return null;
  if (track.id) {
    const byId = db.getTrackById(track.id);
    if (byId) return byId;
  }
  if (track.spotify_id) {
    const bySpotifyId = db.getTrackBySpotifyId(track.spotify_id);
    if (bySpotifyId) return bySpotifyId;
  }
  return null;
}

function isDownloadedLocally(track) {
  return !!(track?.downloaded && track?.file_path && fs.existsSync(track.file_path));
}

function findDownloadedFile(downloadDir, safeName, audioFormat, existingFiles) {
  const exact = path.join(downloadDir, `${safeName}.${audioFormat}`);
  if (fs.existsSync(exact)) return exact;

  const files = fs.readdirSync(downloadDir).filter(f => AUDIO_EXTENSIONS.test(f));
  const lowerSafeName = safeName.toLowerCase();
  const preferred = files.filter(file => {
    const lowerFile = file.toLowerCase();
    return !existingFiles.has(file) || lowerFile.startsWith(lowerSafeName);
  });

  preferred.sort((a, b) => {
    try {
      return fs.statSync(path.join(downloadDir, b)).mtimeMs - fs.statSync(path.join(downloadDir, a)).mtimeMs;
    } catch {
      return 0;
    }
  });

  const exactNameMatch = preferred.find(file => path.parse(file).name.toLowerCase() === lowerSafeName);
  if (exactNameMatch) return path.join(downloadDir, exactNameMatch);
  if (preferred[0]) return path.join(downloadDir, preferred[0]);

  const legacyBase = safeName.substring(0, 40).toLowerCase();
  const fallback = files.find(file => file.toLowerCase().startsWith(legacyBase));
  return fallback ? path.join(downloadDir, fallback) : null;
}

function enqueueTrackDownload(track) {
  const saved = resolveStoredTrack(track) || db.upsertTrack(track);
  if (isDownloadedLocally(saved)) {
    return { queued: false, alreadyDownloaded: true, track: saved, filePath: saved.file_path };
  }

  const existingQueueItem = db.getQueueItems().find(item =>
    item.track_id === saved.id && (item.status === 'queued' || item.status === 'downloading')
  );
  if (existingQueueItem) {
    return {
      queued: false,
      duplicate: true,
      queueItemId: existingQueueItem.id,
      existingStatus: existingQueueItem.status,
      track: saved,
    };
  }

  const queueItem = db.addToQueue(saved.id);
  const job = { track: saved, queueItemId: queueItem.id };
  downloadQueue.push(job);
  emitDownloadProgress(job, 'queued', 0);
  processDownloadQueue();
  return { queued: true, queueItemId: queueItem.id, track: saved };
}

async function downloadSingleTrack(job) {
  return new Promise((resolve) => {
    const track = job.track;
    const downloadDir = getDownloadPath();
    let existingFiles = new Set();
    try {
      existingFiles = new Set(fs.readdirSync(downloadDir));
    } catch {}

    // ── Disk space check ────────────────────────────────────────────────────
    try {
      const stat = fs.statfsSync(downloadDir);
      const freeBytes = stat.bfree * stat.bsize;
      if (freeBytes < 100 * 1024 * 1024) {
        emitDownloadProgress(job, 'failed', 0, { error: 'Low disk space' });
        resolve({ success: false, error: 'Low disk space' });
        return;
      }
    } catch {}

    const ytDlp = findYtDlp();
    if (!ytDlp) {
      emitDownloadProgress(job, 'failed', 0, { error: 'yt-dlp not found' });
      resolve({ success: false, error: 'yt-dlp not found' });
      return;
    }

    // ── Custom filename pattern ─────────────────────────────────────────────
    const filenamePattern = getSetting('download.filenamePattern', '{artist} - {title}');
    const safeName = filenamePattern
      .replace(/\{artist\}/g, track.artist || '')
      .replace(/\{title\}/g, track.title || '')
      .replace(/\{album\}/g, track.album || '')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').substring(0, 100);

    // ── Audio format selection ──────────────────────────────────────────────
    const audioFormat = String(getSetting('audio.format', 'mp3'));
    const audioQuality = String(getSetting('audio.quality', '0'));
    const outTemplate = path.join(downloadDir, `${safeName}.%(ext)s`);

    const args = [
      `ytsearch1:${track.artist} ${track.title} audio`,
      '-x', '--audio-format', audioFormat, '--audio-quality', audioQuality,
      '-o', outTemplate,
      '--no-playlist', '--socket-timeout', '30', '--retries', '3', '--no-part',
    ];

    emitDownloadProgress(job, 'downloading', 0);

    const proc = spawn(ytDlp, args, { windowsHide: true });

    // Track active process for cancellation support
    const procMeta = { proc, queueItemId: job.queueItemId, cancelled: false, suppressEvents: false };
    activeProcs.set(track.id, procMeta);

    const handleProgressChunk = (chunk) => {
      const pct = chunk.toString().match(/(\d+\.?\d*)%/);
      if (pct) {
        emitDownloadProgress(job, 'downloading', parseFloat(pct[1]));
      }
    };

    proc.stdout.on('data', handleProgressChunk);

    // ── Collect stderr for failure logging ──────────────────────────────────
    const stderrChunks = [];
    proc.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk.toString());
      handleProgressChunk(chunk);
    });

    proc.on('close', (code) => {
      activeProcs.delete(track.id);
      if (procMeta.cancelled) {
        if (!procMeta.suppressEvents) {
          emitDownloadProgress(job, 'failed', 0, { error: 'Cancelled' });
        }
        resolve({ success: false, error: 'Cancelled' });
        return;
      }

      if (code === 0) {
        let foundPath = null;
        try {
          foundPath = findDownloadedFile(downloadDir, safeName, audioFormat, existingFiles);
        } catch {}

        if (foundPath) {
          db.updateTrackDownloaded(track.id, foundPath);
          emitDownloadProgress(job, 'done', 100, { filePath: foundPath });
          resolve({ success: true, filePath: foundPath });
        } else {
          emitDownloadProgress(job, 'failed', 0, { error: 'File not found after download' });
          resolve({ success: false, error: 'File not found after download' });
        }
      } else {
        const stderrOutput = stderrChunks.join('').substring(0, 500);
        const errorMsg = `Exit code ${code}${stderrOutput ? ': ' + stderrOutput : ''}`;
        emitDownloadProgress(job, 'failed', 0, { error: errorMsg });
        resolve({ success: false, error: `yt-dlp exit code ${code}${stderrOutput ? ': ' + stderrOutput : ''}` });
      }
    });

    proc.on('error', (err) => {
      activeProcs.delete(track.id);
      if (procMeta.cancelled && procMeta.suppressEvents) {
        resolve({ success: false, error: 'Cancelled' });
        return;
      }
      emitDownloadProgress(job, 'failed', 0, { error: err.message });
      resolve({ success: false, error: err.message });
    });
  });
}

async function processDownloadQueue() {
  if (isDownloading || downloadQueue.length === 0) return;
  isDownloading = true;
  while (downloadQueue.length > 0) {
    await downloadSingleTrack(downloadQueue.shift());
  }
  isDownloading = false;
}

ipcMain.handle('download:track', async (_, track) => {
  return enqueueTrackDownload(track);
});

ipcMain.handle('download:all', async (_, tracks) => {
  let queued = 0;
  for (const track of tracks) {
    const result = enqueueTrackDownload(track);
    if (result.queued) queued += 1;
  }
  return { queued };
});

ipcMain.handle('download:getStats',   ()  => db.getQueueStats());
ipcMain.handle('download:getQueue',   ()  => db.getQueueItems());
ipcMain.handle('download:clearQueue', ()  => {
  downloadQueue = [];
  for (const procMeta of activeProcs.values()) {
    procMeta.cancelled = true;
    procMeta.suppressEvents = true;
    procMeta.proc.kill();
  }
  db.clearQueue();
});

ipcMain.handle('download:cancel', (_, trackId) => {
  const procMeta = activeProcs.get(trackId);
  if (procMeta) {
    procMeta.cancelled = true;
    procMeta.proc.kill();
  }

  let cancelled = !!procMeta;
  downloadQueue = downloadQueue.filter(job => {
    if (job.track.id !== trackId) return true;
    emitDownloadProgress(job, 'failed', 0, { error: 'Cancelled' });
    cancelled = true;
    return false;
  });

  return { cancelled };
});

ipcMain.handle('download:retryFailed', async () => {
  const failed = db.getQueueItems().filter(i => i.status === 'failed');
  const seen = new Set();
  let requeued = 0;
  for (const item of failed) {
    if (seen.has(item.track_id)) continue;
    seen.add(item.track_id);
    const track = db.getTrackById(item.track_id);
    if (!track) continue;
    const result = enqueueTrackDownload(track);
    if (result.queued) requeued += 1;
  }
  return { requeued };
});

// ─── Settings ─────────────────────────────────────────────────────────────────

ipcMain.handle('settings:get',             (_, k, d) => getSetting(k, d));
ipcMain.handle('settings:set',             (_, k, v) => setSetting(k, v));
ipcMain.handle('settings:getDownloadPath', ()         => getDownloadPath());

ipcMain.handle('settings:chooseDownloadPath', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'], title: 'Choose Download Folder',
  });
  if (!result.canceled && result.filePaths[0]) {
    setSetting('downloadPath', result.filePaths[0]);
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('settings:deleteAllFiles', async () => {
  const dlPath = getDownloadPath();
  try {
    const files = fs.readdirSync(dlPath)
      .filter(f => /\.(mp3|m4a|opus|webm)$/.test(f));
    for (const f of files) {
      try { fs.unlinkSync(path.join(dlPath, f)); } catch {}
    }
    db.deleteAllDownloads();
    db.clearQueue();
    return { success: true, deleted: files.length };
  } catch (e) { return { success: false, error: e.message }; }
});

// ─── Player ───────────────────────────────────────────────────────────────────

ipcMain.handle('player:getFileUrl', (_, filePath) => {
  if (!filePath) return null;
  try {
    if (!fs.existsSync(filePath)) return null;
    // Convert Windows backslashes and return a standard file:// URL
    // Windows: C:\Music\song.mp3  →  file:///C:/Music/song.mp3
    const normalized = filePath.replace(/\\/g, '/');
    const fileUrl = normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
    return fileUrl;
  } catch { return null; }
});

// ─── Window controls ──────────────────────────────────────────────────────────

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});

// ─── Discord Rich Presence ────────────────────────────────────────────────────

let discordClient = null;
let discordReady = false;

function initDiscord(clientId) {
  if (!clientId) return;
  try {
    const DiscordRPC = require('discord-rpc');
    DiscordRPC.register(clientId);
    if (discordClient) {
      try { discordClient.destroy(); } catch {}
      discordClient = null;
      discordReady = false;
    }
    discordClient = new DiscordRPC.Client({ transport: 'ipc' });
    discordClient.on('ready', () => { discordReady = true; });
    discordClient.login({ clientId }).catch((err) => {
      console.warn('[Discord RPC] Login failed:', err.message);
      discordReady = false;
    });
  } catch (err) {
    console.warn('[Discord RPC] Init failed:', err.message);
  }
}

app.whenReady().then(() => {
  const clientId = getSetting('discord.clientId', '');
  if (clientId) initDiscord(clientId);
}).catch(() => {});

ipcMain.handle('discord:setClientId', (_, clientId) => {
  setSetting('discord.clientId', clientId);
  if (clientId) initDiscord(clientId);
  else {
    if (discordClient) { try { discordClient.destroy(); } catch {} discordClient = null; discordReady = false; }
  }
  return { success: true };
});

ipcMain.handle('discord:getClientId', () => getSetting('discord.clientId', ''));

ipcMain.handle('discord:updatePresence', (_, data) => {
  if (!discordReady || !discordClient) return;
  try {
    const cap = (s, n) => s && s.length > n ? s.substring(0, n - 1) + '…' : (s || '');
    const imageKey = data.albumArt && data.albumArt.startsWith('https://') ? data.albumArt : 'localfy';
    const activity = {
      details: cap(data.title, 128) || 'Unknown Track',
      state: cap(data.artist, 128) || 'Unknown Artist',
      largeImageKey: imageKey,
      instance: false,
    };
    // Compute startTimestamp here (in main process, right before RPC fires) to
    // avoid IPC-round-trip delay. data.elapsedSeconds tells us how far into the
    // track we are; omitting it means we're paused (Discord stops the timer).
    if (typeof data.elapsedSeconds === 'number') {
      activity.startTimestamp = Math.floor(Date.now() / 1000) - Math.floor(data.elapsedSeconds);
    }
    discordClient.setActivity(activity);
  } catch (err) {
    console.warn('[Discord RPC] setActivity failed:', err.message);
  }
});

ipcMain.handle('discord:clearPresence', () => {
  if (discordReady && discordClient) {
    try { discordClient.clearActivity(); } catch {}
  }
});

// ─── Misc ─────────────────────────────────────────────────────────────────────

ipcMain.handle('misc:openExternal', (_, u) => shell.openExternal(u));
ipcMain.handle('misc:getVersion',   ()      => app.getVersion());
