import React, { useState, useRef } from 'react';
import { usePlayerStore, useUIStore } from '../store';

export default function QueuePanel() {
  const { queue, currentIndex, playFromIndex, removeFromQueue, reorderQueue, clearQueue } = usePlayerStore();
  const { showQueue, toggleQueue } = useUIStore();
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const dragNode = useRef(null);

  if (!showQueue) return null;

  const handleDragStart = (e, index) => {
    dragNode.current = e.target;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Make drag image slightly transparent
    setTimeout(() => {
      if (dragNode.current) dragNode.current.style.opacity = '0.4';
    }, 0);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (index !== dragOverIndex) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== dropIndex) {
      reorderQueue(dragIndex, dropIndex);
    }
    resetDrag();
  };

  const handleDragEnd = () => {
    if (dragNode.current) dragNode.current.style.opacity = '1';
    resetDrag();
  };

  const resetDrag = () => {
    setDragIndex(null);
    setDragOverIndex(null);
    dragNode.current = null;
  };

  return (
    <div className="queue-panel">
      <div className="queue-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h3 style={{ margin: 0 }}>Queue</h3>
          <span style={{ fontSize: 12, opacity: 0.6 }}>{queue.length} tracks</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {queue.length > 0 && (
            <button
              onClick={clearQueue}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary, #999)',
                cursor: 'pointer',
                fontSize: 13,
                padding: '4px 8px',
              }}
            >
              Clear
            </button>
          )}
          <button
            onClick={toggleQueue}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-primary, #fff)',
              cursor: 'pointer',
              fontSize: 18,
              padding: '4px 8px',
              lineHeight: 1,
            }}
            aria-label="Close queue"
          >
            ×
          </button>
        </div>
      </div>

      <div className="queue-panel-list">
        {queue.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', opacity: 0.5 }}>
            Queue is empty
          </div>
        ) : (
          queue.map((track, index) => (
            <div
              key={`${track.id || track.path}-${index}`}
              className={`queue-item ${index === currentIndex ? 'active' : ''} ${dragOverIndex === index ? 'drag-over' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onClick={() => playFromIndex(index)}
              style={{ cursor: 'pointer' }}
            >
              <span
                className="queue-item-drag"
                style={{
                  cursor: 'grab',
                  opacity: 0.4,
                  fontSize: 14,
                  userSelect: 'none',
                  padding: '0 4px',
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                ≡
              </span>

              <div className="queue-item-art">
                {track.thumbnail || track.albumArt ? (
                  <img
                    src={track.thumbnail || track.albumArt}
                    alt=""
                    style={{ width: 36, height: 36, borderRadius: 4, objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 4,
                      background: 'var(--bg-tertiary, #333)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 16,
                    }}
                  >
                    ♪
                  </div>
                )}
              </div>

              <div className="queue-item-info" style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="queue-item-title"
                  style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontWeight: index === currentIndex ? 600 : 400,
                    color: index === currentIndex ? 'var(--accent, #1db954)' : 'var(--text-primary, #fff)',
                  }}
                >
                  {track.title || 'Unknown Title'}
                </div>
                <div
                  className="queue-item-artist"
                  style={{
                    fontSize: 12,
                    opacity: 0.6,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {track.artist || 'Unknown Artist'}
                </div>
              </div>

              <div className="queue-item-actions">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromQueue(index);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary, #999)',
                    cursor: 'pointer',
                    fontSize: 16,
                    padding: '4px 8px',
                    lineHeight: 1,
                    borderRadius: 4,
                  }}
                  aria-label="Remove from queue"
                >
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
