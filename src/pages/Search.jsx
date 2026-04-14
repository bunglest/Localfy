import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ArtistLinks from '../components/ArtistLinks';
import { usePlayerStore, useDownloadStore, useToastStore, useSearchStore } from '../store';
import { SearchIcon, PlayIcon, DownloadIcon } from '../components/Icons';

function formatTime(ms) {
  if (!ms) return '--:--';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

const FILTERS = [
  { key: 'all',       label: 'All' },
  { key: 'tracks',    label: 'Songs' },
  { key: 'artists',   label: 'Artists' },
  { key: 'albums',    label: 'Albums' },
  { key: 'playlists', label: 'Playlists' },
];

export default function Search() {
  const location = useLocation();
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter,  setFilter]  = useState('all');
  const inputRef = useRef(null);
  const { playTrack }    = usePlayerStore();
  const { downloadTrack } = useDownloadStore();
  const { add: toast }   = useToastStore();
  const { addSearch }    = useSearchStore();

  // Pick up ?q= from topbar search
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('q');
    if (q) { setQuery(q); doSearch(q); }
    else { setQuery(''); setResults(null); }
    inputRef.current?.focus();
  }, [location.search]);

  // Reset filter when new search fires
  const doSearch = async (q) => {
    if (!q?.trim()) return;
    setFilter('all');
    setLoading(true);
    try {
      const data = await window.localfy.spotifySearch(q);
      setResults(data);
    } catch (e) {
      toast('Search failed: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => { e.preventDefault(); addSearch(query); doSearch(query); };

  const handlePlay = (track, allTracks) => {
    playTrack(mapSpotifyTrack(track), allTracks.map(mapSpotifyTrack));
  };

  const handleDownload = async (track) => {
    const result = await downloadTrack(mapSpotifyTrack(track));
    if (result?.alreadyDownloaded) toast('Already downloaded', 'info');
    else if (result?.duplicate) toast(`Already queued: ${track.name}`, 'info');
    else if (result?.queued) toast(`Queued: ${track.name}`, 'info');
  };

  const tracks    = results?.tracks?.items    || [];
  const artists   = results?.artists?.items   || [];
  const albums    = results?.albums?.items    || [];
  const playlists = results?.playlists?.items || [];

  const hasResults = tracks.length > 0 || artists.length > 0 || albums.length > 0 || playlists.length > 0;

  // How many items to show — more when filtered
  const limit = (base, full) => filter === 'all' ? base : full;

  // Which filter tabs to show (only those with results)
  const availableFilters = useMemo(() => {
    if (!results) return [];
    return FILTERS.filter(f => {
      if (f.key === 'all') return true;
      if (f.key === 'tracks'    && tracks.length)    return true;
      if (f.key === 'artists'   && artists.length)   return true;
      if (f.key === 'albums'    && albums.length)    return true;
      if (f.key === 'playlists' && playlists.length) return true;
      return false;
    });
  }, [results, tracks, artists, albums, playlists]);

  const showSection = (key) => filter === 'all' || filter === key;

  return (
    <div style={{ padding: '28px 28px 40px' }}>
      {/* Header */}
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, letterSpacing: -0.5, marginBottom: 20 }}>
        Search
      </h1>

      {/* Search bar */}
      <form onSubmit={handleSubmit} style={{ maxWidth: 560, marginBottom: hasResults ? 20 : 32 }}>
        <div className="search-bar" style={{ height: 46 }}>
          <SearchIcon size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Artists, songs, albums…"
            style={{ fontSize: 15 }}
          />
          {query && (
            <button type="submit" className="btn btn-primary btn-sm">Search</button>
          )}
        </div>
      </form>

      {/* Filter tabs — shown once there are results */}
      {!loading && hasResults && availableFilters.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 28, flexWrap: 'wrap' }}>
          {availableFilters.map(f => (
            <FilterPill
              key={f.key}
              label={f.label}
              active={filter === f.key}
              onClick={() => setFilter(f.key)}
              count={
                f.key === 'tracks'    ? tracks.length    :
                f.key === 'artists'   ? artists.length   :
                f.key === 'albums'    ? albums.length    :
                f.key === 'playlists' ? playlists.length : null
              }
            />
          ))}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 52, borderRadius: 'var(--radius)' }} />
          ))}
        </div>
      )}

      {!loading && results && (
        <>
          {/* Songs */}
          {showSection('tracks') && tracks.length > 0 && (
            <section className="section">
              <div className="section-header">
                <h2 className="section-title">Songs</h2>
                {filter === 'all' && tracks.length > 5 && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setFilter('tracks')}>
                    See all {tracks.length} →
                  </button>
                )}
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <div className="track-list-header" style={{ padding: '10px 16px 8px' }}>
                  <span></span><span></span><span>#</span><span>Title</span><span>Album</span><span>Time</span><span></span>
                </div>
                {tracks.slice(0, limit(5, 50)).map((track, i) => (
                  <SearchTrackRow
                    key={track.id}
                    track={track}
                    index={i}
                    onPlay={() => handlePlay(track, tracks)}
                    onDownload={() => handleDownload(track)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Artists */}
          {showSection('artists') && artists.length > 0 && (
            <section className="section">
              <div className="section-header">
                <h2 className="section-title">Artists</h2>
                {filter === 'all' && artists.length > 6 && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setFilter('artists')}>
                    See all {artists.length} →
                  </button>
                )}
              </div>
              <div className="grid-auto">
                {artists.slice(0, limit(6, 40)).map(artist => (
                  <ArtistCard key={artist.id} artist={artist} />
                ))}
              </div>
            </section>
          )}

          {/* Albums */}
          {showSection('albums') && albums.length > 0 && (
            <section className="section">
              <div className="section-header">
                <h2 className="section-title">Albums</h2>
                {filter === 'all' && albums.length > 6 && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setFilter('albums')}>
                    See all {albums.length} →
                  </button>
                )}
              </div>
              <div className="grid-auto">
                {albums.slice(0, limit(6, 40)).map(album => (
                  <AlbumCard key={album.id} album={album} />
                ))}
              </div>
            </section>
          )}

          {/* Playlists */}
          {showSection('playlists') && playlists.length > 0 && (
            <section className="section">
              <div className="section-header">
                <h2 className="section-title">Playlists</h2>
                {filter === 'all' && playlists.length > 6 && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setFilter('playlists')}>
                    See all {playlists.length} →
                  </button>
                )}
              </div>
              <div className="grid-auto">
                {playlists.filter(Boolean).slice(0, limit(6, 40)).map(pl => (
                  <PlaylistCard key={pl.id} pl={pl} />
                ))}
              </div>
            </section>
          )}

          {!hasResults && (
            <div className="empty-state">
              <div className="empty-state-title">No results found</div>
              <div className="empty-state-sub">Try a different search term</div>
            </div>
          )}
        </>
      )}

      {/* Empty prompt */}
      {!loading && !results && (
        <div style={{ textAlign: 'center', padding: '80px 32px', color: 'var(--text-3)' }}>
          <SearchIcon size={48} style={{ opacity: 0.18, marginBottom: 16 }} />
          <div style={{ fontSize: 18, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>
            Find your music
          </div>
          <div style={{ fontSize: 13 }}>Search Spotify's entire catalog</div>
        </div>
      )}
    </div>
  );
}

