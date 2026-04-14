import React, { useRef, useState, useCallback, useEffect } from 'react';
import { usePlayerStore, useLibraryStore, useToastStore, useUIStore, seekingFlag, isTrackPending } from '../store';
import ArtistLinks from './ArtistLinks';
import QueuePanel from './QueuePanel';
import Equalizer from './Equalizer';
import {
  PlayIcon, PauseIcon, SkipNextIcon, SkipPrevIcon,
  ShuffleIcon, RepeatIcon, VolumeIcon, HeartIcon, MusicIcon
} from './Icons';

function formatTime(secs) {
  if (!secs || isNaN(secs)) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Generic draggable bar — updates fill via direct DOM during drag (zero re-renders),
// commits to parent only on mouseup to prevent React overriding mid-drag.
function DraggableBar({ value, onChange, onDrag, onDragStart, onDragEnd, className, fillClassName, children, trackStyle = {} }) {
  const barRef   = useRef(null);
  const fillRef  = useRef(null);
  const dragging = useRef(false);

  // Keep fill in sync with `value` prop — but ONLY when not dragging.
  // Using useEffect (not inline style prop) means React can't clobber the
  // direct DOM updates we make during a drag.
  useEffect(() => {
    if (!dragging.current && fillRef.current) {
      fillRef.current.style.width = `${value * 100}%`;
    }
  }, [value]);

  const compute = (e) => {
    const rect = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };

  const onMouseDown = (e) => {
    e.preventDefault();
    dragging.current = true;
    if (onDragStart) onDragStart();
    let v = compute(e);
    if (fillRef.current) fillRef.current.style.width = `${v * 100}%`;
    if (onDrag) onDrag(v);

    const onMove = (ev) => {
      v = compute(ev);
      if (fillRef.current) fillRef.current.style.width = `${v * 100}%`;
      if (onDrag) onDrag(v);
    };
    const onUp = () => {
      dragging.current = false;
      if (onDragEnd) onDragEnd(v);
      onChange(v);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={barRef}
      className={className || 'progress-bar'}
      onMouseDown={onMouseDown}
      style={{ cursor: 'pointer', ...trackStyle }}
    >
      {/* No inline style width here — managed via useEffect above to prevent
          React from overriding direct DOM updates during drag */}
      <div ref={fillRef} className={fillClassName || 'progress-fill'} />
      {children}
    </div>
  );
}

const SPEED_MIN = 0.25;
const SPEED_MAX = 3;
// Convert speed value ↔ 0–1 slider position
const speedToFrac = (s) => (s - SPEED_MIN) / (SPEED_MAX - SPEED_MIN);
const fracToSpeed = (f) => Math.round((SPEED_MIN + f * (SPEED_MAX - SPEED_MIN)) * 100) / 100;

export default function Player() {
  const {
    currentTrack, playing, progress, duration, volume,
    speed, pitchPreserve, shuffle, repeat,
    playPause, next, prev, seek, setVolume,
    toggleShuffle, toggleRepeat, setSpeed, togglePitchPreserve,
  } = usePlayerStore();

  const { liked, toggleLike } = useLibraryStore();
  const { add: toast } = useToastStore();
  const { showQueue, showEqualizer } = useUIStore();

  const [muted, setMuted]     = useState(false);
  const [prevVol, setPrevVol] = useState(0.8);
  const [showSpeed, setShowSpeed] = useState(false);
  const speedMenuRef = useRef(null);

  const isLiked   = currentTrack && liked.some(t => t.id === currentTrack.id || t.spotify_id === currentTrack.spotify_id);
  const isPending = isTrackPending(currentTrack);
  const pct       = duration > 0 ? (progress / duration) * 100 : 0;

  // Progress bar: block timeupdate during drag so it can't override fill position.
  // We use seekingFlag (a plain object ref) instead of Zustand state — this is
  // critical: Zustand state changes trigger a Player re-render which resets the
  // fill element's inline style and makes the bar snap back mid-drag.
  const handleSeekStart  = useCallback(() => { seekingFlag.current = true; }, []);
  const handleSeek       = useCallback((v) => { seekingFlag.current = false; seek(v); }, [seek]);

  // Volume bar: update audio element directly during drag (no store update = no re-render)
  const handleVolumeDrag = useCallback((v) => {
    const { audioEl } = usePlayerStore.getState();
    if (audioEl) audioEl.volume = v;
  }, []);
  const handleVolume = useCallback((v) => {
    setVolume(v);
    if (v > 0) setMuted(false);
  }, [setVolume]);

  const toggleMute = () => {
    if (muted) { setVolume(prevVol || 0.8); setMuted(false); }
    else { setPrevVol(volume); setVolume(0); setMuted(true); }
  };

  const handleLike = async () => {
    if (!currentTrack || isPending) return;
    const nowLiked = await toggleLike(currentTrack);
    toast(nowLiked ? '♥ Added to Liked Songs' : 'Removed from Liked Songs', nowLiked ? 'success' : 'info');
  };

  // Close speed menu on outside click
  useEffect(() => {
    const h = (e) => { if (speedMenuRef.current && !speedMenuRef.current.contains(e.target)) setShowSpeed(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const displayVolume = muted ? 0 : volume;

  return (
    <footer className="player">

      {/* ── Left: Track info ─────────────────────────────────────────── */}
      <div className="player-track">
        {/* Spinning disc / idle button */}
        <div className="player-art-wrap" onClick={currentTrack && !isPending ? playPause : undefined} style={{ cursor: currentTrack && !isPending ? 'pointer' : 'default' }}>
          <div className={`player-art-disc ${playing && !isPending ? 'spinning' : ''} ${!currentTrack ? 'idle' : ''}`}>
            {currentTrack?.album_art && !isPending
              ? <img src={currentTrack.album_art} alt="" className="player-art-img" />
              : <MusicIcon size={20} />
            }
          </div>
          {currentTrack && !isPending && (
            <div className="player-art-overlay">
              {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
            </div>
          )}
          {isPending && (
            <div className="player-art-overlay" style={{ opacity: 1, background: 'rgba(0,0,0,0.65)' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--pink)', animation: 'pulse 1s infinite' }} />
            </div>
          )}
        </div>

        <div className="player-track-info">
          {currentTrack ? (
            <>
              <div className="player-track-title">{currentTrack.title}</div>
              <div className="player-track-artist">
                <ArtistLinks artist={currentTrack.artist} artistIds={currentTrack.artist_ids} />
              </div>
              {isPending
                ? <span className="player-track-badge" style={{ background: 'rgba(255,179,0,0.14)', color: 'var(--amber)' }}>DOWNLOADING…</span>
                : currentTrack.downloaded && <span className="player-track-badge">LOCAL</span>
              }
            </>
          ) : (
            <div className="player-track-artist" style={{ fontSize: 12 }}>
              Click any downloaded song to play
            </div>
          )}
        </div>

        {currentTrack && !isPending && (
          <button
            className={`track-action-btn ${isLiked ? 'liked' : ''}`}
            onClick={handleLike}
            title={isLiked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
            style={{ marginLeft: 6 }}
          >
            <HeartIcon size={16} filled={isLiked} />
          </button>
        )}
      </div>

      {/* ── Center: Controls + Progress ───────────────────────────────── */}
      <div className="player-controls">
        <div className="player-buttons">
          <button className={`player-btn ${shuffle ? 'active' : ''}`} onClick={toggleShuffle} title="Shuffle">
            <ShuffleIcon size={16} />
          </button>
          <button className="player-btn" onClick={prev} title="Previous">
            <SkipPrevIcon size={18} />
          </button>
          <button className="player-btn-play" onClick={playPause} title={playing ? 'Pause' : 'Play'} disabled={isPending}>
            {playing ? <PauseIcon size={17} /> : <PlayIcon size={17} />}
          </button>
          <button className="player-btn" onClick={next} title="Next">
            <SkipNextIcon size={18} />
          </button>
          <button
            className={`player-btn ${repeat !== 'off' ? 'active' : ''}`}
            onClick={toggleRepeat}
            title={`Repeat: ${repeat}`}
            style={{ position: 'relative' }}
          >
            <RepeatIcon size={16} />
            {repeat === 'one' && (
              <span style={{
                position: 'absolute', top: 0, right: 0,
                width: 10, height: 10, borderRadius: '50%',
                background: 'var(--pink)', fontSize: 7,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, color: '#fff',
              }}>1</span>
            )}
          </button>
        </div>

        {/* Progress bar */}
        <div className="player-progress">
          <span className="player-time">{formatTime(progress)}</span>
          <DraggableBar
            value={pct / 100}
            onChange={handleSeek}
            onDragStart={handleSeekStart}
            className="progress-bar"
            fillClassName="progress-fill"
          />
          <span className="player-time">{formatTime(duration)}</span>
        </div>
      </div>

      {/* ── Right: Volume + Speed ─────────────────────────────────────── */}
      <div className="player-right" style={{ gap: 6 }}>

        {/* Queue toggle */}
        <button
          className={`player-btn ${showQueue ? 'active' : ''}`}
          onClick={() => useUIStore.getState().toggleQueue()}
          title="Queue"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        </button>

        {/* Equalizer toggle */}
        <button
          className={`player-btn ${showEqualizer ? 'active' : ''}`}
          onClick={() => useUIStore.getState().toggleEqualizer()}
          title="Equalizer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><circle cx="4" cy="12" r="2" /><circle cx="12" cy="10" r="2" /><circle cx="20" cy="14" r="2" />
          </svg>
        </button>

        {/* Speed control */}
        <div style={{ position: 'relative' }} ref={speedMenuRef}>
          <button
            className={`player-btn ${speed !== 1 ? 'active' : ''}`}
            onClick={() => setShowSpeed(s => !s)}
            title="Playback speed"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 700,
              width: 34, height: 28,
              borderRadius: 6,
              letterSpacing: -0.5,
              color: speed !== 1 ? 'var(--pink)' : 'var(--text-3)',
            }}
          >
            {speed === 1 ? '1×' : `${speed}×`}
          </button>

          {showSpeed && (
            <div style={{
              position: 'absolute',
              bottom: 'calc(100% + 8px)',
              right: 0,
              background: 'var(--surface-2)',
              border: '1px solid var(--border-2)',
              borderRadius: 'var(--radius-lg)',
              padding: '14px 14px 12px',
              width: 200,
              zIndex: 200,
              boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
              animation: 'slide-up 0.15s ease',
            }}>

              {/* Header row: label + big value + reset */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  Speed
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700,
                    color: speed !== 1 ? 'var(--pink)' : 'var(--text-1)',
                    minWidth: 40, textAlign: 'right',
                  }}>
                    {speed.toFixed(2)}×
                  </span>
                  {speed !== 1 && (
                    <button
                      onClick={() => setSpeed(1)}
                      title="Reset to 1×"
                      style={{
                        background: 'var(--surface)', border: '1px solid var(--border-2)',
                        borderRadius: 4, color: 'var(--text-3)', cursor: 'pointer',
                        fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700,
                        padding: '2px 5px', letterSpacing: 0.5,
                      }}
                    >
                      RESET
                    </button>
                  )}
                </div>
              </div>

              {/* Slider */}
              <div style={{ marginBottom: 4 }}>
                <DraggableBar
                  value={speedToFrac(speed)}
                  onChange={(f) => setSpeed(fracToSpeed(f))}
                  className="progress-bar"
                  fillClassName="progress-fill"
                  trackStyle={{ height: 5 }}
                />
              </div>

              {/* Min / max labels */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>{SPEED_MIN}×</span>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>{SPEED_MAX}×</span>
              </div>

              {/* Pitch Lock toggle */}
              <div
                onClick={togglePitchPreserve}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                  borderTop: '1px solid var(--border)',
                  paddingTop: 10, marginTop: 2,
                  userSelect: 'none',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)' }}>Pitch Lock</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 1 }}>
                    {pitchPreserve ? 'Pitch stays natural' : 'Pitch shifts with speed'}
                  </div>
                </div>
                {/* Toggle pill */}
                <div style={{
                  width: 32, height: 18, borderRadius: 99, flexShrink: 0,
                  background: pitchPreserve ? 'var(--pink)' : 'var(--border-2)',
                  position: 'relative', transition: 'background 0.2s',
                  boxShadow: pitchPreserve ? '0 0 8px var(--pink-glow)' : 'none',
                }}>
                  <div style={{
                    position: 'absolute', top: 3,
                    left: pitchPreserve ? 17 : 3,
                    width: 12, height: 12,
                    borderRadius: '50%', background: '#fff',
                    transition: 'left 0.18s cubic-bezier(0.4,0,0.2,1)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  }} />
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Volume */}
        <button className="player-btn" onClick={toggleMute} title="Toggle mute" style={{ flexShrink: 0 }}>
          <VolumeIcon size={17} muted={muted || volume === 0} />
        </button>

        <DraggableBar
          value={displayVolume}
          onChange={handleVolume}
          onDrag={handleVolumeDrag}
          className="volume-bar"
          fillClassName="volume-fill"
          trackStyle={{ width: 80, flexShrink: 0 }}
        />

        {/* Volume % label */}
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--text-3)', minWidth: 26, textAlign: 'right',
        }}>
          {Math.round(displayVolume * 100)}%
        </span>
      </div>

      {showQueue && <QueuePanel />}
      {showEqualizer && <Equalizer />}
    </footer>
  );
}
