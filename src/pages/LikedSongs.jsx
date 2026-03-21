import React, { useEffect, useState } from 'react';
import { useLibraryStore, useDownloadStore, usePlayerStore, useToastStore } from '../store';
import TrackRow from '../components/TrackRow';
import { HeartIcon, SearchIcon, ImportIcon, DownloadIcon } from '../components/Icons';

export default function LikedSongs() {
  const { liked, loadLiked } = useLibraryStore();
  const { downloadAll, loadStats } = useDownloadStore();
  const { playTrack } = usePlayerStore();
  const { add: toast } = useToastStore();
  const [filter, setFilter] = useState('');
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [importProgress, setImportProgress] = useState(null);

  useEffect(() => {
    loadLiked();

    // Subscribe to import progress
    const unsub = window.localfy.onImportProgress((data) => {
      if (data.type === 'liked') {
        setImportProgress(data);
        if (data.imported === data.total) {
          setImporting(false);
          setImportProgress(null);
          loadLiked();
          toast(`Imported ${data.imported} liked songs!`, 'success');
        }
      }
    });
    return unsub;
  }, []);

  const filtered = liked.filter(t => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return t.title?.toLowerCase().includes(q) || t.artist?.toLowerCase().includes(q);
  });

  const handleImport = async () => {
    setImporting(true);
    setImportProgress({ imported: 0, total: '…' });
    try {
      const result = await window.localfy.importLikedSongs();
      if (result.success) {
        await loadLiked();
        toast(`Imported ${result.imported} liked songs!`, 'success');
      } else {
        toast('Import failed: ' + result.error, 'error');
      }
    } catch (e) {
      toast('Import failed: ' + e.message, 'error');
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const handleDownloadAll = async () => {
    const notDownloaded = liked.filter(t => !t.downloaded);
    if (!notDownloaded.length) { toast('All liked songs are already downloaded!', 'info'); return; }
    setDownloading(true);
    await downloadAll(notDownloaded);
    await loadStats();
    toast(`Queued ${notDownloaded.length} songs for download`, 'info');
    setDownloading(false);
  };

  const handlePlayAll = () => {
    if (!filtered.length) return;
    playTrack(filtered[0], filtered);
  };

  const downloadedCount = liked.filter(t => t.downloaded).length;

  return (
    <div>
      {/* Header with pink gradient */}
      <div style={{
        padding: '28px 28px 20px',
        background: 'linear-gradient(to bottom, rgba(255,45,120,0.12) 0%, var(--bg) 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Background decoration */}
        <div style={{
          position: 'absolute', top: -40, right: -40,
          width: 200, height: 200,
          background: 'radial-gradient(circle, rgba(255,45,120,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, marginBottom: 20, position: 'relative', zIndex: 1 }}>
          <div style={{
            width: 80, height: 80,
            background: 'linear-gradient(135deg, #FF2D78 0%, #FF6B9D 100%)',
            borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 32px var(--pink-glow)',
          }}>
            <HeartIcon size={36} filled style={{ color: '#fff' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: 1.5, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 4 }}>
              Collection
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>
              Liked Songs
            </h1>
            <div style={{ color: 'var(--text-2)', fontSize: 13, marginTop: 6, display: 'flex', gap: 12, alignItems: 'center' }}>
              <span>{liked.length} songs</span>
              {downloadedCount > 0 && (
                <span style={{ color: 'var(--green)', fontSize: 12 }}>
                  · {downloadedCount} downloaded
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
          <button className="btn btn-primary" onClick={handlePlayAll} disabled={!filtered.length}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Play All
          </button>

          <button
            className="btn btn-outline"
            onClick={handleImport}
            disabled={importing}
          >
            <ImportIcon size={14} />
            {importing
              ? importProgress
                ? `Importing… ${importProgress.imported}/${importProgress.total}`
                : 'Importing…'
              : 'Import from Spotify'
            }
          </button>

          <button
            className="btn btn-outline"
            onClick={handleDownloadAll}
            disabled={downloading}
          >
            <DownloadIcon size={14} />
            {downloading ? 'Queuing…' : 'Download All'}
          </button>

          {/* Search */}
          <div className="search-bar" style={{ width: 260, height: 36 }}>
            <SearchIcon size={14} style={{ color: 'var(--text-3)' }} />
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter liked songs…"
            />
          </div>
        </div>

        {/* Import progress bar */}
        {importProgress && (
          <div style={{ marginTop: 12, position: 'relative', zIndex: 1 }}>
            <div className="dl-status-bar">
              <div
                className="dl-status-fill"
                style={{ width: `${(importProgress.imported / (importProgress.total || 1)) * 100}%` }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
              {importProgress.imported} / {importProgress.total} imported
            </div>
          </div>
        )}
      </div>

      {/* Track list */}
      <div style={{ padding: '8px 12px 40px' }}>
        {liked.length === 0 ? (
          <div className="empty-state">
            <HeartIcon size={64} className="empty-state-icon" style={{ color: 'var(--pink)', opacity: 0.3 }} />
            <div className="empty-state-title">No liked songs yet</div>
            <div className="empty-state-sub">Import your liked songs from Spotify to see them here.</div>
            <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
              <ImportIcon size={14} />
              Import Liked Songs
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No results</div>
            <div className="empty-state-sub">Try a different filter</div>
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
