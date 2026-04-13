import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore, useLibraryStore, useDownloadStore, useToastStore, useSelectionStore } from '../store';
import { PlayIcon, PauseIcon, HeartIcon, DownloadIcon, MoreIcon, MusicIcon, CheckIcon } from './Icons';

function formatTime(ms) {
  if (!ms) return '--:--';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function TrackRow({ track, index, queue, showAlbum = true }) {
  const navigate = useNavigate();
  const { currentTrack, playing, playTrack, playPause } = usePlayerStore();
  const { liked, toggleLike } = useLibraryStore();
  const { downloadTrack, activeDownloads } = useDownloadStore();
  const { add: toast } = useToastStore();
  const { selectionMode, toggleSelect } = useSelectionStore();
  const isTrackSelected = useSelectionStore(s => s.selectedTracks.has(track.id));
  const [ctxPos, setCtxPos] = useState(null);
  const ctxRef = useRef(null);

  const isPlaying = currentTrack?.id === track.id && playing;
  const isCurrent = currentTrack?.id === track.id;
  const isLiked = liked.some(t => t.id === track.id || t.spotify_id === track.spotify_id);
  const dlState = activeDownloads[track.id];
  const isDownloading = dlState?.status === 'downloading';
  const isDone = track.downloaded || dlState?.status === 'done';

  const handlePlay = (e) => {
    if (e && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      toggleSelect(track.id);
      return;
    }
    if (isCurrent) { playPause(); return; }
    playTrack(track, queue || [track]);
  };

  const handleLike = async (e) => {
    e.stopPropagation();
    const nowLiked = await toggleLike(track);
    toast(nowLiked ? '♥ Added to Liked Songs' : 'Removed from Liked Songs', nowLiked ? 'success' : 'info');
  };

  const handleDownload = async (e) => {
    e.stopPropagation();
    if (isDone) { toast('Already downloaded', 'info'); return; }
    await downloadTrack(track);
    toast(`Queued: ${track.title}`, 'info');
  };

  const handleCtx = (e) => {
    e.preventDefault();
    setCtxPos({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!ctxPos) return;
    const close = () => setCtxPos(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [ctxPos]);

  return (
    <>
      <div
        className={`track-row ${isCurrent ? 'playing' : ''}${isTrackSelected ? ' selected' : ''}`}
        onClick={handlePlay}
        onContextMenu={handleCtx}
        draggable="true"
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(index)); e.dataTransfer.effectAllowed = 'move'; }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
        onDrop={(e) => { e.preventDefault(); }}
        role="row"
        aria-selected={isTrackSelected}
        aria-label={track.title}
      >
        {/* Drag handle */}
        <span className="drag-handle" title="Drag to reorder">&#8801;</span>

        {/* Selection checkbox */}
        <input
          type="checkbox"
          className="select-checkbox"
          checked={isTrackSelected}
          onChange={(e) => { e.stopPropagation(); toggleSelect(track.id); }}
          onClick={(e) => e.stopPropagation()}
          style={{ display: selectionMode ? 'inline-block' : undefined }}
        />

        {/* Number / Now Playing indicator */}
        <div className="track-num">
          {isCurrent && playing ? (
            <div className="now-playing-bars">
              <span /><span /><span />
            </div>
          ) : (
            <>
              <span className="num-label">{index + 1}</span>
              <span className="play-icon">
                {isCurrent ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
              </span>
            </>
          )}
        </div>

        {/* Track info */}
        <div className="track-info">
          {track.album_art ? (
            <img src={track.album_art} alt="" className="track-art" />
          ) : (
            <div className="track-art" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
              <MusicIcon size={16} />
            </div>
          )}
          <div className="track-text">
            <div className="track-title">{track.title}</div>
            <div className="track-artist">
              {(track.artist || '').split(', ').map((name, i, arr) => (
                <React.Fragment key={name}>
                  <span
                    className="track-artist-link"
                    onClick={e => {
                      e.stopPropagation();
                      // If we have artist_ids from a Spotify response, use the matching ID
                      const id = track.artist_ids?.[i] || encodeURIComponent(name);
                      navigate(`/artist/${id}`);
                    }}
                  >
                    {name}
                  </span>
                  {i < arr.length - 1 && ', '}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* Album */}
        {showAlbum && (
          <div className="track-album">{track.album || '—'}</div>
        )}

        {/* Duration */}
        <div className="track-duration">{formatTime(track.duration_ms)}</div>

        {/* Actions */}
        <div className="track-actions">
          <button className={`track-action-btn ${isLiked ? 'liked' : ''}`} onClick={handleLike} title="Like">
            <HeartIcon size={15} filled={isLiked} />
          </button>
          <button
            className={`track-action-btn ${isDone ? 'downloaded' : ''}`}
            onClick={handleDownload}
            title={isDone ? 'Downloaded' : 'Download'}
          >
            {isDone ? <CheckIcon size={15} /> : isDownloading
              ? <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--pink)' }}>{Math.round(dlState?.progress || 0)}%</span>
              : <DownloadIcon size={15} />
            }
          </button>
          <button className="track-action-btn" onClick={e => { e.stopPropagation(); handleCtx(e); }} title="More">
            <MoreIcon size={15} />
          </button>
        </div>
      </div>

      {/* Context menu */}
      {ctxPos && (
        <ContextMenu
          ref={ctxRef}
          pos={ctxPos}
          track={track}
          isLiked={isLiked}
          isDone={isDone}
          onLike={handleLike}
          onDownload={handleDownload}
          onClose={() => setCtxPos(null)}
        />
      )}
    </>
  );
}

const ContextMenu = React.forwardRef(({ pos, track, isLiked, isDone, onLike, onDownload, onClose }, ref) => {
  const navigate = useNavigate();
  const { playTrack } = usePlayerStore();
  const { add: toast } = useToastStore();

  const style = {
    left: Math.min(pos.x, window.innerWidth - 220),
    top: Math.min(pos.y, window.innerHeight - 220),
  };

  return (
    <div className="ctx-menu" style={style}>
      <div className="ctx-item" onClick={(e) => { playTrack(track, [track]); onClose(); }}>
        <PlayIcon size={15} /> Play now
      </div>
      <div className="ctx-divider" />
      <div className="ctx-item" onClick={(e) => { onLike(e); onClose(); }}>
        <HeartIcon size={15} filled={isLiked} style={{ color: isLiked ? 'var(--pink)' : undefined }} />
        {isLiked ? 'Remove from Liked' : 'Add to Liked Songs'}
      </div>
      <div className="ctx-item" onClick={(e) => { onDownload(e); onClose(); }}>
        <DownloadIcon size={15} />
        {isDone ? 'Already Downloaded' : 'Download'}
      </div>
      <div className="ctx-divider" />
      {track.artist && (
        <div className="ctx-item" onClick={() => {
          const firstName = track.artist.split(', ')[0];
          const id = track.artist_ids?.[0] || encodeURIComponent(firstName);
          navigate(`/artist/${id}`);
          onClose();
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
          Go to Artist
        </div>
      )}
      <div className="ctx-divider" />
      <div className="ctx-item" onClick={() => {
        navigator.clipboard?.writeText(`${track.artist} - ${track.title}`);
        toast('Copied to clipboard', 'info');
        onClose();
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        Copy title
      </div>
    </div>
  );
});
