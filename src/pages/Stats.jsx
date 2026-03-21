import React, { useEffect, useState } from 'react';
import ArtistLinks from '../components/ArtistLinks';
import { usePlayerStore, useToastStore } from '../store';

function fmtMs(ms) {
  if (!ms) return '0m';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Generate last N days as YYYY-MM-DD strings
function lastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export default function Stats() {
  const { add: toast } = useToastStore();
  const { playTrack } = usePlayerStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.localfy.dbGetStatsData()
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { toast('Failed to load stats', 'error'); setLoading(false); });
  }, []);

  if (loading) return <div className="page-loading"><div className="spinner" /></div>;

  if (!data || data.totalPlays === 0) {
    return (
      <div style={{ padding: '48px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>No listening data yet</h2>
        <p style={{ color: 'var(--text-3)', fontSize: 14 }}>Start playing music to see your stats appear here.</p>
      </div>
    );
  }

  const days = lastNDays(53 * 7); // ~1 year
  const maxHeat = Math.max(1, ...days.map(d => data.heatmap[d] || 0));

  return (
    <div style={{ padding: '28px 32px 48px', maxWidth: 900 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: 1.5, color: 'var(--pink)', textTransform: 'uppercase', marginBottom: 6 }}>
          Your Stats
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, letterSpacing: -0.5, margin: 0 }}>
          Listening History
        </h1>
      </div>

      {/* Hero stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
        {[
          { label: 'Listening Time', value: fmtMs(data.totalMs), icon: '⏱' },
          { label: 'Total Plays',    value: data.totalPlays.toLocaleString(), icon: '▶' },
          { label: 'Unique Tracks',  value: data.uniqueTracks.toLocaleString(), icon: '🎵' },
          { label: 'Day Streak',     value: `${data.streak}d`, icon: '🔥' },
        ].map(card => (
          <div key={card.label} style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '18px 20px',
          }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{card.icon}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, letterSpacing: -0.5, color: 'var(--text-1)' }}>
              {card.value}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 500, marginTop: 2 }}>
              {card.label}
            </div>
          </div>
        ))}
      </div>

      {/* Heatmap */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 14 }}>Listening Activity</div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {days.map(day => {
            const count = data.heatmap[day] || 0;
            const intensity = count === 0 ? 0 : Math.ceil((count / maxHeat) * 4);
            const colors = ['var(--surface-2)', 'rgba(255,45,120,0.2)', 'rgba(255,45,120,0.4)', 'rgba(255,45,120,0.65)', 'var(--pink)'];
            return (
              <div
                key={day}
                title={`${day}: ${count} plays`}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: colors[intensity],
                  flexShrink: 0,
                  cursor: count > 0 ? 'default' : 'default',
                }}
              />
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>Less</span>
          {[0,1,2,3,4].map(i => (
            <div key={i} style={{ width: 10, height: 10, borderRadius: 2,
              background: ['var(--surface-2)','rgba(255,45,120,0.2)','rgba(255,45,120,0.4)','rgba(255,45,120,0.65)','var(--pink)'][i] }} />
          ))}
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>More</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
        {/* Top Tracks */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 14 }}>Top Tracks</div>
          {data.topTracks.slice(0, 10).map((t, i) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer' }}
              onClick={() => playTrack(t, data.topTracks)}>
              <div style={{ width: 16, textAlign: 'right', fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{i + 1}</div>
              {t.album_art
                ? <img src={t.album_art} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                : <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--surface-2)', flexShrink: 0 }} />
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <ArtistLinks artist={t.artist} />
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--pink)', fontFamily: 'var(--font-mono)', fontWeight: 700, flexShrink: 0 }}>{t.plays}</div>
            </div>
          ))}
        </div>

        {/* Top Artists */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 14 }}>Top Artists</div>
          {data.topArtists.map((a, i) => (
            <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 16, textAlign: 'right', fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <ArtistLinks artist={a.name} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.plays} plays · {fmtMs(a.ms)}</div>
              </div>
              {/* Mini bar */}
              <div style={{ width: 60, height: 4, background: 'var(--surface-2)', borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ width: `${(a.plays / data.topArtists[0].plays) * 100}%`, height: '100%', background: 'var(--pink)', borderRadius: 99 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent plays */}
      {data.recentPlays.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 14 }}>Recent Plays</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.recentPlays.map((h) => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                onClick={() => playTrack(h.track, [h.track])}>
                {h.track.album_art
                  ? <img src={h.track.album_art} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--surface-2)', flexShrink: 0 }} />
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.track.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    <ArtistLinks artist={h.track.artist} />
                  </div>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{fmtDate(h.playedAt)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
