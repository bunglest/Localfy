import React, { useEffect, useState, useCallback } from 'react';
import { usePlayerStore, useDownloadStore, useToastStore, useLibraryStore } from '../store';
import { SkeletonGrid } from '../components/SkeletonPage';

function fmtMs(ms) {
  if (!ms) return '--:--';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function Discover() {
  const { playTrack, addToQueue } = usePlayerStore();
  const { downloadTrack } = useDownloadStore();
  const { toggleLike, liked } = useLibraryStore();
  const { add: toast } = useToastStore();
  const [tracks, setTracks] = useState([]);
  const [seeds, setSeeds] = useState({ artists: [], tracks: [] });
  const [loading, setLoading] = useState(true);
  const [savedIds, setSavedIds] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.localfy.spotifyGetDiscoverTracks();
      setTracks(data.tracks || []);
      setSeeds(data.seeds || { artists: [], tracks: [] });
    } catch (e) {
      toast('Failed to load recommendations', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const mapTrack = (t) => ({
    id: t.id,
    spotify_id: t.id,
    title: t.name,
    artist: t.artists?.map(a => a.name).join(', ') || '',
    artist_ids: t.artists?.map(a => a.id) || [],
    album: t.album?.name || '',
    album_art: t.album?.images?.[0]?.url || '',
    duration_ms: t.duration_ms,
  });

  const handleSave = async (t) => {
    const mapped = mapTrack(t);
    await toggleLike(mapped);
    setSavedIds(s => { const n = new Set(s); n.add(t.id); return n; });
    toast('Saved to Liked Songs', 'success');
  };

  const handleDownload = async (t) => {
    const mapped = mapTrack(t);
    await downloadTrack(mapped);
    toast(`Queued: ${t.name}`, 'info');
  };

  const handlePlayAll = () => {
    if (!tracks.length) return;
    const mapped = tracks.map(mapTrack);
    playTrack(mapped[0], mapped);
  };

  if (loading) return <div style={{ padding: '28px 32px 48px' }}><SkeletonGrid /></div>;

  return (
    <div style={{ padding: '28px 32px 48px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: 1.5, color: 'var(--pink)', textTransform: 'uppercase', marginBottom: 6 }}>
          Personalised For You
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, letterSpacing: -0.5, margin: '0 0 8px' }}>
          Discover
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '0 0 16px' }}>
          Fresh tracks you haven't heard, picked based on your taste.
        </p>

        {/* Seed pills */}
        {seeds.artists.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', alignSelf: 'center', marginRight: 2 }}>Based on:</span>
            {seeds.artists.slice(0, 5).map(a => (
              <span key={a.id} style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 99,
                padding: '3px 10px',
                fontSize: 11.5,
                fontWeight: 600,
                color: 'var(--text-2)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}>
                {a.images?.[0]?.url && (
                  <img src={a.images[0].url} alt="" style={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'cover' }} />
                )}
                {a.name}
              </span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={handlePlayAll} disabled={!tracks.length}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Play All
          </button>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {tracks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-3)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
          <p>No new recommendations right now. Try refreshing or listen to more music.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
          {tracks.map(t => {
            const isSaved = savedIds.has(t.id) || liked.some(l => l.spotify_id === t.id);
            return (
              <div key={t.id} style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                overflow: 'hidden',
                transition: 'background 0.15s, transform 0.15s',
                cursor: 'pointer',
              }}
                className="discover-card"
                onClick={() => playTrack(mapTrack(t), tracks.map(mapTrack))}>
                <div style={{ position: 'relative' }}>
                  {t.album?.images?.[0]?.url
                    ? <img src={t.album.images[0].url} alt="" style={{ width: '100%', aspectRatio: 1, objectFit: 'cover', display: 'block' }} />
                    : <div style={{ width: '100%', aspectRatio: 1, background: 'var(--surface-2)' }} />
                  }
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'rgba(8,8,16,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: 0,
                    transition: 'opacity 0.15s',
                  }} className="discover-card-overlay">
                    <div style={{
                      width: 44, height: 44,
                      background: 'var(--pink)',
                      borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 4px 16px rgba(255,45,120,0.4)',
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </div>
                  </div>
                </div>
                <div style={{ padding: '10px 12px 12px' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 10 }}>
                    {t.artists?.map(a => a.name).join(', ')}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      style={{
                        flex: 1, padding: '5px 0', borderRadius: 6, border: '1px solid var(--border)',
                        background: isSaved ? 'rgba(255,45,120,0.15)' : 'var(--surface-2)',
                        color: isSaved ? 'var(--pink)' : 'var(--text-2)',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
                        transition: 'all 0.15s',
                      }}
                      onClick={e => { e.stopPropagation(); if (!isSaved) handleSave(t); }}
                    >
                      {isSaved ? '♥ Saved' : '♡ Save'}
                    </button>
                    <button
                      style={{
                        padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)',
                        background: 'var(--surface-2)', color: 'var(--text-2)',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
                        transition: 'all 0.15s',
                      }}
                      onClick={e => { e.stopPropagation(); handleDownload(t); }}
                      title="Download"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
