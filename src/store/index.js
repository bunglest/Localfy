import { create } from 'zustand';

// ─── Toast helpers ────────────────────────────────────────────────────────────
let toastId = 0;

export const useToastStore = create((set) => ({
  toasts: [],
  add: (msg, type = 'info') => {
    const id = ++toastId;
    set(s => ({ toasts: [...s.toasts, { id, msg, type }] }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 3500);
  },
  remove: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));

// ─── Auth store ───────────────────────────────────────────────────────────────
export const useAuthStore = create((set, get) => ({
  user: null,
  tokens: null,
  loggedIn: false,
  loading: true,

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
export const usePlayerStore = create((set, get) => ({
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  playing: false,
  progress: 0,
  duration: 0,
  volume: 0.8,
  speed: 1,
  pitchPreserve: true,
  shuffle: false,
  repeat: 'off', // 'off' | 'all' | 'one'
  audioEl: null,

  setAudioEl: (el) => set({ audioEl: el }),

  playTrack: async (track, queue = null) => {
    const { audioEl } = get();
    const fileUrl = track.file_path ? await window.localfy.playerGetFileUrl(track.file_path) : null;

    if (!fileUrl) {
      // Not downloaded — queue it for download automatically
      window.localfy.downloadTrack(track).catch(() => {});
      useToastStore.getState().add(`Downloading "${track.title}"… click again when ready`, 'info');
      // Still set as current track so the UI shows what's loading
      set({
        currentTrack: { ...track, _pending: true },
        queue: queue || [track],
        queueIndex: queue ? queue.findIndex(t => t.id === track.id) : 0,
        playing: false,
      });
      return;
    }

    const newQueue = queue || [track];
    const idx = queue ? queue.findIndex(t => t.id === track.id) : 0;

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
      currentTrack: track,
      queue: newQueue,
      queueIndex: idx,
      playing: true,
      progress: 0,
    });

    // Discord Rich Presence — elapsedSeconds=0 means "just started" (main process
    // computes startTimestamp right before the RPC call to avoid IPC-delay skew)
    window.localfy.discordUpdatePresence({
      title: track.title,
      artist: track.artist,
      albumArt: track.album_art || '',
      elapsedSeconds: 0,
    }).catch(() => {});

    window.localfy.dbIncrementPlay(track.id).catch(() => {});
  },

  playPause: () => {
    const { audioEl, playing, progress, currentTrack } = get();
    if (!audioEl) return;
    if (playing) {
      audioEl.pause();
      set({ playing: false });
      // Paused — send presence without startTimestamp so Discord stops the timer
      if (currentTrack && !currentTrack._pending) {
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
      if (currentTrack && !currentTrack._pending) {
        window.localfy.discordUpdatePresence({
          title: currentTrack.title,
          artist: currentTrack.artist,
          albumArt: currentTrack.album_art || '',
          elapsedSeconds: Math.floor(progress),
        }).catch(() => {});
      }
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
      if (currentTrack && !currentTrack._pending) {
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
    if (currentTrack && !currentTrack._pending) {
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
  },

  toggleShuffle: () => set(s => ({ shuffle: !s.shuffle })),

  toggleRepeat: () => set(s => ({
    repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off'
  })),

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
  },

  togglePitchPreserve: () => {
    const { audioEl, pitchPreserve } = get();
    const next = !pitchPreserve;
    if (audioEl) audioEl.preservesPitch = next;
    set({ pitchPreserve: next });
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

  refresh: async () => {
    set({ loading: true });
    await Promise.all([get().loadDownloaded(), get().loadLiked(), get().loadPlaylists()]);
    set({ loading: false });
  },
}));

// ─── Download store ───────────────────────────────────────────────────────────
export const useDownloadStore = create((set, get) => ({
  queue: [], // live queue items from main process
  stats: { total: 0, done: 0, failed: 0, queued: 0 },
  activeDownloads: {}, // trackId -> { progress, status, title, artist }

  loadStats: async () => {
    const stats = await window.localfy.downloadGetStats();
    set({ stats });
  },

  loadQueue: async () => {
    const queue = await window.localfy.downloadGetQueue();
    set({ queue });
  },

  downloadTrack: async (track) => {
    await window.localfy.downloadTrack(track);
    set(s => ({
      activeDownloads: {
        ...s.activeDownloads,
        [track.id]: { progress: 0, status: 'queued', title: track.title, artist: track.artist }
      }
    }));
  },

  downloadAll: async (tracks) => {
    await window.localfy.downloadAll(tracks);
  },

  handleProgress: (data) => {
    set(s => ({
      activeDownloads: {
        ...s.activeDownloads,
        [data.trackId]: {
          progress: data.progress || 0,
          status: data.status,
          title: data.title,
          artist: data.artist,
          filePath: data.filePath,
        }
      }
    }));
    // Refresh stats and library when download finishes
    if (data.status === 'done' || data.status === 'failed') {
      get().loadStats();
      useLibraryStore.getState().loadDownloaded();
      useLibraryStore.getState().loadLiked();

      // Auto-play if this track was pending in the player
      if (data.status === 'done' && data.filePath) {
        const playerState = usePlayerStore.getState();
        const ct = playerState.currentTrack;
        if (ct?._pending && ct.id === data.trackId) {
          playerState.playTrack({ ...ct, file_path: data.filePath, _pending: false }, playerState.queue);
        }
      }
    }
  },

  clearQueue: async () => {
    await window.localfy.downloadClearQueue();
    set({ queue: [], activeDownloads: {} });
    get().loadStats();
  },
}));
