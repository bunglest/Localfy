import React, { useEffect, useState, useCallback } from 'react';
import { usePlayerStore, useDownloadStore, useToastStore, useLibraryStore } from '../store';
import { SkeletonGrid } from '../components/SkeletonPage';

function fmtMs(ms) {
  if (!ms) return '--:--';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

const TABS = [
  { key: 'forYou',       label: 'For You',       desc: 'Picked based on your audio taste profile' },
  { key: 'deepCuts',     label: 'Deep Cuts',     desc: 'Hidden gems from artists you love' },
  { key: 'newArtists',   label: 'New Artists',    desc: 'Artists similar to your favorites' },
  { key: 'moodMatch',    label: 'Mood Match',    desc: 'Matches your current vibe' },
  { key: 'releaseRadar', label: 'New Releases',  desc: 'New releases from your favorite artists' },
  { key: 'rediscovery',  label: 'Rediscover',    desc: 'Forgotten favorites worth revisiting' },
  { key: 'exploration',  label: 'Explore',       desc: 'Tracks outside your comfort zone' },
];

const EMPTY_STATES = {
  forYou:       { icon: '\u{1F3AF}', text: 'Listen to more music to build your taste profile' },
  deepCuts:     { icon: '\u{1F48E}', text: 'Import your liked songs to discover deep cuts' },
  newArtists:   { icon: '\u{1F30D}', text: 'Play more music so we can find similar artists' },
  moodMatch:    { icon: '\u{1F319}', text: 'Start a listening session to match your mood' },
  releaseRadar: { icon: '\u{1F4BF}', text: 'Check back soon for new music from your favorite artists' },
  rediscovery:  { icon: '\u{1F504}', text: 'Keep listening \u2014 we\'ll remind you of forgotten favorites' },
  exploration:  { icon: '\u{1F9ED}', text: 'Building your profile to find something different' },
};

const TASTE_BARS = [
  { key: 'energy',        label: 'Energy' },
  { key: 'danceability',  label: 'Danceability' },
  { key: 'valence',       label: 'Mood' },
  { key: 'acousticness',  label: 'Acoustic' },
  { key: 'tempo',         label: 'Tempo' },
];

function getTasteLabel(key, value) {
  if (key === 'energy')       return value > 0.6 ? 'High Energy' : value > 0.35 ? 'Moderate' : 'Chill';
  if (key === 'danceability') return value > 0.6 ? 'Groovy' : value > 0.35 ? 'Moderate' : 'Laid Back';
  if (key === 'valence')      return value > 0.6 ? 'Upbeat' : value > 0.35 ? 'Balanced' : 'Melancholy';
  if (key === 'acousticness') return value > 0.6 ? 'Acoustic' : value > 0.35 ? 'Mixed' : 'Electronic';
  if (key === 'tempo')        return value > 0.6 ? 'Fast' : value > 0.35 ? 'Mid-tempo' : 'Slow';
  return '';
}

function normalizeTasteValue(key, profile) {
  const entry = profile[key];
  if (!entry) return 0;
  const raw = entry.mean ?? 0;
  if (key === 'tempo') return Math.min(raw / 200, 1);
  return Math.min(raw, 1);
}

export default function Discover() {
  const { playTrack } = usePlayerStore();
  const { downloadTrack } = useDownloadStore();
  const { toggleLike, liked } = useLibraryStore();
  const { add: toast } = useToastStore();

  const [allTracks, setAllTracks] = useState([]);
  const [forYou, setForYou] = useState([]);
  const [deepCuts, setDeepCuts] = useState([]);
  const [newArtists, setNewArtists] = useState([]);
  const [moodMatch, setMoodMatch] = useState([]);
  const [releaseRadar, setReleaseRadar] = useState([]);
  const [rediscovery, setRediscovery] = useState([]);
  const [exploration, setExploration] = useState([]);
  const [feedbackStats, setFeedbackStats] = useState(null);
  const [tasteProfile, setTasteProfile] = useState(null);
  const [seeds, setSeeds] = useState({ artists: [], tracks: [] });
  const [loading, setLoading] = useState(true);
  const [savedIds, setSavedIds] = useState(new Set());
  const [activeTab, setActiveTab] = useState('forYou');
  const [showTasteProfile, setShowTasteProfile] = useState(true);
  const [isSmartMode, setIsSmartMode] = useState(false);
  const [showFeedbackStats, setShowFeedbackStats] = useState(true);

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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Try new smart recommendations first
      if (typeof window.localfy.getSmartRecommendations === 'function') {
        const data = await window.localfy.getSmartRecommendations();
        setAllTracks(data.tracks || []);
        setForYou(data.forYou || []);
        setDeepCuts(data.deepCuts || []);
        setNewArtists(data.newArtists || []);
        setMoodMatch(data.moodMatch || []);
        setReleaseRadar(data.releaseRadar || []);
        setRediscovery(data.rediscovery || []);
        setExploration(data.exploration || []);
        setFeedbackStats(data.feedbackStats || null);
        setTasteProfile(data.tasteProfile || null);
        setSeeds(data.seeds || { artists: [], tracks: [] });
        setIsSmartMode(true);
        return;
      }
    } catch (e) {
      // Smart recommendations failed — fall through to legacy
    }

    // Fallback to legacy discover
    try {
      const data = await window.localfy.spotifyGetDiscoverTracks();
      const tracks = data.tracks || [];
      setAllTracks(tracks);
      setForYou(tracks);
      setDeepCuts([]);
      setNewArtists([]);
      setMoodMatch([]);
      setTasteProfile(null);
      setSeeds(data.seeds || { artists: [], tracks: [] });
      setIsSmartMode(false);
    } catch (e) {
      toast('Failed to load recommendations', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Ensure loading clears on smart path too
  const loadWrapper = useCallback(async () => {
    await load();
    setLoading(false);
  }, [load]);

  useEffect(() => { loadWrapper(); }, []);

  const handleSave = async (t) => {
    const mapped = mapTrack(t);
    await toggleLike(mapped);
    if (t._strategy) window.localfy.dbRecordRecFeedback(t.id, 'saved', t._strategy).catch(() => {});
    setSavedIds(s => { const n = new Set(s); n.add(t.id); return n; });
    toast('Saved to Liked Songs', 'success');
  };

  const handleDownload = async (t) => {
    const mapped = mapTrack(t);
    const result = await downloadTrack(mapped);
    if (t._strategy) window.localfy.dbRecordRecFeedback(t.id, 'downloaded', t._strategy).catch(() => {});
    if (result?.alreadyDownloaded) toast('Already downloaded', 'info');
    else if (result?.duplicate) toast(`Already queued: ${t.name}`, 'info');
    else if (result?.queued) toast(`Queued: ${t.name}`, 'info');
  };

  const handlePlayAll = () => {
    if (!allTracks.length) return;
    const mapped = allTracks.map(mapTrack);
    playTrack(mapped[0], mapped);
  };

  const tabData = { forYou, deepCuts, newArtists, moodMatch, releaseRadar, rediscovery, exploration };
  const currentTracks = tabData[activeTab] || [];
  const currentTab = TABS.find(t => t.key === activeTab);

  if (loading) return <div style={{ padding: '28px 32px 48px' }}><SkeletonGrid /></div>;

  return (
    <div style={{ padding: '28px 32px 48px' }}>
      {/* ─── Header ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700,
          letterSpacing: 1.5, color: 'var(--pink)', textTransform: 'uppercase', marginBottom: 6,
        }}>
          Personalised For You
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800,
          letterSpacing: -0.5, margin: '0 0 4px',
        }}>
          Discover
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '0 0 18px' }}>
          Your personal recommendation engine
        </p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button className="btn btn-primary" onClick={handlePlayAll} disabled={!allTracks.length}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Play All
          </button>
          <button className="btn btn-ghost btn-sm" onClick={loadWrapper} disabled={loading}>
            &#x21BB; Refresh
          </button>
        </div>
      </div>

      {/* ─── Taste Profile ───────────────────────────────────── */}
      {tasteProfile && (
        <div className="taste-profile-card">
          <div
            className="taste-profile-header"
            style={{ cursor: 'pointer' }}
            onClick={() => setShowTasteProfile(p => !p)}
          >
            <h4>Your Taste Profile</h4>
            <span style={{
              fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)',
              userSelect: 'none',
            }}>
              {showTasteProfile ? '\u25B2' : '\u25BC'}
            </span>
          </div>
          {showTasteProfile && (
            <div>
              {TASTE_BARS.map(({ key, label }) => {
                const value = normalizeTasteValue(key, tasteProfile);
                const pct = Math.round(value * 100);
                return (
                  <div className="taste-bar" key={key}>
                    <span className="taste-bar-label">{label}</span>
                    <div className="taste-bar-track">
                      <div
                        className="taste-bar-fill"
                        style={{
                          width: `${pct}%`,
                          background: value > 0.6
                            ? 'linear-gradient(90deg, var(--pink-soft), var(--pink))'
                            : 'linear-gradient(90deg, #4a6cf7, #6b8cff)',
                        }}
                      />
                    </div>
                    <span className="taste-bar-value">
                      {getTasteLabel(key, value)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Feedback Stats ────────────────────────────────────── */}
      {feedbackStats && (
        <div className="feedback-stats-card">
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => setShowFeedbackStats(p => !p)}
          >
            <h4 style={{ margin: showFeedbackStats ? undefined : 0 }}>Your Discovery Stats</h4>
            <span style={{
              fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)',
              userSelect: 'none',
            }}>
              {showFeedbackStats ? '\u25B2' : '\u25BC'}
            </span>
          </div>
          {showFeedbackStats && (
            <div>
              <div className="feedback-stat-row">
                <span>Recommendations seen</span>
                <span className="feedback-stat-value">{feedbackStats.totalSeen ?? 0}</span>
              </div>
              <div className="feedback-stat-row">
                <span>Conversion rate</span>
                <span className="feedback-stat-value">
                  {feedbackStats.totalSeen > 0
                    ? `${Math.round(((feedbackStats.played || 0) + (feedbackStats.saved || 0) + (feedbackStats.downloaded || 0)) / feedbackStats.totalSeen * 100)}%`
                    : '0%'}
                </span>
              </div>
              {feedbackStats.bestStrategy && (
                <div className="feedback-stat-row">
                  <span>Best strategy</span>
                  <span className="feedback-stat-value">{feedbackStats.bestStrategy}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Tabs ────────────────────────────────────────────── */}
      <div className="discover-tabs">
        {TABS.map(tab => {
          const count = (tabData[tab.key] || []).length;
          return (
            <button
              key={tab.key}
              className={`discover-tab${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}{count > 0 ? ` (${count})` : ''}
            </button>
          );
        })}
      </div>

      {/* ─── Section header ──────────────────────────────────── */}
      <div className="discover-section-header">
        <h2>{currentTab.label}</h2>
      </div>
      <p className="discover-section-desc">{currentTab.desc}</p>

      {/* ─── Track Grid / Empty State ────────────────────────── */}
      {currentTracks.length === 0 ? (
        <div className="discover-empty">
          <div className="discover-empty-icon">{EMPTY_STATES[activeTab].icon}</div>
          <p>{EMPTY_STATES[activeTab].text}</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 14,
        }}>
          {currentTracks.map(t => {
            const isSaved = savedIds.has(t.id) || liked.some(l => l.spotify_id === t.id);
            return (
              <div
                key={t.id}
                className="discover-card"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  overflow: 'hidden',
                  transition: 'background 0.15s, transform 0.15s',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  if (t._strategy) window.localfy.dbRecordRecFeedback(t.id, 'played', t._strategy).catch(() => {});
                  playTrack(mapTrack(t), allTracks.map(mapTrack));
                }}
              >
                {/* Album art */}
                <div style={{ position: 'relative' }}>
                  {t.album?.images?.[0]?.url
                    ? <img src={t.album.images[0].url} alt="" style={{ width: '100%', aspectRatio: 1, objectFit: 'cover', display: 'block' }} />
                    : <div style={{ width: '100%', aspectRatio: 1, background: 'var(--surface-2)' }} />
                  }
                  {/* Duration badge */}
                  <span style={{
                    position: 'absolute', bottom: 6, right: 6,
                    background: 'rgba(0,0,0,0.7)', color: '#fff',
                    fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600,
                    padding: '2px 6px', borderRadius: 4,
                  }}>
                    {fmtMs(t.duration_ms)}
                  </span>
                  {/* Play overlay */}
                  <div
                    className="discover-card-overlay"
                    style={{
                      position: 'absolute', inset: 0,
                      background: 'rgba(8,8,16,0.5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: 0, transition: 'opacity 0.15s',
                    }}
                  >
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

                {/* Card body */}
                <div style={{ padding: '10px 12px 12px' }}>
                  {/* Reason label */}
                  {t._reason && (
                    <div className="discover-reason">{t._reason}</div>
                  )}
                  <div style={{
                    fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2,
                  }}>
                    {t.name}
                  </div>
                  <div style={{
                    fontSize: 11, color: 'var(--text-3)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 10,
                  }}>
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
                      {isSaved ? '\u2665 Saved' : '\u2661 Save'}
                    </button>
                    {activeTab === 'rediscovery' ? (
                      <button
                        style={{
                          padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)',
                          background: 'var(--surface-2)', color: 'var(--text-2)',
                          fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
                          transition: 'all 0.15s',
                        }}
                        onClick={e => {
                          e.stopPropagation();
                          if (t._strategy) window.localfy.dbRecordRecFeedback(t.id, 'played', t._strategy).catch(() => {});
                          playTrack(mapTrack(t), currentTracks.map(mapTrack));
                        }}
                        title="Play"
                      >
                        &#x25B6;
                      </button>
                    ) : (
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
                        &#x2193;
                      </button>
                    )}
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
