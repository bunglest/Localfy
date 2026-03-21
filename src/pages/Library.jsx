import React, { useEffect, useState } from 'react';
import { useLibraryStore, usePlayerStore } from '../store';
import TrackRow from '../components/TrackRow';
import { LibraryIcon, SearchIcon, MusicIcon } from '../components/Icons';

export default function Library() {
  const { downloaded, loadDownloaded } = useLibraryStore();
  const { playTrack } = usePlayerStore();
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('title'); // title | artist | album

  useEffect(() => { loadDownloaded(); }, []);

  const filtered = downloaded.filter(t => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return t.title?.toLowerCase().includes(q) || t.artist?.toLowerCase().includes(q) || t.album?.toLowerCase().includes(q);
  }).sort((a, b) => {
    const av = (a[sort] || '').toLowerCase();
    const bv = (b[sort] || '').toLowerCase();
    return av < bv ? -1 : av > bv ? 1 : 0;
  });

  const handlePlayAll = () => {
    if (!filtered.length) return;
    playTrack(filtered[0], filtered);
  };

  return (
    <div>
      {/* Header */}
      <div style={{
        padding: '28px 28px 0',
        background: 'linear-gradient(to bottom, var(--surface-2), var(--bg))',
        paddingBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, marginBottom: 20 }}>
          <div style={{
            width: 80, height: 80,
            background: 'linear-gradient(135deg, var(--pink) 0%, rgba(255,45,120,0.3) 100%)',
            borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 32px var(--pink-glow)',
          }}>
            <LibraryIcon size={36} style={{ color: 'var(--bg)' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: 1.5, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>
              Local Library
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>
              Downloaded Songs
            </h1>
            <div style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 6 }}>
              {downloaded.length} {downloaded.length === 1 ? 'song' : 'songs'} available offline
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-primary" onClick={handlePlayAll} disabled={!filtered.length}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Play All
          </button>

          {/* Search */}
          <div className="search-bar" style={{ width: 260, height: 36 }}>
            <SearchIcon size={14} style={{ color: 'var(--text-3)' }} />
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter songs…"
            />
          </div>

          {/* Sort */}
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--text-1)', borderRadius: 'var(--radius-pill)',
              padding: '0 14px', height: 36, cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontSize: 13,
              outline: 'none',
            }}
          >
            <option value="title">Sort: Title</option>
            <option value="artist">Sort: Artist</option>
            <option value="album">Sort: Album</option>
          </select>
        </div>
      </div>

      {/* Track list */}
      <div style={{ padding: '8px 12px 40px' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <MusicIcon size={64} className="empty-state-icon" />
            {downloaded.length === 0 ? (
              <>
                <div className="empty-state-title">Your library is empty</div>
                <div className="empty-state-sub">Go to Liked Songs or a Playlist and click "Download All" to get started.</div>
              </>
            ) : (
              <>
                <div className="empty-state-title">No results</div>
                <div className="empty-state-sub">Try a different filter</div>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="track-list-header">
              <span>#</span>
              <span>Title</span>
              <span>Album</span>
              <span>Time</span>
              <span></span>
            </div>
            {filtered.map((track, i) => (
              <TrackRow key={track.id} track={track} index={i} queue={filtered} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
