import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore, useToastStore, useSearchStore, useUIStore, useDownloadStore, usePlayerStore } from '../store';
import BackForward from './BackForward';
import { SearchIcon, UserIcon, LogoutIcon, SpotifyIcon } from './Icons';

function getRouteMeta(pathname) {
  if (pathname === '/') return { eyebrow: 'Workspace', title: 'Home Signal', detail: 'Recent movement, recommendations, and queue state' };
  if (pathname.startsWith('/search')) return { eyebrow: 'Discovery', title: 'Search Archive', detail: 'Jump between tracks, artists, and albums quickly' };
  if (pathname.startsWith('/library')) return { eyebrow: 'Collection', title: 'Library Matrix', detail: 'Browse everything you have already staged locally' };
  if (pathname.startsWith('/liked')) return { eyebrow: 'Collection', title: 'Liked Songs', detail: 'High-priority tracks ready for replay and download' };
  if (pathname.startsWith('/downloads')) return { eyebrow: 'Pipeline', title: 'Download Queue', detail: 'Monitor jobs, retries, and completed files' };
  if (pathname.startsWith('/discover')) return { eyebrow: 'Discovery', title: 'Signal Finder', detail: 'Fresh picks shaped by the music you keep coming back to' };
  if (pathname.startsWith('/stats')) return { eyebrow: 'Telemetry', title: 'Listening Stats', detail: 'Playback behavior, patterns, and history' };
  if (pathname.startsWith('/settings')) return { eyebrow: 'System', title: 'Settings Lab', detail: 'Tune the app, downloads, and account behavior' };
  if (pathname.startsWith('/playlist/')) return { eyebrow: 'Workspace', title: 'Playlist Deck', detail: 'Curate the active sequence with less friction' };
  if (pathname.startsWith('/artist/')) return { eyebrow: 'Profile', title: 'Artist View', detail: 'See catalog context before you queue anything' };
  return { eyebrow: 'Workspace', title: 'Localfy', detail: 'A darker control surface for your Spotify-driven library' };
}

export default function TopBar() {
  const { user, loggedIn, logout } = useAuthStore();
  const { stats } = useDownloadStore();
  const { currentTrack } = usePlayerStore();
  const { add: toast } = useToastStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { recentSearches, removeSearch } = useSearchStore();
  const routeMeta = getRouteMeta(location.pathname);
  const activeDownloads = stats.active || ((stats.queued || 0) + (stats.running || 0));

  const handleSearch = (e) => {
    e.preventDefault();
    if (search.trim()) {
      useSearchStore.getState().addSearch(search.trim());
      navigate(`/search?q=${encodeURIComponent(search.trim())}`);
      setShowSuggestions(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    toast('Logged out', 'info');
    setShowMenu(false);
  };

  const openMenu = useCallback(() => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    setShowMenu(s => !s);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target) &&
        btnRef.current && !btnRef.current.contains(e.target)
      ) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <BackForward />
        <div className="topbar-context">
          <div className="topbar-eyebrow">{routeMeta.eyebrow}</div>
          <div className="topbar-title-row">
            <h1 className="topbar-title">{routeMeta.title}</h1>
            {currentTrack?.title && (
              <span className="topbar-inline-pill">
                Now playing: {currentTrack.title}
              </span>
            )}
          </div>
          <div className="topbar-detail">{routeMeta.detail}</div>
        </div>
      </div>

      <form className="topbar-search" onSubmit={handleSearch} style={{ position: 'relative' }}>
        <SearchIcon size={15} className="topbar-search-icon" />
        <input
          type="text"
          placeholder="Search songs, artists, albums"
          aria-label="Search songs, artists, albums"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        />
        {showSuggestions && recentSearches.length > 0 && (
          <div className="search-suggestions">
            {recentSearches.map((q) => (
              <div
                key={q}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: 'var(--text-2)', transition: 'background 0.12s' }}
                onMouseDown={(e) => { e.preventDefault(); setSearch(q); navigate(`/search?q=${encodeURIComponent(q)}`); useSearchStore.getState().addSearch(q); setShowSuggestions(false); }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q}</span>
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '2px 4px', flexShrink: 0, fontSize: 12, lineHeight: 1 }}
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); removeSearch(q); }}
                  title="Remove"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </form>

      <div className="topbar-right">
        <div className="topbar-metric-pill">
          <span className="topbar-metric-label">Queue</span>
          <strong>{activeDownloads}</strong>
        </div>

        <button
          onClick={() => useUIStore.getState().toggleCommandPalette()}
          title="Command palette"
          className="topbar-command-btn"
        >
          <span>Command</span>
          <span className="topbar-command-kbd">Ctrl K</span>
        </button>

        {loggedIn && user && (
          <>
            <div className="topbar-account" ref={btnRef} onClick={openMenu}>
              {user.images?.[0]?.url ? (
                <img src={user.images[0].url} alt="" className="topbar-avatar" />
              ) : (
                <div className="topbar-avatar" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--surface-2)', color: 'var(--text-2)',
                }}>
                  <UserIcon size={14} />
                </div>
              )}
              <div className="topbar-account-copy">
                <span className="topbar-account-label">Spotify</span>
                <span className="topbar-username">{user.display_name || user.email}</span>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>

            {showMenu && (
              <div
                ref={menuRef}
                className="ctx-menu"
                style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, minWidth: 210 }}
              >
                <div className="ctx-item" style={{ cursor: 'default', opacity: 0.65 }}>
                  <UserIcon size={15} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{user.display_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{user.email}</div>
                  </div>
                </div>
                <div className="ctx-divider" />
                {user.external_urls?.spotify && (
                  <div className="ctx-item" onClick={() => { window.localfy.openExternal(user.external_urls.spotify); setShowMenu(false); }}>
                    <SpotifyIcon size={15} style={{ color: 'var(--green)' }} />
                    Open in Spotify
                  </div>
                )}
                <div className="ctx-divider" />
                <div className="ctx-item danger" onClick={handleLogout}>
                  <LogoutIcon size={15} />
                  Sign Out
                </div>
              </div>
            )}
          </>
        )}

        <WindowControls />
      </div>
    </header>
  );
}

function WindowControls() {
  return (
    <div className="window-controls">
      <WinBtn title="Minimize" onClick={() => window.localfy.minimizeWindow()}>
        <svg width="10" height="1" viewBox="0 0 10 1" fill="none">
          <rect width="10" height="1" fill="currentColor" />
        </svg>
      </WinBtn>
      <WinBtn title="Maximize / Restore" onClick={() => window.localfy.maximizeWindow()}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" />
        </svg>
      </WinBtn>
      <WinBtn title="Close" onClick={() => window.close()} isClose>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </WinBtn>
    </div>
  );
}

function WinBtn({ children, title, onClick, isClose }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 38,
        height: 38,
        minHeight: 32,
        background: hovered ? (isClose ? '#bf4f4f' : 'rgba(255,255,255,0.07)') : 'transparent',
        border: '1px solid transparent',
        cursor: 'pointer',
        color: hovered && isClose ? '#fff' : 'var(--text-2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.12s, color 0.12s, border-color 0.12s',
        flexShrink: 0,
        borderRadius: 12,
      }}
    >
      {children}
    </button>
  );
}
