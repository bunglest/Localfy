import React, { useEffect, useState, useRef } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useLibraryStore, useDownloadStore, usePlayerStore, useToastStore } from '../store';
import TrackRow from '../components/TrackRow';
import { SearchIcon, ImportIcon, DownloadIcon, MusicIcon } from '../components/Icons';

export default function PlaylistPage() {
  const { id } = useParams();
  const location = useLocation();
  const { playlists, loadPlaylists } = useLibraryStore();
  const { downloadAll, loadStats } = useDownloadStore();
  const { playTrack } = usePlayerStore();
  const { add: toast } = useToastStore();

  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [importingTracks, setImportingTracks] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [playlistImageUrl, setPlaylistImageUrl] = useState('');
  const [editOpen, setEditOpen] = useState(false);

  const playlist = playlists.find(p => p.id === id);

  useEffect(() => {
    if (!id) return;
    loadPlaylistData();
    if (playlist?.image_url) {
      setPlaylistImageUrl(playlist.image_url);
    }

    // Auto-open edit modal when navigated here with ?new=1 (fresh playlist)
    if (new URLSearchParams(location.search).get('new') === '1') {
      setEditOpen(true);
    }

    const unsub = window.localfy.onImportProgress((data) => {
      if (data.type === 'playlists') {
        setImportProgress(data);
      }
    });
    return () => typeof unsub === 'function' && unsub();
  }, [id, playlist?.image_url]);

  const loadPlaylistData = async () => {
    setLoading(true);
    try {
      const t = await window.localfy.dbGetPlaylistTracks(id);
      setTracks(t);
    } catch (e) {
      toast('Failed to load playlist', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!playlist?.spotify_id) { toast('This is a local playlist', 'info'); return; }
    setImportingTracks(true);
    try {
      const data = await window.localfy.spotifyGetPlaylist(playlist.spotify_id);
      const items = data.items || [];
      let added = 0;
      for (const item of items) {
        const t = item.track;
        if (!t || t.is_local) continue;
        await window.localfy.dbToggleLike({
          id: t.id, spotify_id: t.id, title: t.name,
          artist: t.artists?.map(a => a.name).join(', ') || '',
          album: t.album?.name || '',
          album_art: t.album?.images?.[0]?.url || '',
          duration_ms: t.duration_ms, liked: 0,
        });
        added++;
      }
      await loadPlaylistData();
      toast(`Imported ${added} tracks`, 'success');
    } catch (e) {
      toast('Import failed: ' + e.message, 'error');
    } finally {
      setImportingTracks(false);
    }
  };

  const handleDownloadAll = async () => {
    const notDownloaded = tracks.filter(t => !t.downloaded);
    if (!notDownloaded.length) { toast('All tracks already downloaded!', 'info'); return; }
    await downloadAll(notDownloaded);
    await loadStats();
    toast(`Queued ${notDownloaded.length} songs for download`, 'info');
  };

  const handlePlayAll = () => {
    if (!filtered.length) return;
    playTrack(filtered[0], filtered);
  };

  const handleSaveEdit = async ({ name, imageUrl }) => {
    try {
      if (name && name !== playlist?.name) {
        await window.localfy.dbRenamePlaylist(id, name);
      }
      if (imageUrl && imageUrl !== playlistImageUrl) {
        await window.localfy.dbUpdatePlaylistImage(id, imageUrl);
        setPlaylistImageUrl(imageUrl);
      }
      await loadPlaylists();
      setEditOpen(false);
      toast('Playlist updated', 'success');
    } catch (e) {
      toast('Failed to save: ' + e.message, 'error');
    }
  };

  const filtered = tracks.filter(t => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return t.title?.toLowerCase().includes(q) || t.artist?.toLowerCase().includes(q);
  });

  const downloadedCount = tracks.filter(t => t.downloaded).length;

  return (
    <div>
      {/* Header */}
      <div style={{
        padding: '28px 28px 20px',
        background: 'linear-gradient(to bottom, var(--surface-2), var(--bg))',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, marginBottom: 20 }}>
          {/* Cover art — static, no click handler */}
          <div style={{
            width: 80, height: 80, borderRadius: 10, flexShrink: 0,
            overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            background: 'linear-gradient(135deg, var(--surface-2), var(--border))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {playlistImageUrl
              ? <img src={playlistImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : <MusicIcon size={28} style={{ color: 'var(--text-3)' }} />
            }
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: 1.5, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>
              {playlist?.is_local ? 'Local Playlist' : 'Playlist'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{
                fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, letterSpacing: -0.8,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0,
              }}>
                {playlist?.name || 'Playlist'}
              </h1>
              <button
                onClick={() => setEditOpen(true)}
                title="Edit playlist"
                style={{
                  flexShrink: 0,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 7,
                  padding: '5px 10px',
                  cursor: 'pointer',
                  color: 'var(--text-2)',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'var(--font-body)',
                  display: 'flex', alignItems: 'center', gap: 5,
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-1)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.color = 'var(--text-2)'; }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit
              </button>
            </div>
            {playlist?.owner && (
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>by {playlist.owner}</div>
            )}
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4, display: 'flex', gap: 12 }}>
              <span>{tracks.length} songs</span>
              {downloadedCount > 0 && <span style={{ color: 'var(--green)' }}>· {downloadedCount} downloaded</span>}
            </div>
          </div>
        </div>

        {/* Edit modal */}
        {editOpen && (
          <EditPlaylistModal
            playlist={playlist}
            currentImageUrl={playlistImageUrl}
            onSave={handleSaveEdit}
            onClose={() => setEditOpen(false)}
          />
        )}

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handlePlayAll} disabled={!filtered.length}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Play All
          </button>

          {playlist?.spotify_id && (
            <button className="btn btn-outline" onClick={handleImport} disabled={importingTracks}>
              <ImportIcon size={14} />
              {importingTracks ? 'Importing…' : 'Sync from Spotify'}
            </button>
          )}

          <button className="btn btn-outline" onClick={handleDownloadAll}>
            <DownloadIcon size={14} /> Download All
          </button>

          <button className="btn btn-outline" onClick={() => {
            window.localfy.playlistExport(id);
            toast('Playlist exported', 'success');
          }}>
            Export
          </button>

          <button className="btn btn-ghost btn-sm" onClick={async () => {
            try {
              const dupes = await window.localfy.dbFindDuplicates();
              if (dupes && dupes.length > 0) {
                toast(`Found ${dupes.length} duplicate(s)`, 'info');
              } else {
                toast('No duplicates found', 'success');
              }
            } catch (e) {
              toast('Failed to check duplicates: ' + e.message, 'error');
            }
          }}>
            Find Duplicates
          </button>

          <div className="search-bar" style={{ width: 240, height: 36 }}>
            <SearchIcon size={14} style={{ color: 'var(--text-3)' }} />
            <input type="text" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter tracks…" />
          </div>
        </div>
      </div>

      {/* Track list */}
      <div style={{ padding: '8px 12px 40px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[...Array(8)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 54, borderRadius: 'var(--radius)', marginBottom: 2 }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <MusicIcon size={48} className="empty-state-icon" />
            {tracks.length === 0 ? (
              <>
                <div className="empty-state-title">Playlist is empty</div>
                <div className="empty-state-sub">Sync from Spotify to load this playlist's tracks.</div>
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
              <span>#</span><span>Title</span><span>Album</span><span>Time</span><span></span>
            </div>
            {filtered.map((track, i) => (
              <div key={track.id} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <TrackRow track={track} index={i} queue={filtered} />
                </div>
                <button
                  className="track-action-btn"
                  title="Remove from playlist"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await window.localfy.dbRemoveTrackFromPlaylist(id, track.id);
                      await loadPlaylistData();
                      toast('Track removed', 'info');
                    } catch (err) {
                      toast('Failed to remove: ' + err.message, 'error');
                    }
                  }}
                  style={{ flexShrink: 0, marginRight: 8, color: 'var(--text-3)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Edit Playlist Modal ───────────────────────────────────────────────── */
function EditPlaylistModal({ playlist, currentImageUrl, onSave, onClose }) {
  const { add: toast } = useToastStore();
  const [name, setName] = useState(playlist?.name || '');
  const [imageUrl, setImageUrl] = useState(currentImageUrl || '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    // Focus the name input when modal opens
    setTimeout(() => inputRef.current?.select(), 50);

    // Close on Escape
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const handleChooseImage = async () => {
    try {
      const path = await window.localfy.settingsChooseImage();
      if (path) setImageUrl(path);
    } catch {}
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    if (imageUrl && !imageUrl.startsWith('http://') && !imageUrl.startsWith('https://') && !imageUrl.startsWith('file://')) {
      toast('Image URL must start with http:// or https://', 'error');
      return;
    }
    setSaving(true);
    await onSave({ name: name.trim(), imageUrl });
    setSaving(false);
  };

  return (
    /* Backdrop */
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
    >
      {/* Dialog */}
      <div style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '28px 28px 24px',
        width: 360,
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, marginBottom: 22 }}>
          Edit Playlist
        </div>

        {/* Cover + name side by side */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          {/* Cover picker */}
          <div
            onClick={handleChooseImage}
            title="Change cover"
            style={{
              width: 80, height: 80, flexShrink: 0,
              borderRadius: 10, overflow: 'hidden',
              border: '1.5px dashed var(--border)',
              background: 'var(--surface)',
              cursor: 'pointer', position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--pink)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
          >
            {imageUrl
              ? <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              : <MusicIcon size={24} style={{ color: 'var(--text-3)' }} />
            }
            {/* Camera badge */}
            <div style={{
              position: 'absolute', bottom: 4, right: 4,
              width: 20, height: 20, borderRadius: '50%',
              background: 'var(--pink)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </div>
          </div>

          {/* Name input */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
              Playlist name
            </label>
            <input
              ref={inputRef}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              placeholder="My playlist"
              style={{
                background: 'var(--surface)',
                border: '1.5px solid var(--border)',
                borderRadius: 8,
                padding: '9px 12px',
                color: 'var(--text-1)',
                fontSize: 13,
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
                outline: 'none',
                transition: 'border-color 0.15s',
                width: '100%',
                boxSizing: 'border-box',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--pink)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
              Click the image to change the cover
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 16px',
              color: 'var(--text-2)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            style={{
              background: 'var(--pink)', border: 'none',
              borderRadius: 8, padding: '8px 20px',
              color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: name.trim() ? 'pointer' : 'default',
              fontFamily: 'var(--font-body)',
              opacity: !name.trim() ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