/* ─── Filter Pill ─────────────────────────────────────────────────────────────── */
function FilterPill({ label, active, onClick, count }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        borderRadius: 'var(--radius-pill)',
        border: active ? '1px solid var(--pink)' : '1px solid var(--border-2)',
        background: active ? 'var(--pink-glow)' : 'var(--surface)',
        color: active ? 'var(--pink)' : 'var(--text-2)',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        outline: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      {count != null && (
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 700,
          color: active ? 'var(--pink)' : 'var(--text-3)',
          letterSpacing: 0.2,
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

/* ─── Track Row ───────────────────────────────────────────────────────────────── */
function SearchTrackRow({ track, index, onPlay, onDownload }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="track-row"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onPlay}
    >
      <span></span><span></span>
      <div className="track-num">
        {hover
          ? <span className="play-icon"><PlayIcon size={13} /></span>
          : <span className="num-label">{index + 1}</span>
        }
      </div>
      <div className="track-info">
        {track.album?.images?.[0]?.url
          ? <img src={track.album.images[0].url} alt="" className="track-art" style={{ background: 'var(--surface-2)' }} />
          : <div className="track-art" style={{ background: 'var(--surface-2)' }} />
        }
        <div className="track-text">
          <div className="track-title">{track.name}</div>
          <div className="track-artist">
            <ArtistLinks
              artist={track.artists?.map(a => a.name).join(', ')}
              artistIds={track.artists?.map(a => a.id)}
            />
          </div>
        </div>
      </div>
      <div className="track-album">{track.album?.name}</div>
      <div className="track-duration">{formatTime(track.duration_ms)}</div>
      <div className="track-actions">
        <button
          className="track-action-btn"
          title="Download"
          onClick={e => { e.stopPropagation(); onDownload(); }}
        >
          <DownloadIcon size={15} />
        </button>
      </div>
    </div>
  );
}

/* ─── Artist Card ─────────────────────────────────────────────────────────────── */
function ArtistCard({ artist }) {
  const navigate = useNavigate();
  return (
    <div
      className="card"
      style={{ textAlign: 'center', cursor: 'pointer' }}
      onClick={() => navigate(`/artist/${artist.id}`)}
    >
      {artist.images?.[0]?.url ? (
        <img
          src={artist.images[0].url}
          alt=""
          className="card-art"
          style={{ borderRadius: '50%' }}
        />
      ) : (
        <div style={{ aspectRatio: 1, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>🎵</div>
      )}
      <div className="card-body">
        <div className="card-title">{artist.name}</div>
        <div className="card-sub">
          {artist.followers?.total != null
            ? `${(artist.followers.total / 1000).toFixed(0)}k followers`
            : 'Artist'}
        </div>
      </div>
    </div>
  );
}

/* ─── Album Card ──────────────────────────────────────────────────────────────── */
function AlbumCard({ album }) {
  return (
    <div
      className="card"
      style={{ cursor: 'pointer' }}
      onClick={() => window.localfy.openExternal(album.external_urls?.spotify || '')}
    >
      <img src={album.images?.[0]?.url} alt="" className="card-art" />
      <div className="card-body">
        <div className="card-title">{album.name}</div>
        <div className="card-sub">
          {album.artists?.map(a => a.name).join(', ')}
          {album.release_date ? ` · ${album.release_date.slice(0, 4)}` : ''}
        </div>
      </div>
    </div>
  );
}

/* ─── Playlist Card ───────────────────────────────────────────────────────────── */
function PlaylistCard({ pl }) {
  return (
    <div
      className="card"
      style={{ cursor: 'pointer' }}
      onClick={() => window.localfy.openExternal(pl.external_urls?.spotify || '')}
    >
      <img src={pl.images?.[0]?.url} alt="" className="card-art" style={{ background: 'var(--surface-2)' }} />
      <div className="card-body">
        <div className="card-title">{pl.name}</div>
        <div className="card-sub">{pl.owner?.display_name}{pl.tracks?.total ? ` · ${pl.tracks.total} songs` : ''}</div>
      </div>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────────────────────── */
function mapSpotifyTrack(t) {
  return {
    id: t.id, spotify_id: t.id,
    title: t.name,
    artist: t.artists?.map(a => a.name).join(', ') || '',
    album: t.album?.name || '',
    album_art: t.album?.images?.[0]?.url || '',
    duration_ms: t.duration_ms,
    downloaded: false, file_path: null,
  };
}
