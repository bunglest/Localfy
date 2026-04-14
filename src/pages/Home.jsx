import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, usePlayerStore, useDownloadStore, useToastStore } from '../store';
import { PlayIcon, DownloadIcon, MusicIcon } from '../components/Icons';
import ArtistLinks from '../components/ArtistLinks';

function toLocalfy(track) {
  return {
    id: track.id,
    spotify_id: track.id,
    title: track.name,
    artist: track.artists?.map(a => a.name).join(', ') || '',
    artist_ids: track.artists?.map(a => a.id) || [],
    album: track.album?.name || '',
    album_art: track.album?.images?.[0]?.url || '',
    duration_ms: track.duration_ms,
  };
}

function fmtMs(ms) {
  if (!ms) return '';
  const m = Math.floor(ms / 1000 / 60);
  const s = Math.floor((ms / 1000) % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function Home() {
  const { user } = useAuthStore();
  const { playTrack } = usePlayerStore();
  const { downloadTrack, stats } = useDownloadStore();
  const { add: toast } = useToastStore();
  const navigate = useNavigate();

  const [topTracks, setTopTracks] = useState([]);
  const [recentTracks, setRecentTracks] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [newReleases, setNewReleases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      window.localfy.spotifyGetRecommendations(),
      window.localfy.spotifyGetRecentlyPlayed(),
      window.localfy.spotifyGetFeatured(),
      window.localfy.spotifyGetNewReleases(),
    ]).then(([topR, recentR, featuredR, newR]) => {
      if (!alive) return;
      if (topR.status === 'fulfilled') setTopTracks(topR.value?.tracks?.slice(0, 20) || []);
      if (recentR.status === 'fulfilled') setRecentTracks(recentR.value?.tracks?.slice(0, 12) || []);
      if (featuredR.status === 'fulfilled') setPlaylists(featuredR.value?.playlists?.items?.slice(0, 8) || []);
      if (newR.status === 'fulfilled') setNewReleases(newR.value?.albums?.items?.slice(0, 10) || []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name = user?.display_name?.split(' ')[0] || '';
  const heroTrack = recentTracks[0] || topTracks[0];
  const queueCount = stats.active || ((stats.queued || 0) + (stats.running || 0));
  const savedCount = stats.completed || stats.done || 0;
  const trackedMinutes = Math.round((topTracks.slice(0, 8).reduce((sum, track) => sum + (track.duration_ms || 0), 0) || 0) / 60000);

  const dashboardStats = [
    { label: 'Top tracks', value: topTracks.length || '--', detail: 'ranked from Spotify signals' },
    { label: 'Recent plays', value: recentTracks.length || '--', detail: 'ready to resume instantly' },
    { label: 'Queued', value: queueCount, detail: 'downloads in flight' },
    { label: 'Saved', value: savedCount, detail: 'available offline' },
    { label: 'Tracked min', value: trackedMinutes || '--', detail: 'from current top rotation' },
    { label: 'Playlists', value: playlists.length || '--', detail: 'featured for quick jumps' },
  ];

  const mixDeck = [
    { title: 'Late Circuit', detail: 'Colder synth edges and motion-heavy hooks' },
    { title: 'Sharp Focus', detail: 'Cleaner cuts for work, reading, and long sessions' },
    { title: 'Afterglow', detail: 'Warmer choruses, softer pacing, less interruption' },
    { title: 'Lift Off', detail: 'Higher tempo picks when the queue needs momentum' },
  ];

  const handleDownload = async (e, track) => {
    e.stopPropagation();
    const result = await downloadTrack(toLocalfy(track));
    if (result?.alreadyDownloaded) toast('Already downloaded', 'info');
    else if (result?.duplicate) toast(`Already queued: ${track.name}`, 'info');
    else if (result?.queued) toast(`Queued: ${track.name}`, 'info');
  };

  if (loading) return <SkeletonHome />;

  return (
    <div className="home-page dashboard-home">
      <section className="home-command-deck">
        <div className="home-command-main">
          <div className="home-command-kicker">Listening cockpit</div>
          <h1 className="home-command-title">{greeting}{name ? `, ${name}` : ''}.</h1>
          <p className="home-command-sub">
            A calmer control surface for downloads, replay, and music discovery with less noise between decisions.
          </p>
          <div className="home-command-actions">
            {topTracks.length > 0 && (
              <button
                className="btn btn-primary"
                onClick={() => playTrack(toLocalfy(topTracks[0]), topTracks.map(toLocalfy))}
              >
                <PlayIcon size={14} /> Start Top Rotation
              </button>
            )}
            <button className="btn btn-outline" onClick={() => navigate('/discover')}>
              Open discovery stream
            </button>
          </div>

          <div className="home-signal-grid">
            {dashboardStats.map((item) => (
              <div key={item.label} className="home-signal-card">
                <span className="home-signal-label">{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="home-command-side">
          {heroTrack ? (
            <div className="home-spotlight" onClick={() => playTrack(toLocalfy(heroTrack), (recentTracks.length ? recentTracks : topTracks).map(toLocalfy))}>
              <div className="home-spotlight-media">
                {heroTrack.album?.images?.[0]?.url
                  ? <img src={heroTrack.album.images[0].url} alt="" className="home-spotlight-art" />
                  : <div className="home-spotlight-art home-spotlight-art-placeholder"><MusicIcon size={28} /></div>}
                <button className="home-spotlight-play">
                  <PlayIcon size={16} />
                </button>
              </div>
              <div className="home-spotlight-copy">
                <span className="home-spotlight-kicker">Spotlight</span>
                <h2>{heroTrack.name}</h2>
                <div className="home-spotlight-artist">
                  <ArtistLinks
                    artist={heroTrack.artists?.map(a => a.name).join(', ')}
                    artistIds={heroTrack.artists?.map(a => a.id)}
                  />
                </div>
                <div className="home-spotlight-meta">
                  <span>{heroTrack.album?.name || 'Spotify'}</span>
                  <span>{fmtMs(heroTrack.duration_ms)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="home-spotlight home-spotlight-empty">
              <MusicIcon size={30} />
              <div>
                <strong>No signal yet</strong>
                <small>Start listening on Spotify to populate the deck.</small>
              </div>
            </div>
          )}

          {recentTracks.length > 0 && (
            <div className="home-mini-list">
              <div className="home-mini-list-header">
                <span>Recent movement</span>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/liked')}>Liked songs</button>
              </div>
              {recentTracks.slice(0, 3).map((track) => (
                <div
                  key={track.id}
                  className="home-mini-item"
                  onClick={() => playTrack(toLocalfy(track), recentTracks.map(toLocalfy))}
                >
                  {track.album?.images?.[0]?.url
                    ? <img src={track.album.images[0].url} alt="" className="home-mini-art" />
                    : <div className="home-mini-art home-mini-art-placeholder"><MusicIcon size={14} /></div>}
                  <div className="home-mini-copy">
                    <strong>{track.name}</strong>
                    <span>{track.artists?.map(a => a.name).join(', ')}</span>
                  </div>
                  <span className="home-mini-duration">{fmtMs(track.duration_ms)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="home-dashboard-grid">
        <div className="home-panel home-panel-wide">
          <div className="home-panel-header">
            <div>
              <h2 className="home-panel-title">Continue listening</h2>
              <p className="home-panel-copy">The quickest re-entry points from your recent activity.</p>
            </div>
          </div>
          {recentTracks.length > 0 ? (
            <HScrollRow>
              {recentTracks.map(track => (
                <RecentCard
                  key={track.id}
                  track={track}
                  onPlay={() => playTrack(toLocalfy(track), recentTracks.map(toLocalfy))}
                  onDownload={e => handleDownload(e, track)}
                />
              ))}
            </HScrollRow>
          ) : (
            <div className="home-empty-panel">No recent playback yet.</div>
          )}
        </div>

        <div className="home-panel home-panel-compact">
          <div className="home-panel-header">
            <div>
              <h2 className="home-panel-title">Mix presets</h2>
              <p className="home-panel-copy">Directional moods for your next discovery run.</p>
            </div>
          </div>
          <div className="home-mix-list">
            {mixDeck.map((mix, index) => (
              <button key={mix.title} className="home-mix-item" onClick={() => navigate('/discover')}>
                <span className="home-mix-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="home-mix-copy">
                  <strong>{mix.title}</strong>
                  <small>{mix.detail}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="home-analysis-grid">
        <div className="home-panel">
          <div className="home-panel-header">
            <div>
              <h2 className="home-panel-title">Top tracks</h2>
              <p className="home-panel-copy">Your strongest signals in the current listening window.</p>
            </div>
            {topTracks.length > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => playTrack(toLocalfy(topTracks[0]), topTracks.map(toLocalfy))}
              >
                <PlayIcon size={12} /> Play all
              </button>
            )}
          </div>
          {topTracks.length > 0 ? (
            <div className="top-tracks-grid">
              {topTracks.slice(0, 10).map((track, i) => (
                <TopTrackRow
                  key={track.id}
                  track={track}
                  rank={i + 1}
                  onPlay={() => playTrack(toLocalfy(track), topTracks.map(toLocalfy))}
                  onDownload={e => handleDownload(e, track)}
                />
              ))}
            </div>
          ) : (
            <div className="home-empty-panel">Top tracks will appear here after Spotify has enough recent activity.</div>
          )}
        </div>

        <div className="home-panel">
          <div className="home-panel-header">
            <div>
              <h2 className="home-panel-title">New releases</h2>
              <p className="home-panel-copy">Fresh arrivals worth checking before they disappear into the feed.</p>
            </div>
          </div>
          {newReleases.length > 0 ? (
            <div className="home-release-grid">
              {newReleases.slice(0, 6).map(album => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  onClick={() => window.localfy.openExternal(album.external_urls?.spotify || '')}
                />
              ))}
            </div>
          ) : (
            <div className="home-empty-panel">No fresh releases loaded.</div>
          )}
        </div>
      </section>

      <section className="home-panel home-playlist-panel">
        <div className="home-panel-header">
          <div>
            <h2 className="home-panel-title">Featured playlists</h2>
            <p className="home-panel-copy">Direct paths into the sets Spotify is pushing right now.</p>
          </div>
          {playlists.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/library')}>
              Library
            </button>
          )}
        </div>

        {playlists.length > 0 ? (
          <div className="playlists-grid">
            {playlists.map(pl => (
              <PlaylistTile
                key={pl.id}
                pl={pl}
                onClick={() => window.localfy.openExternal(pl.external_urls?.spotify || '')}
              />
            ))}
          </div>
        ) : (
          <div className="home-empty-panel">Featured playlists will show up once Spotify responds.</div>
        )}
      </section>
    </div>
  );
}

function HScrollRow({ children }) {
  const ref = useRef(null);
  const onWheel = e => {
    if (!ref.current) return;
    e.preventDefault();
    ref.current.scrollLeft += e.deltaY * 0.8;
  };
  return (
    <div ref={ref} className="hscroll-row" onWheel={onWheel}>
      {children}
    </div>
  );
}

function RecentCard({ track, onPlay, onDownload }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="recent-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onPlay}
    >
      <div className="recent-card-art-wrap">
        {track.album?.images?.[0]?.url
          ? <img src={track.album.images[0].url} alt="" className="recent-card-art" />
          : <div className="recent-card-art recent-card-art-placeholder"><MusicIcon size={24} /></div>
        }
        <div className={`recent-card-overlay${hover ? ' visible' : ''}`}>
          <button className="recent-card-play-btn" onClick={e => { e.stopPropagation(); onPlay(); }}>
            <PlayIcon size={16} />
          </button>
          <button className="recent-card-dl-btn" onClick={onDownload} title="Download">
            <DownloadIcon size={13} />
          </button>
        </div>
      </div>
      <div className="recent-card-info">
        <div className="recent-card-title">{track.name}</div>
        <div className="recent-card-artist">
          <ArtistLinks
            artist={track.artists?.map(a => a.name).join(', ')}
            artistIds={track.artists?.map(a => a.id)}
          />
        </div>
      </div>
    </div>
  );
}

function TopTrackRow({ track, rank, onPlay, onDownload }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className={`top-track-row${hover ? ' hovered' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onPlay}
    >
      <div className="top-track-rank">
        {hover
          ? <PlayIcon size={13} style={{ color: 'var(--pink)' }} />
          : <span>{rank}</span>
        }
      </div>
      <img src={track.album?.images?.[0]?.url} alt="" className="top-track-art" />
      <div className="top-track-info">
        <div className="top-track-title">{track.name}</div>
        <div className="top-track-artist">
          <ArtistLinks
            artist={track.artists?.map(a => a.name).join(', ')}
            artistIds={track.artists?.map(a => a.id)}
          />
        </div>
      </div>
      <div className="top-track-duration">{fmtMs(track.duration_ms)}</div>
      <button
        className={`top-track-dl${hover ? ' visible' : ''}`}
        onClick={onDownload}
        title="Download"
      >
        <DownloadIcon size={13} />
      </button>
    </div>
  );
}

function AlbumCard({ album, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="album-card"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      <div className="album-card-art-wrap">
        {album.images?.[0]?.url
          ? <img src={album.images[0].url} alt="" className="album-card-art" />
          : <div className="album-card-art album-card-art-placeholder" />
        }
        {hover && (
          <div className="album-card-overlay">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </div>
        )}
      </div>
      <div className="album-card-info">
        <div className="album-card-title">{album.name}</div>
        <div className="album-card-sub">
          <ArtistLinks
            artist={album.artists?.map(a => a.name).join(', ')}
            artistIds={album.artists?.map(a => a.id)}
          />
          {album.release_date && <> · {album.release_date.slice(0, 4)}</>}
        </div>
      </div>
    </div>
  );
}

function PlaylistTile({ pl, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className={`playlist-tile${hover ? ' hovered' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
    >
      {pl.images?.[0]?.url
        ? <img src={pl.images[0].url} alt="" className="playlist-tile-art" />
        : <div className="playlist-tile-art playlist-tile-art-placeholder"><MusicIcon size={20} /></div>
      }
      <div className="playlist-tile-info">
        <div className="playlist-tile-name">{pl.name}</div>
        <div className="playlist-tile-sub">
          {pl.tracks?.total != null ? `${pl.tracks.total} songs` : 'Playlist'}
        </div>
      </div>
      {hover && (
        <div className="playlist-tile-arrow">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </div>
      )}
    </div>
  );
}

function SkeletonHome() {
  return (
    <div className="home-page dashboard-home">
      <div className="home-command-deck home-command-deck-skeleton">
        <div className="home-command-main">
          <div className="skeleton" style={{ height: 14, width: 110, borderRadius: 999, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 52, width: '62%', borderRadius: 18, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 18, width: '55%', borderRadius: 8, marginBottom: 24 }} />
          <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
            <div className="skeleton" style={{ height: 42, width: 170, borderRadius: 999 }} />
            <div className="skeleton" style={{ height: 42, width: 150, borderRadius: 999 }} />
          </div>
          <div className="home-signal-grid">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 110, borderRadius: 18 }} />
            ))}
          </div>
        </div>
        <div className="home-command-side">
          <div className="skeleton" style={{ height: 290, borderRadius: 24 }} />
        </div>
      </div>
    </div>
  );
}
