import React, { useEffect, useState, useMemo } from 'react';
import ArtistLinks from '../components/ArtistLinks';
import { useDownloadStore, useToastStore } from '../store';
import { DownloadIcon, TrashIcon, RefreshIcon, CheckIcon, XIcon, AlertIcon } from '../components/Icons';

export default function Downloads() {
  const { stats, activeDownloads, loadStats, clearQueue } = useDownloadStore();
  const { add: toast } = useToastStore();
  const [ytDlpOk, setYtDlpOk]   = useState(null);
  const [filter,   setFilter]    = useState('all'); // 'all' | 'done' | 'queued' | 'failed' | 'downloading'

  useEffect(() => {
    loadStats();
    checkYtDlp();
    const interval = setInterval(() => loadStats(), 2000);
    return () => clearInterval(interval);
  }, []);

  const checkYtDlp = async () => {
    const result = await window.localfy.downloadCheckYtDlp();
    setYtDlpOk(result.available);
  };

  const handleClear = async () => {
    await clearQueue();
    toast('Queue cleared', 'info');
  };

  const handleRetry = async () => {
    await window.localfy.downloadRetryFailed();
    toast('Retrying failed downloads…', 'info');
  };

  // Build a flat list from activeDownloads (live, event-driven)
  const allItems = useMemo(() =>
    Object.entries(activeDownloads).map(([id, d]) => ({
      track_id: id,
      title: d.title,
      artist: d.artist,
      status: d.status,
      progress: d.progress,
    })),
    [activeDownloads]
  );

  // Live stats derived directly from activeDownloads — always accurate
  const liveStats = useMemo(() => ({
    total:       allItems.length || stats.total || 0,
    done:        allItems.filter(i => i.status === 'done').length   || stats.done   || 0,
    queued:      allItems.filter(i => i.status === 'queued').length || stats.queued || 0,
    failed:      allItems.filter(i => i.status === 'failed').length || stats.failed || 0,
    downloading: allItems.filter(i => i.status === 'downloading').length,
  }), [allItems, stats]);

  // Filtered queue
  const queueItems = useMemo(() => {
    if (filter === 'all') return allItems;
    if (filter === 'queued') return allItems.filter(i => i.status === 'queued' || i.status === 'downloading');
    return allItems.filter(i => i.status === filter);
  }, [allItems, filter]);

  const totalPct = liveStats.total > 0 ? ((liveStats.done / liveStats.total) * 100) : 0;

  const statCards = [
    { key: 'all',    value: liveStats.total,       label: 'Total',       color: 'var(--text-2)' },
    { key: 'done',   value: liveStats.done,         label: 'Downloaded',  color: 'var(--green)' },
    { key: 'queued', value: liveStats.queued + liveStats.downloading, label: 'In Queue', color: 'var(--pink)', pulse: liveStats.downloading > 0 },
    { key: 'failed', value: liveStats.failed,       label: 'Failed',      color: 'var(--red)' },
  ];

  return (
    <div style={{ padding: '28px 28px 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, letterSpacing: -0.5, marginBottom: 6 }}>
          Downloads
        </h1>
        <p style={{ color: 'var(--text-2)', fontSize: 13 }}>
          Songs are downloaded using yt-dlp. Files saved to your Music/Localfy folder.
        </p>
      </div>

      {/* yt-dlp banners */}
      {ytDlpOk === false && (
        <div style={{
          padding: '14px 18px', marginBottom: 24,
          background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.25)',
          borderRadius: 'var(--radius)', display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <AlertIcon size={18} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--red)', marginBottom: 4 }}>yt-dlp not found</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>
              Downloads require yt-dlp to be installed. Download it from{' '}
              <span style={{ color: 'var(--pink)', cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => window.localfy.openExternal('https://github.com/yt-dlp/yt-dlp/releases')}>
                github.com/yt-dlp/yt-dlp/releases
              </span>{' '}
              and add it to your system PATH, then restart Localfy.
            </div>
            <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--bg)', padding: '6px 10px', borderRadius: 6, color: 'var(--text-2)' }}>
              winget install yt-dlp
            </div>
          </div>
        </div>
      )}

      {ytDlpOk === true && (
        <div style={{
          padding: '10px 14px', marginBottom: 24,
          background: 'rgba(46,213,115,0.08)', border: '1px solid rgba(46,213,115,0.2)',
          borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 13, color: 'var(--green)',
        }}>
          <CheckIcon size={15} /> yt-dlp is installed and ready
        </div>
      )}

      {/* Stat cards — clickable filters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {statCards.map(card => (
          <StatCard
            key={card.key}
            value={card.value}
            label={card.label}
            color={card.color}
            pulse={card.pulse}
            active={filter === card.key}
            onClick={() => setFilter(f => f === card.key ? 'all' : card.key)}
          />
        ))}
      </div>

      {/* Overall progress bar */}
      {liveStats.total > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7, fontSize: 12.5, color: 'var(--text-2)', fontWeight: 500 }}>
            <span>Overall progress</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {liveStats.done}/{liveStats.total} · {Math.round(totalPct)}%
            </span>
          </div>
          <div className="dl-status-bar" style={{ height: 5 }}>
            <div className="dl-status-fill" style={{ width: `${totalPct}%` }} />
          </div>
        </div>
      )}

      {/* Active queue header */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h2 className="section-title">
            {filter === 'all'    ? 'All Downloads'  :
             filter === 'done'   ? 'Downloaded'     :
             filter === 'queued' ? 'In Queue'       :
             filter === 'failed' ? 'Failed'         : 'Downloads'}
          </h2>
          {filter !== 'all' && (
            <button
              onClick={() => setFilter('all')}
              style={{
                background: 'var(--surface-2)', border: '1px solid var(--border-2)',
                borderRadius: 'var(--radius-pill)', padding: '2px 10px',
                fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-3)',
                cursor: 'pointer', fontWeight: 600,
              }}
            >
              Clear filter ×
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {liveStats.failed > 0 && (
            <button className="btn btn-outline btn-sm" onClick={handleRetry}>
              <RefreshIcon size={13} /> Retry Failed
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={handleClear}>
            <TrashIcon size={13} /> Clear All
          </button>
        </div>
      </div>

      {/* Queue list */}
      {queueItems.length === 0 ? (
        <div className="empty-state" style={{ padding: '40px 32px' }}>
          <DownloadIcon size={48} className="empty-state-icon" />
          <div className="empty-state-title">
            {filter === 'all' ? 'No active downloads' : `No ${filter} downloads`}
          </div>
          <div className="empty-state-sub">
            {filter === 'all'
              ? 'Download songs from Liked Songs, Library, or playlists.'
              : 'Try a different filter.'}
          </div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {queueItems.map((item, i) => (
            <QueueItem
              key={item.track_id}
              item={item}
              divider={i < queueItems.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ value, label, color, pulse, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--surface-2)' : 'var(--surface)',
        border: `1px solid ${active ? color : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '18px 20px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.18s ease',
        boxShadow: active ? `0 0 0 1px ${color}22, 0 4px 20px rgba(0,0,0,0.3)` : 'none',
        outline: 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle colored glow in corner when active */}
      {active && (
        <div style={{
          position: 'absolute', top: 0, right: 0,
          width: 80, height: 80,
          background: `radial-gradient(circle at top right, ${color}18, transparent 70%)`,
          pointerEvents: 'none',
        }} />
      )}
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 38, fontWeight: 800,
        color, lineHeight: 1,
        animation: pulse ? 'pulse 1.5s infinite' : 'none',
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 11, color: active ? color : 'var(--text-3)',
        fontFamily: 'var(--font-mono)', fontWeight: 600,
        letterSpacing: 1, textTransform: 'uppercase', marginTop: 8,
        transition: 'color 0.18s',
      }}>
        {label}
      </div>
    </button>
  );
}

function QueueItem({ item, divider }) {
  const statusColor = s => ({
    done:        'var(--green)',
    failed:      'var(--red)',
    downloading: 'var(--pink)',
    queued:      'var(--text-3)',
  }[s] || 'var(--text-3)');

  const statusLabel = s => ({
    done:        'Done',
    failed:      'Failed',
    downloading: 'Downloading',
    queued:      'Queued',
  }[s] || s);

  return (
    <div
      className="dl-item"
      style={{ borderBottom: divider ? '1px solid var(--border)' : 'none' }}
    >
      {/* Icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 8,
        background: 'var(--surface-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: statusColor(item.status),
        flexShrink: 0,
      }}>
        {item.status === 'done'   && <CheckIcon size={18} />}
        {item.status === 'failed' && <XIcon size={18} />}
        {(item.status === 'queued' || item.status === 'downloading') && <DownloadIcon size={18} />}
      </div>

      {/* Info + progress bar */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.title || 'Unknown'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1, fontWeight: 500 }}>
          <ArtistLinks artist={item.artist} />
        </div>
        {item.status === 'downloading' && (
          <div className="dl-progress-track" style={{ marginTop: 6 }}>
            <div className="dl-progress-fill downloading" style={{ width: `${item.progress || 0}%` }} />
          </div>
        )}
      </div>

      {/* Percentage */}
      <div style={{ textAlign: 'right' }}>
        {item.status === 'downloading' && (
          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--pink)', fontWeight: 700 }}>
            {Math.round(item.progress || 0)}%
          </span>
        )}
      </div>

      {/* Status badge */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          color: statusColor(item.status),
          fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
          letterSpacing: 0.3,
        }}>
          {item.status === 'downloading' && (
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--pink)', animation: 'pulse 1s infinite' }} />
          )}
          {statusLabel(item.status)}
        </div>
      </div>
    </div>
  );
}
