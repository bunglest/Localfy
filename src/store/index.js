import { create } from 'zustand';

// ─── Persistence helpers ─────────────────────────────────────────────────────
function persistState(key, partialState) {
  try { localStorage.setItem(`localfy:${key}`, JSON.stringify(partialState)); } catch {}
}
function loadPersistedState(key, defaults) {
  try {
    const saved = localStorage.getItem(`localfy:${key}`);
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  } catch { return defaults; }
}

// ─── Toast helpers ────────────────────────────────────────────────────────────
let toastId = 0;

export const useToastStore = create((set) => ({
  toasts: [],
  add: (msg, type = 'info', duration = 3500) => {
    const id = ++toastId;
    set(s => ({ toasts: [...s.toasts, { id, msg, type }] }));
    if (duration > 0) setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), duration);
  },
  remove: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));

// ─── Auth store ───────────────────────────────────────────────────────────────
export const useAuthStore = create((set, get) => ({
  user: null,
  tokens: null,
  loggedIn: false,
  loading: true,
  error: null,

  setError: (msg) => set({ error: msg }),
  clearError: () => set({ error: null }),

  init: async () => {
    try {
      const tokens = await window.localfy.spotifyGetTokens();
      if (!tokens) { set({ loading: false }); return; }
      set({ tokens });
      const user = await window.localfy.spotifyGetMe();
      set({ user, loggedIn: true, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  login: async (clientId) => {
    const result = await window.localfy.spotifyLogin(clientId);
    if (result.success) {
      const user = await window.localfy.spotifyGetMe();
      set({ user, loggedIn: true, tokens: result.tokens });
    }
    return result;
  },

  logout: async () => {
    await window.localfy.spotifyLogout();
    set({ user: null, tokens: null, loggedIn: false });
  },
}));

// ─── Plain (non-reactive) seeking flag ────────────────────────────────────────
// Using a plain variable instead of Zustand state prevents any re-render when
// the flag changes, which is critical — a re-render during drag resets the fill
// element's inline style, causing the progress bar to snap back to its old position.
export const seekingFlag = { current: false };

// ─── Player store ─────────────────────────────────────────────────────────────
const playerDefaults = loadPersistedState('player', {
  volume: 0.8,
  speed: 1,
  pitchPreserve: true,
  shuffle: false,
  repeat: 'off',
});

function persistPlayerPrefs(state) {
  persistState('player', {
    volume: state.volume,
    speed: state.speed,
    pitchPreserve: state.pitchPreserve,
    shuffle: state.shuffle,
    repeat: state.repeat,
  });
}

function sameTrack(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  return !!(a.spotify_id && b.spotify_id && a.spotify_id === b.spotify_id);
}

function mergeTrackRecord(track, savedTrack) {
  return savedTrack ? { ...track, ...savedTrack } : track;
}

export function isTrackPending(track) {
  return !!track?.pendingJobId;
}

function mergeQueueTrack(queue, patch) {
  return queue.map(track => sameTrack(track, patch) ? { ...track, ...patch } : track);
}

function buildActiveDownloadsFromJobs(jobs) {
  return jobs.reduce((acc, item) => {
    if (!item?.trackId && !item?.track_id) return acc;
    const trackId = item.trackId || item.track_id;
    const prev = acc[trackId];
    const prevUpdated = new Date(prev?.updatedAt || 0).getTime();
    const itemUpdated = new Date(item.updatedAt || item.updated_at || item.requestedAt || item.requested_at || 0).getTime();
    if (!prev || itemUpdated >= prevUpdated) {
      acc[trackId] = {
        progress: item.progress || 0,
        status: item.state || item.status,
        title: item.title,
        artist: item.artist,
        filePath: item.filePath || item.file_path,
        jobId: item.id,
        error: item.lastError || item.error,
        updatedAt: item.updatedAt || item.updated_at || item.requestedAt || item.requested_at || null,
      };
    }
    return acc;
  }, {});
}

export const usePlayerStore = create((set, get) => ({
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  playing: false,
  progress: 0,
  duration: 0,
  volume: playerDefaults.volume,
  speed: playerDefaults.speed,
  pitchPreserve: playerDefaults.pitchPreserve,
  shuffle: playerDefaults.shuffle,
  repeat: playerDefaults.repeat,
  audioEl: null,

  setAudioEl: (el) => set({ audioEl: el }),

  playTrack: async (track, queue = null) => {
    const { audioEl } = get();
    const savedTrack = await window.localfy.dbGetTrack({
      id: track.id,
      spotifyId: track.spotify_id,
    }).catch(() => null);
    const resolvedTrack = mergeTrackRecord(track, savedTrack);
    const fileUrl = resolvedTrack.file_path ? await window.localfy.playerGetFileUrl(resolvedTrack.file_path) : null;
    const newQueue = (queue || [track]).map(item => sameTrack(item, resolvedTrack) ? mergeTrackRecord(item, resolvedTrack) : item);
    const idx = queue ? Math.max(0, newQueue.findIndex(item => sameTrack(item, resolvedTrack))) : 0;

    if (!fileUrl) {
      // Not downloaded — queue it for download automatically
      const result = await window.localfy.downloadEnqueue(resolvedTrack, {
        intent: 'play_when_ready',
        autoPlay: true,
      }).catch(() => null);
      if (result?.alreadyDownloaded && result.filePath) {
        get().playTrack({ ...resolvedTrack, file_path: result.filePath, downloaded: true }, newQueue);
        return;
      }
      useToastStore.getState().add(`Downloading "${track.title}"… click again when ready`, 'info');
      // Still set as current track so the UI shows what's loading
      set({
        currentTrack: { ...resolvedTrack, pendingJobId: result?.jobId || null },
        queue: newQueue,
        queueIndex: idx,
        playing: false,
      });
      return;
    }

    if (audioEl) {
      audioEl.src = fileUrl;
      audioEl.volume = get().volume;
      audioEl.playbackRate = get().speed || 1;
      audioEl.preservesPitch = get().pitchPreserve !== false;
      audioEl.play().catch((err) => {
        console.error('Audio play failed:', err);
        useToastStore.getState().add('Playback failed — file may be missing', 'error');
      });
    }

    set({
      currentTrack: { ...resolvedTrack, pendingJobId: null },
      queue: newQueue,
      queueIndex: idx,
      playing: true,
      progress: 0,
    });

    // Discord Rich Presence — elapsedSeconds=0 means "just started" (main process
    // computes startTimestamp right before the RPC call to avoid IPC-delay skew)
    window.localfy.discordUpdatePresence({
      title: resolvedTrack.title,
      artist: resolvedTrack.artist,
      albumArt: resolvedTrack.album_art || '',
      elapsedSeconds: 0,
    }).catch(() => {});

    window.localfy.dbIncrementPlay(resolvedTrack.id).catch(() => {});
  },

  playPause: () => {
    const { audioEl, playing, progress, currentTrack } = get();
    if (!audioEl) return;
    if (playing) {
      audioEl.pause();
      set({ playing: false });
      // Paused — send presence without startTimestamp so Discord stops the timer
      if (currentTrack && !isTrackPending(currentTrack)) {
        window.localfy.discordUpdatePresence({
          title: currentTrack.title,
          artist: currentTrack.artist,
          albumArt: currentTrack.album_art || '',
          // no startTimestamp → Discord shows no elapsed time
        }).catch(() => {});
      }
    } else {
      audioEl.play().catch(() => {});
      set({ playing: true });
      // Resumed — pass elapsed seconds so main.js computes startTimestamp fresh
      if (currentTrack && !isTrackPending(currentTrack)) {
        window.localfy.discordUpdatePresence({
          title: currentTrack.title,
          artist: currentTrack.artist,
          albumArt: currentTrack.album_art || '',
          elapsedSeconds: Math.floor(progress),
        }).catch(() => {});
      }
    }
  },

  pause: () => {
    const { audioEl, currentTrack } = get();
    if (!audioEl) return;
    audioEl.pause();
    set({ playing: false });
    if (currentTrack && !isTrackPending(currentTrack)) {
      window.localfy.discordUpdatePresence({
        title: currentTrack.title,
        artist: currentTrack.artist,
        albumArt: currentTrack.album_art || '',
      }).catch(() => {});
    }
  },

  addToQueue: (tracks) => {
    const { queue, queueIndex } = get();
    const newQueue = [...queue, ...tracks];
    set({ queue: newQueue });
    // If nothing is playing, start the first added track
    if (queue.length === 0 && tracks.length > 0) {
      get().playTrack(tracks[0], newQueue);
    }
  },

  removeFromQueue: (trackId) => {
    const { queue, queueIndex, currentTrack } = get();
    const removeIdx = queue.findIndex(t => t.id === trackId);
    if (removeIdx === -1) return;
    const newQueue = queue.filter(t => t.id !== trackId);
    let newIndex = queueIndex;
    if (removeIdx < queueIndex) {
      newIndex = queueIndex - 1;
    } else if (removeIdx === queueIndex) {
      // Removed the currently playing track — clamp index
      newIndex = Math.min(queueIndex, newQueue.length - 1);
    }
    set({ queue: newQueue, queueIndex: newIndex });
  },

  moveInQueue: (fromIndex, toIndex) => {
    const { queue, queueIndex } = get();
    if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) return;
    const newQueue = [...queue];
    const [moved] = newQueue.splice(fromIndex, 1);
    newQueue.splice(toIndex, 0, moved);
    // Adjust queueIndex to follow the currently playing track
    let newIndex = queueIndex;
    if (queueIndex === fromIndex) {
      newIndex = toIndex;
    } else if (fromIndex < queueIndex && toIndex >= queueIndex) {
      newIndex = queueIndex - 1;
    } else if (fromIndex > queueIndex && toIndex <= queueIndex) {
      newIndex = queueIndex + 1;
    }
    set({ queue: newQueue, queueIndex: newIndex });
  },

  clearQueue: () => {
    const { audioEl } = get();
    if (audioEl) {
      audioEl.pause();
      audioEl.src = '';
    }
    set({ queue: [], queueIndex: -1, currentTrack: null, playing: false, progress: 0, duration: 0 });
  },

  playFromQueue: (index) => {
    const { queue } = get();
    if (index < 0 || index >= queue.length) return;
    get().playTrack(queue[index], queue);
    set({ queueIndex: index });
  },

  next: () => {
    const { queue, queueIndex, shuffle, repeat } = get();
    if (!queue.length) return;
    let nextIdx;
    if (shuffle) {
      nextIdx = Math.floor(Math.random() * queue.length);
    } else {
      nextIdx = queueIndex + 1;
      if (nextIdx >= queue.length) {
        if (repeat === 'all') nextIdx = 0;
        else { get().pause(); return; }
      }
    }
    get().playTrack(queue[nextIdx], queue);
    set({ queueIndex: nextIdx });
  },

  prev: () => {
    const { audioEl, queueIndex, queue, progress, currentTrack } = get();
    if (progress > 3) {
      if (audioEl) { audioEl.currentTime = 0; audioEl.play().catch(() => {}); }
      set({ progress: 0 });
      // Refresh Discord timestamp — same track restarted from beginning
      if (currentTrack && !isTrackPending(currentTrack)) {
        window.localfy.discordUpdatePresence({
          title: currentTrack.title,
          artist: currentTrack.artist,
          albumArt: currentTrack.album_art || '',
          elapsedSeconds: 0,
        }).catch(() => {});
      }
      return;
    }
    const idx = Math.max(0, queueIndex - 1);
    if (queue[idx]) { get().playTrack(queue[idx], queue); set({ queueIndex: idx }); }
  },

  seek: (pct) => {
    const { audioEl, duration, currentTrack } = get();
    if (!audioEl) return;
    const newTime = pct * duration;
    audioEl.currentTime = newTime;
    set({ progress: newTime });
    // Recalculate Discord timestamp so elapsed time reflects the seeked position
    if (currentTrack && !isTrackPending(currentTrack)) {
      window.localfy.discordUpdatePresence({
        title: currentTrack.title,
        artist: currentTrack.artist,
        albumArt: currentTrack.album_art || '',
        elapsedSeconds: Math.floor(newTime),
      }).catch(() => {});
    }
  },

  setVolume: (v) => {
    const { audioEl } = get();
    if (audioEl) audioEl.volume = v;
    set({ volume: v });
    persistPlayerPrefs({ ...get(), volume: v });
  },

  toggleShuffle: () => {
    const next = !get().shuffle;
    set({ shuffle: next });
    persistPlayerPrefs({ ...get(), shuffle: next });
  },

  toggleRepeat: () => {
    const curr = get().repeat;
    const next = curr === 'off' ? 'all' : curr === 'all' ? 'one' : 'off';
    set({ repeat: next });
    persistPlayerPrefs({ ...get(), repeat: next });
  },

  setProgress: (p) => set({ progress: p }),
  setDuration: (d) => set({ duration: d }),
  setPlaying: (v) => set({ playing: v }),

  setSpeed: (s) => {
    const { audioEl } = get();
    if (audioEl) {
      audioEl.playbackRate = s;
      audioEl.preservesPitch = get().pitchPreserve;
    }
    set({ speed: s });
    persistPlayerPrefs({ ...get(), speed: s });
  },

  togglePitchPreserve: () => {
    const { audioEl, pitchPreserve } = get();
    const next = !pitchPreserve;
    if (audioEl) audioEl.preservesPitch = next;
    set({ pitchPreserve: next });
    persistPlayerPrefs({ ...get(), pitchPreserve: next });
  },
}));

// ─── Library store ────────────────────────────────────────────────────────────
export const useLibraryStore = create((set, get) => ({
  downloaded: [],
  liked: [],
  playlists: [],
  folders: [],
  loading: false,

  loadDownloaded: async () => {
    const downloaded = await window.localfy.dbGetDownloaded();
    set({ downloaded });
  },

  loadLiked: async () => {
    const liked = await window.localfy.dbGetLiked();
    set({ liked });
  },

  loadPlaylists: async () => {
    const [playlists, folders] = await Promise.all([
      window.localfy.dbGetPlaylists(),
      window.localfy.dbGetFolders(),
    ]);
    set({ playlists, folders });
  },

  toggleLike: async (track) => {
    const newLiked = await window.localfy.dbToggleLike(track);
    await get().loadLiked();
    return newLiked;
  },

  addToPlaylist: async (playlistId, tracks) => {
    const trackList = Array.isArray(tracks) ? tracks : [tracks];
    for (const track of trackList) {
      await window.localfy.dbAddToPlaylist(playlistId, track);
    }
    await get().loadPlaylists();
  },

  removeFromPlaylist: async (playlistId, trackId) => {
    await window.localfy.dbRemoveTrackFromPlaylist(playlistId, trackId);
    await get().loadPlaylists();
  },

  reorderTrack: async (playlistId, trackId, newPos) => {
    await window.localfy.dbReorderPlaylistTrack(playlistId, trackId, newPos);
    await get().loadPlaylists();
  },

  refresh: async () => {
    set({ loading: true });
    await Promise.all([get().loadDownloaded(), get().loadLiked(), get().loadPlaylists()]);
    set({ loading: false });
  },
}));

// ─── Download store ───────────────────────────────────────────────────────────
function syncPlayerWithDownloadJobs(jobs, changedJob = null) {
  const completedByTrackId = jobs.reduce((acc, job) => {
    if (job.state === 'completed' && job.filePath && job.trackId) {
      acc[job.trackId] = job;
    }
    return acc;
  }, {});

  if (Object.keys(completedByTrackId).length > 0) {
    usePlayerStore.setState(state => ({
      currentTrack: state.currentTrack && completedByTrackId[state.currentTrack.id]
        ? {
            ...state.currentTrack,
            downloaded: true,
            file_path: completedByTrackId[state.currentTrack.id].filePath,
          }
        : state.currentTrack,
      queue: state.queue.map(track => {
        const completedJob = completedByTrackId[track.id];
        return completedJob ? { ...track, downloaded: true, file_path: completedJob.filePath } : track;
      }),
    }));
  }

  const playerState = usePlayerStore.getState();
  const currentTrack = playerState.currentTrack;
  if (!isTrackPending(currentTrack)) return;

  const pendingJob = jobs.find(job => job.id === currentTrack.pendingJobId);
  if (!pendingJob) return;

  if (pendingJob.state === 'completed' && pendingJob.filePath) {
    playerState.playTrack(
      { ...currentTrack, file_path: pendingJob.filePath, downloaded: true, pendingJobId: null },
      playerState.queue
    );
    return;
  }

  if (pendingJob.state === 'failed' || pendingJob.state === 'cancelled') {
    usePlayerStore.setState(state => ({
      currentTrack: sameTrack(state.currentTrack, currentTrack)
        ? { ...state.currentTrack, pendingJobId: null }
        : state.currentTrack,
    }));
    useToastStore.getState().add(
      pendingJob.lastError || `Download ${pendingJob.state === 'cancelled' ? 'was cancelled' : 'failed'}`,
      pendingJob.state === 'cancelled' ? 'info' : 'error'
    );
  }

  if (changedJob && (changedJob.state === 'completed' || changedJob.state === 'failed' || changedJob.state === 'cancelled')) {
    useLibraryStore.getState().loadDownloaded();
    useLibraryStore.getState().loadLiked();
  }
}

function normalizeDownloadResult(result, track) {
  return {
    queued: !!result?.queued,
    duplicate: !!result?.deduped,
    deduped: !!result?.deduped,
    alreadyDownloaded: !!result?.alreadyDownloaded,
    queueItemId: result?.jobId || null,
    jobId: result?.jobId || null,
    existingStatus: result?.state || null,
    state: result?.state || null,
    filePath: result?.filePath || null,
    track: result?.track || track || null,
  };
}

export const useDownloadStore = create((set, get) => ({
  jobs: [],
  queue: [],
  stats: { total: 0, queued: 0, running: 0, active: 0, completed: 0, done: 0, failed: 0, cancelled: 0 },
  activeDownloads: {},

  applySnapshot: (snapshot, changedJob = null) => {
    const jobs = snapshot?.jobs || [];
    const stats = snapshot?.stats || get().stats;
    set({
      jobs,
      queue: jobs,
      stats,
      activeDownloads: buildActiveDownloadsFromJobs(jobs),
    });
    syncPlayerWithDownloadJobs(jobs, changedJob);
  },

  loadSnapshot: async () => {
    const snapshot = await window.localfy.downloadGetSnapshot();
    get().applySnapshot(snapshot);
  },

  loadStats: async () => get().loadSnapshot(),
  loadQueue: async () => get().loadSnapshot(),

  handleChanged: (payload) => {
    if (!payload) return;
    get().applySnapshot(payload, payload.job || null);
  },

  handleProgress: () => {
    get().loadSnapshot();
  },

  enqueueTrack: async (track, options = {}) => {
    const result = await window.localfy.downloadEnqueue(track, options);
    if (result?.alreadyDownloaded && result.filePath) {
      usePlayerStore.setState(state => ({
        currentTrack: sameTrack(state.currentTrack, track)
          ? { ...state.currentTrack, downloaded: true, file_path: result.filePath, pendingJobId: null }
          : state.currentTrack,
        queue: mergeQueueTrack(state.queue, { id: track.id, downloaded: true, file_path: result.filePath }),
      }));
      useLibraryStore.getState().loadDownloaded();
    }
    return normalizeDownloadResult(result, track);
  },

  downloadTrack: async (track) => get().enqueueTrack(track, { intent: 'download', autoPlay: false }),

  downloadAll: async (tracks) => {
    const result = await window.localfy.downloadAll(tracks);
    get().loadSnapshot();
    return result;
  },

  cancelJob: async (jobId) => {
    const result = await window.localfy.downloadCancelJob(jobId);
    get().loadSnapshot();
    return result;
  },

  retryFailed: async () => {
    const result = await window.localfy.downloadRetry('allFailed');
    get().loadSnapshot();
    return result;
  },

  clearHistory: async () => {
    await window.localfy.downloadClearHistory();
    get().loadSnapshot();
  },

  clearQueue: async () => {
    await window.localfy.downloadClearQueue();
    get().loadSnapshot();
  },
}));

// ─── UI Preferences store ────────────────────────────────────────────────────
const uiDefaults = loadPersistedState('ui', { theme: 'dark', sidebarCollapsed: false });

export const useUIStore = create((set, get) => ({
  // Persisted
  theme: uiDefaults.theme,
  sidebarCollapsed: uiDefaults.sidebarCollapsed,

  // Non-persisted
  showQueue: false,
  showCommandPalette: false,
  showEqualizer: false,
  showLyrics: false,
  navigationHistory: [],
  navigationIndex: -1,

  // Actions
  setTheme: (theme) => {
    set({ theme });
    persistState('ui', { theme, sidebarCollapsed: get().sidebarCollapsed });
    document.documentElement.setAttribute('data-theme', theme);
  },
  toggleTheme: () => {
    const t = get().theme === 'dark' ? 'light' : 'dark';
    get().setTheme(t);
  },
  toggleSidebar: () => {
    const v = !get().sidebarCollapsed;
    set({ sidebarCollapsed: v });
    persistState('ui', { theme: get().theme, sidebarCollapsed: v });
  },
  toggleQueue: () => set(s => ({ showQueue: !s.showQueue })),
  toggleCommandPalette: () => set(s => ({ showCommandPalette: !s.showCommandPalette })),
  toggleEqualizer: () => set(s => ({ showEqualizer: !s.showEqualizer })),
  toggleLyrics: () => set(s => ({ showLyrics: !s.showLyrics })),

  // Navigation history
  pushNavigation: (path) => {
    const { navigationHistory, navigationIndex } = get();
    const newHistory = [...navigationHistory.slice(0, navigationIndex + 1), path];
    set({ navigationHistory: newHistory, navigationIndex: newHistory.length - 1 });
  },
  goBack: () => {
    const { navigationIndex } = get();
    if (navigationIndex > 0) set({ navigationIndex: navigationIndex - 1 });
    return get().navigationHistory[get().navigationIndex] || null;
  },
  goForward: () => {
    const { navigationHistory, navigationIndex } = get();
    if (navigationIndex < navigationHistory.length - 1) set({ navigationIndex: navigationIndex + 1 });
    return get().navigationHistory[get().navigationIndex] || null;
  },
  canGoBack: () => get().navigationIndex > 0,
  canGoForward: () => get().navigationIndex < get().navigationHistory.length - 1,
}));

// Apply initial theme on load
document.documentElement.setAttribute('data-theme', useUIStore.getState().theme);

// ─── Search History store ─────────────────────────────────────────────────────
export const useSearchStore = create((set, get) => ({
  recentSearches: loadPersistedState('search', { recentSearches: [] }).recentSearches,

  addSearch: (query) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const filtered = get().recentSearches.filter(s => s !== trimmed);
    const updated = [trimmed, ...filtered].slice(0, 10);
    set({ recentSearches: updated });
    persistState('search', { recentSearches: updated });
  },

  clearSearchHistory: () => {
    set({ recentSearches: [] });
    persistState('search', { recentSearches: [] });
  },

  removeSearch: (query) => {
    const updated = get().recentSearches.filter(s => s !== query);
    set({ recentSearches: updated });
    persistState('search', { recentSearches: updated });
  },
}));

// ─── Multi-Select store ──────────────────────────────────────────────────────
export const useSelectionStore = create((set, get) => ({
  selectedTracks: new Set(),
  selectionMode: false,

  toggleSelect: (trackId) => {
    const selected = new Set(get().selectedTracks);
    if (selected.has(trackId)) selected.delete(trackId);
    else selected.add(trackId);
    set({ selectedTracks: selected, selectionMode: selected.size > 0 });
  },

  selectAll: (trackIds) => {
    set({ selectedTracks: new Set(trackIds), selectionMode: true });
  },

  clearSelection: () => {
    set({ selectedTracks: new Set(), selectionMode: false });
  },

  isSelected: (trackId) => get().selectedTracks.has(trackId),

  getSelectedArray: () => [...get().selectedTracks],
}));
