import React, { useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Player from './components/Player';
import Toast from './components/Toast';
import Home from './pages/Home';
import Library from './pages/Library';
import LikedSongs from './pages/LikedSongs';
import Downloads from './pages/Downloads';
import Settings from './pages/Settings';
import Search from './pages/Search';
import PlaylistPage from './pages/Playlist';
import ArtistPage from './pages/Artist';
import LoginPage from './pages/Login';
import Stats from './pages/Stats';
import Discover from './pages/Discover';
import CommandPalette from './components/CommandPalette';
import KeyboardShortcuts from './components/KeyboardShortcuts';
import ScrollToTop from './components/ScrollToTop';
import { useAuthStore, usePlayerStore, useLibraryStore, useDownloadStore, useToastStore, useUIStore, seekingFlag, isTrackPending } from './store';

function NavigationTracker() {
  const location = useLocation();
  useEffect(() => {
    useUIStore.getState().pushNavigation(location.pathname);
  }, [location.pathname]);
  return null;
}

export default function App() {
  const audioRef = useRef(null);
  const playStartRef = useRef({ trackId: null, startTime: 0, duration: 0 });
  const trackEndedNaturallyRef = useRef(false);
  const { init, loggedIn, loading } = useAuthStore();
  const showCommandPalette = useUIStore(s => s.showCommandPalette);
  const sidebarCollapsed = useUIStore(s => s.sidebarCollapsed);
  const { setAudioEl, setProgress, setDuration, setPlaying, next, currentTrack } = usePlayerStore();
  const { refresh } = useLibraryStore();
  const { handleChanged, loadSnapshot } = useDownloadStore();

  // Init auth
  useEffect(() => { init(); }, []);

  // Set up audio element — re-runs when loggedIn changes so the <audio> element
  // is guaranteed to be in the DOM (it only renders inside the loggedIn branch).
  useEffect(() => {
    if (!loggedIn) return;
    const audio = audioRef.current;
    if (!audio) return;
    setAudioEl(audio);
    audio.volume = usePlayerStore.getState().volume;

    let lastProgressUpdate = 0;
    const onTimeUpdate = () => {
      if (seekingFlag.current) return;
      const now = Date.now();
      if (now - lastProgressUpdate >= 100) {
        lastProgressUpdate = now;
        setProgress(audio.currentTime);
      }
    };
    const onDuration = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      trackEndedNaturallyRef.current = true;
      const { repeat: r, next: n, currentTrack: ct } = usePlayerStore.getState();
      // Record this play in history
      if (ct?.id && !isTrackPending(ct)) {
        window.localfy.dbRecordPlay(ct.id, ct.duration_ms || 0).catch(() => {});
      }
      if (r === 'one') { audio.currentTime = 0; audio.play(); }
      else n();
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [loggedIn]);

  // Skip detection — fires when currentTrack changes
  useEffect(() => {
    const prev = playStartRef.current;
    // If the previous track ended naturally, it's not a skip
    if (trackEndedNaturallyRef.current) {
      trackEndedNaturallyRef.current = false;
    } else if (prev.trackId && prev.startTime > 0) {
      const listenedMs = Date.now() - prev.startTime;
      const totalMs = prev.duration || 0;
      if (totalMs > 0 && (listenedMs < 30000 || listenedMs < totalMs * 0.25)) {
        window.localfy.dbRecordSkip(prev.trackId, listenedMs, totalMs).catch(() => {});
      }
    }
    // Update ref for the new track
    if (currentTrack?.id && !isTrackPending(currentTrack)) {
      playStartRef.current = {
        trackId: currentTrack.id,
        startTime: Date.now(),
        duration: currentTrack.duration_ms || 0,
      };
    } else {
      playStartRef.current = { trackId: null, startTime: 0, duration: 0 };
    }
  }, [currentTrack?.id, currentTrack?.pendingJobId]);

  // Subscribe to download manager events
  useEffect(() => {
    const unsub = window.localfy.onDownloadChanged(handleChanged);
    return unsub;
  }, []);

  // Load library when logged in
  useEffect(() => {
    if (loggedIn) {
      refresh();
      loadSnapshot();
    }
  }, [loggedIn]);

  // Discord Rich Presence — clear when track is stopped/cleared
  // (play events are fired directly from the store's playTrack/prev actions)
  useEffect(() => {
    if (!currentTrack || isTrackPending(currentTrack)) {
      window.localfy.discordClearPresence().catch(() => {});
    }
  }, [currentTrack?.id, currentTrack?.pendingJobId]);

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', flexDirection: 'column', gap: 16,
        background: 'var(--bg)',
      }}>
        <div style={{
          width: 44, height: 44, background: 'linear-gradient(135deg, var(--pink) 0%, var(--pink-soft) 100%)', borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <LogoIcon />
        </div>
        <div style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          loading...
        </div>
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <HashRouter>
        <LoginPage />
        <Toast />
      </HashRouter>
    );
  }

  return (
    <HashRouter>
      <a href="#main-content" className="skip-to-content">Skip to content</a>
      <KeyboardShortcuts />
      <ScrollToTop />
      <NavigationTracker />
      {showCommandPalette && <CommandPalette />}
      <audio ref={audioRef} preload="auto" />
      <div className="app-stage">
        <div className="app-stage-orb app-stage-orb-a" />
        <div className="app-stage-orb app-stage-orb-b" />
        <div className="app-frame">
          <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
            <Sidebar />
            <TopBar />
            <main className="content" id="main-content">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/search" element={<Search />} />
                <Route path="/library" element={<Library />} />
                <Route path="/liked" element={<LikedSongs />} />
                <Route path="/downloads" element={<Downloads />} />
                <Route path="/discover" element={<Discover />} />
                <Route path="/stats" element={<Stats />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/playlist/:id" element={<PlaylistPage />} />
                <Route path="/artist/:id" element={<ArtistPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <Player />
          </div>
        </div>
      </div>
      <Toast />
    </HashRouter>
  );
}

function LogoIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z" fill="var(--bg)" opacity="0.3"/>
      <path d="M17.9 11.1c-3.6-2.2-9.6-2.4-13.1-1.3-.5.1-1.1-.1-1.3-.7-.1-.5.1-1.1.7-1.3 4-1.2 10.6-1 14.8 1.5.5.3.7.9.4 1.4-.3.5-.9.7-1.5.4z" fill="var(--bg)"/>
      <path d="M16.9 13.9c-.3.4-.8.6-1.3.3-3-1.8-7.6-2.4-11.2-1.3-.4.1-.9-.1-1-.5-.1-.4.1-.9.5-1 4-.8 9.1-.2 12.5 1.9.5.2.6.8.5 1.3v.3z" fill="var(--bg)"/>
      <path d="M15.9 16.8c-.2.3-.6.5-1 .2-2.6-1.6-5.9-2-9.8-1.1-.4.1-.8-.2-.8-.5-.1-.4.2-.8.5-.8 4.3-.9 7.9-.5 10.8 1.2.4.2.5.7.3 1z" fill="var(--bg)"/>
    </svg>
  );
}
