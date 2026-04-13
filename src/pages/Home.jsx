import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, usePlayerStore, useDownloadStore, useToastStore } from '../store';
import { PlayIcon, DownloadIcon, MusicIcon } from '../components/Icons';
import ArtistLinks from '../components/ArtistLinks';

function toLocalfy(track) {
  return {
    id: track.id,
    spotify_id: track.id,
    title: track.name,
    artist: track.artists?.map(a => a.name).join(', ') || '',
    artist_ids: track.artists?.map(a => a.id) || [],
    album: track.album?.name || '',
    album_art: track.album?.images?.[0]?.url || '',
    duration_ms: track.duration_ms,
  };
}

function fmtMs(ms) {
  if (!ms) return '';
  const m = Math.floor(ms / 1000 / 60);
  const s = Math.floor((ms / 1000) % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function Home() {
  const { user } = useAuthStore();
  const { playTrack } = usePlayerStore();
  const { downloadTrack } = useDownloadStore();
  const { add: toast } = useToastStore();
  const navigate = useNavigate();

  const [topTracks,    setTopTracks]    = useState([]);
  const [recentTracks, setRecentTracks] = useState([]);
  const [playlists,    setPlaylists]    = useState([]);
  const [newReleases,  setNewReleases]  = useState([]);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      window.localfy.spotifyGetRecommendations(),
      window.localfy.spotifyGetRecentlyPlayed(),
      window.localfy.spotifyGetFeatured(),
      window.localfy.spotifyGetNewReleases(),
    ]).then(([topR, recentR, featuredR, newR]) => {
      if (!alive) return;
      if (topR.status      === 'fulfilled') setTopTracks(topR.value?.tracks?.slice(0, 20) || []);
      if (recentR.status   === 'fulfilled') setRecentTracks(recentR.value?.tracks?.slice(0, 12) || []);
      if (featuredR.status === 'fulfilled') setPlaylists(featuredR.value?.playlists?.items?.slice(0, 9) || []);
      if (newR.status      === 'fulfilled') setNewReleases(newR.value?.albums?.items?.slice(0, 16) || []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = user?.display_name?.split(' ')[0] || '';

  const heroTrack = recentTracks[0] || topTracks[0];
  const heroArt   = heroTrack?.album?.images?.[0]?.url;

  const handleDownload = async (e, track) => {
    e.stopPropagation();
    await downloadTrack(toLocalfy(track));
    toast(`Queued: ${track.name}`, 'info');
  };

  if (loading) return <SkeletonHome />;

  return (
    <div className="home-page">

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="home-hero">
        {heroArt && <img src={heroArt} alt="" className="home-hero-bg" />}
        <div className="home-hero-overlay" />
        <div className="home-hero-content">
          <div className="home-greeting">{greeting}{name ? `, ${name}` : ''}.</div>
          <div className="home-greeting-sub">
            {topTracks.length > 0
              ? `${topTracks.length} top tracks · ${recentTracks.length} recently played`
              : 'Start listening to build your personalised feed'}
          </div>
          <div className="home-hero-actions">
            {topTracks.length > 0 && (
              <button
                className="btn btn-primary"
                onClick={() => playTrack(toLocalfy(topTracks[0]), topTracks.map(toLocalfy))}
              >
                <PlayIcon size={14} /> Play Top Tracks
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/discover')}>
              ✦ Discover New Music
            </button>
          </div>
        </div>
      </div>

      <div className="home-body">

        {/* ── Continue Listening ───────────────────────────────────── */}
        {recentTracks.length > 0 && (
          <section className="home-section">
            <div className="home-section-header">
              <h2 className="home-section-title">Continue Listening</h2>
            </div>
            <HScrollRow>
              {recentTracks.map(track => (
                <RecentCard
                  key={track.id}
                  track={track}
                  onPlay={() => playTrack(toLocalfy(track), recentTracks.map(toLocalfy))}
                  onDownload={e => handleDownload(e, track)}
                />
              ))}
            </HScrollRow>
          </section>
        )}

        {/* ── Smart Mixes ──────────────────────────────────────────── */}
        <section className="home-section">
          <div className="home-section-header">
            <h2 className="home-section-title">Smart Mixes</h2>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {[
              { name: 'Chill Vibes',  gradient: 'linear-gradient(135deg, #667eea, #764ba2)' },
              { name: 'High Energy',  gradient: 'linear-gradient(135deg, #f093fb, #f5576c)' },
              { name: 'Feel Good',    gradient: 'linear-gradient(135deg, #4facfe, #00f2fe)' },
              { name: 'Focus Flow',   gradient: 'linear-gradient(135deg, #43e97b, #38f9d7)' },
            ].map(mix => (
              <div
                key={mix.name}
                className="smart-mix-card"
                style={{ background: mix.gradient }}
                onClick={() => navigate('/discover')}
              >
                <div className="smart-mix-title">{mix.name}</div>
                <div className="smart-mix-sub">Mix</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Top Tracks ───────────────────────────────────────────── */}
        {topTracks.length > 0 && (
          <section className="home-section">
            <div className="home-section-header">
              <h2 className="home-section-title">Your Top Tracks</h2>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => playTrack(toLocalfy(topTracks[0]), topTracks.map(toLocalfy))}
              >
                <PlayIcon size={12} /> Play all
              </button>
            </div>
            <div className="top-tracks-grid">
              {topTracks.slice(0, 10).map((track, i) => (
                <TopTrackRow
                  key={track.id}
                  track={track}
                  rank={i + 1}
                  onPlay={() => playTrack(toLocalfy(track), topTracks.map(toLocalfy))}
                  onDownload={e => handleDownload(e, track)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── New Releases ─────────────────────────────────────────── */}
        {newReleases.length > 0 && (
          <section className="home-section">
            <div className="home-section-header">
              <h2 className="home-section-title">New Releases</h2>
            </div>
            <HScrollRow>
              {newReleases.map(album => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  onClick={() => window.localfy.openExternal(album.external_urls?.spotify || '')}
                />
              ))}
            </HScrollRow>
          </section>
        )}

        {/* ── Your Playlists ───────────────────────────────────────── */}
        {playlists.length > 0 && (
          <section className="home-section">
            <div className="home-section-header">
              <h2 className="home-section-title">Your Playlists</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/library')}>
                Library →
              </button>
            </div>
            <div className="playlists-grid">
              {playlists.map(pl => (
                <PlaylistTile
                  key={pl.id}
                  pl={pl}
                  onClick={() => window.localfy.openExternal(pl.external_urls?.spotify || '')}
                />
              ))}
            </div>
          </section>
        )}

        {!loading && topTracks.length === 0 && recentTracks.length === 0 && (
          <div className="home-empty">
            <MusicIcon size={40} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-2)', marginTop: 16 }}>
              Nothing here yet
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 6, maxWidth: 280, textAlign: 'center' }}>
              Start listening on Spotify, or{' '}
              <span style={{ color: 'var(--pink)', cursor: 'pointer' }} onClick={() => navigate('/liked')}>
                import your liked songs
              </span>.
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

/* ── Horizontal scroll wrapper ───────────────────────────────────── */
function HScrollRow({ children }) {
  const ref = useRef(null);
  const onWheel = e => {
    if (!ref.current) return;
    e.preventDefault();
    ref.current.scrollLeft += e.deltaY * 0.8;
  };
  return (
    <div ref={ref} className="hscroll-row" onWheel={onWheel}>
      {children}
    </div>
  );
}

/* ── Recently played card ────────────────────────────────────────── */
function RecentCard({ track, onPlay, onDownload }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="recent-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onPlay}
    >
      <div className="recent-card-art-wrap">
        {track.album?.images?.[0]?.url
          ? <img src={track.album.images[0].url} alt="" className="recent-card-art" />
          : <div className="recent-card-art recent-card-art-placeholder"><MusicIcon size={24} /></div>
        }
        <div className={`recent-card-overlay${hover ? ' visible' : ''}`}>
          <button className="recent-card-play-btn" onClick={e => { e.stopPropagation(); onPlay(); }}>
            <PlayIcon size={16} />
          </button>
          <button className="recent-card-dl-btn" onClick={onDownload} title="Download">
            <DownloadIcon size={13} />
          </button>
        </div>
      </div>
      <div className="recent-card-info">
        <div className="recent-card-title">{track.name}</div>
        <div className="recent-card-artist">
          <ArtistLinks
            artist={track.artists?.map(a => a.name).join(', ')}
            artistIds={track.artists?.map(a => a.id)}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Top track row ───────────────────────────────────────────────── */
function TopTrackRow({ track, rank, onPlay, onDownload }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className={`top-track-row${hover ? ' hovered' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onPlay}
    >
      <div className="top-track-rank">
        {hover
          ? <PlayIcon size={13} style={{ color: 'var(--pink)' }} />
          : <span>{rank}</span>
        }
      </div>
      <img src={track.album?.images?.[0]?.url} alt="" className="top-track-art" />
      <div className="top-track-info">
        <div className="top-track-title">{track.name}</div>
        <div className="top-track-artist">
          <ArtistLinks
            artist={track.artists?.map(a => a.name).join(', ')}
            artistIds={track.artists?.map(a => a.id)}
          />
        </div>
      </div>
      <div className="top-track-duration">{fmtMs(track.duration_ms)}</div>
      <button
        className={`top-track-dl${hover ? ' visible' : ''}`}
        onClick={onDownload}
        title="Download"
      >
        <DownloadIcon size={13} />
      </button>
    </div>
  );
}

/* ── New release album card ──────────────────────────────────────── */
function AlbumCard({ album, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="album-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      <div className="album-card-art-wrap">
        {album.images?.[0]?.url
          ? <img src={album.images[0].url} alt="" className="album-card-art" />
          : <div className="album-card-art album-card-art-placeholder" />
        }
        {hover && (
          <div className="album-card-overlay">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </div>
        )}
      </div>
      <div className="album-card-info">
        <div className="album-card-title">{album.name}</div>
        <div className="album-card-sub">
          <ArtistLinks
            artist={album.artists?.map(a => a.name).join(', ')}
            artistIds={album.artists?.map(a => a.id)}
          />
          {album.release_date && <> · {album.release_date.slice(0, 4)}</>}
        </div>
      </div>
    </div>
  );
}

/* ── Playlist tile ───────────────────────────────────────────────── */
function PlaylistTile({ pl, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className={`playlist-tile${hover ? ' hovered' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      {pl.images?.[0]?.url
        ? <img src={pl.images[0].url} alt="" className="playlist-tile-art" />
        : <div className="playlist-tile-art playlist-tile-art-placeholder"><MusicIcon size={20} /></div>
      }
      <div className="playlist-tile-info">
        <div className="playlist-tile-name">{pl.name}</div>
        <div className="playlist-tile-sub">
          {pl.tracks?.total != null ? `${pl.tracks.total} songs` : 'Playlist'}
        </div>
      </div>
      {hover && (
        <div className="playlist-tile-arrow">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </div>
      )}
    </div>
  );
}

/* ── Skeleton ────────────────────────────────────────────────────── */
function SkeletonHome() {
  return (
    <div className="home-page">
      <div className="home-hero home-hero-skeleton">
        <div className="home-hero-overlay" />
        <div className="home-hero-content">
          <div className="skeleton" style={{ height: 44, width: 280, borderRadius: 8, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 18, width: 200, borderRadius: 6, marginBottom: 20 }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="skeleton" style={{ height: 36, width: 150, borderRadius: 99 }} />
            <div className="skeleton" style={{ height: 36, width: 170, borderRadius: 99 }} />
          </div>
        </div>
      </div>
      <div className="home-body">
        <div className="home-section">
          <div className="skeleton" style={{ height: 22, width: 180, borderRadius: 6, marginBottom: 16 }} />
          <div style={{ display: 'flex', gap: 12 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ flexShrink: 0, width: 140 }}>
                <div className="skeleton" style={{ width: 140, height: 140, borderRadius: 10 }} />
                <div className="skeleton" style={{ height: 14, width: '80%', borderRadius: 4, marginTop: 8 }} />
                <div className="skeleton" style={{ height: 12, width: '60%', borderRadius: 4, marginTop: 5 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
