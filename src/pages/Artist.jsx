import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePlayerStore, useToastStore, useDownloadStore } from '../store';
import TrackRow from '../components/TrackRow';
import { PlayIcon, DownloadIcon } from '../components/Icons';
import { SkeletonRows } from '../components/SkeletonPage';

function fmtFollowers(n) {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M followers`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K followers`;
  return `${n} followers`;
}

export default function ArtistPage() {
  const { id: rawId } = useParams();
  const navigate = useNavigate();
  const { playTrack, addToQueue } = usePlayerStore();
  const { add: toast } = useToastStore();
  const { downloadAll } = useDownloadStore();

  const [artist, setArtist] = useState(null);
  const [topTracks, setTopTracks] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queueing, setQueueing] = useState(false);
  const [artistId, setArtistId] = useState(null);

  // Detect if rawId is a Spotify artist ID (22 alphanumeric chars) or a name
  const isSpotifyId = /^[A-Za-z0-9]{22}$/.test(rawId);

  const load = useCallback(async (id) => {
    setLoading(true);
    try {
      // Use allSettled so a deprecated endpoint (e.g. related-artists) can't crash the whole page
      const [artistRes, topRes, albumRes, relatedRes] = await Promise.allSettled([
        window.localfy.spotifyGetArtist(id),
        window.localfy.spotifyGetArtistTopTracks(id),
        window.localfy.spotifyGetArtistAlbums(id),
        window.localfy.spotifyGetRelatedArtists(id),
      ]);
      const artistData  = artistRes.status  === 'fulfilled' ? artistRes.value  : null;
      const topData     = topRes.status     === 'fulfilled' ? topRes.value     : null;
      const albumData   = albumRes.status   === 'fulfilled' ? albumRes.value   : null;
      const relatedData = relatedRes.status === 'fulfilled' ? relatedRes.value : null;
      if (!artistData) { toast('Artist not found', 'error'); setLoading(false); return; }
      setArtist(artistData);
      setTopTracks(topData?.tracks || []);
      setAlbums(albumData?.items || []);
      setRelated((relatedData?.artists || []).slice(0, 8));
    } catch (e) {
      toast('Failed to load artist', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSpotifyId) {
      setArtistId(rawId);
      load(rawId);
    } else {
      // Name-based lookup: search for artist
      const name = decodeURIComponent(rawId);
      window.localfy.spotifySearch(`artist:"${name}"`)
        .then(data => {
          const found = data?.artists?.items?.[0];
          if (found) {
            setArtistId(found.id);
            load(found.id);
          } else {
            toast(`Artist "${name}" not found`, 'error');
            setLoading(false);
          }
        })
        .catch(() => {
          toast('Search failed', 'error');
          setLoading(false);
        });
    }
  }, [rawId]);

  // Map a Spotify track object to the shape TrackRow expects
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

  const mappedTracks = topTracks.map(mapTrack);

  const handlePlayAll = () => {
    if (!mappedTracks.length) return;
    playTrack(mappedTracks[0], mappedTracks);
  };

  const handleAddDiscography = async () => {
    if (queueing) return;
    setQueueing(true);
    try {
      // Fetch all album tracks and add to queue
      const allTracks = [];

      // Start with top tracks
      allTracks.push(...mappedTracks);

      // Then album tracks (first 5 albums max to avoid spam)
      const albumsToFetch = albums.slice(0, 5);
      await Promise.all(albumsToFetch.map(async (album) => {
        try {
          const data = await window.localfy.spotifyGetAlbumTracks(album.id);
          const tracks = (data?.items || []).map(t => ({
            id: t.id,
            spotify_id: t.id,
            title: t.name,
            artist: t.artists?.map(a => a.name).join(', ') || '',
            artist_ids: t.artists?.map(a => a.id) || [],
            album: album.name,
            album_art: album.images?.[0]?.url || '',
            duration_ms: t.duration_ms,
          }));
          allTracks.push(...tracks);
        } catch {}
      }));

      // Deduplicate by spotify_id
      const seen = new Set();
      const unique = allTracks.filter(t => {
        if (seen.has(t.spotify_id)) return false;
        seen.add(t.spotify_id);
        return true;
      });

      addToQueue(unique);
      toast(`Added ${unique.length} tracks to queue`, 'success');
    } catch (e) {
      toast('Failed to load discography', 'error');
    } finally {
      setQueueing(false);
    }
  };

  const handleDownloadTopTracks = async () => {
    if (!mappedTracks.length) return;
    await downloadAll(mappedTracks);
    toast(`Queued ${mappedTracks.length} tracks for download`, 'info');
  };

  if (loading) {
    return (
      <div style={{ padding: '28px 32px 48px' }}>
        <SkeletonRows />
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="page-empty">
        <p>Artist not found.</p>
      </div>
    );
  }

  const heroImg = artist.images?.[0]?.url;
  const genre = artist.genres?.[0];

  return (
    <div className="artist-page">
      {/* Hero */}
      <div className="artist-hero" style={heroImg ? { '--hero-img': `url(${heroImg})` } : {}}>
        <div className="artist-hero-overlay" />
        {heroImg && <img src={heroImg} alt={artist.name} className="artist-hero-bg" />}
        <div className="artist-hero-content">
          <div className="artist-avatar-wrap">
            {heroImg
              ? <img src={heroImg} alt={artist.name} className="artist-avatar" />
              : <div className="artist-avatar artist-avatar-placeholder">{artist.name[0]}</div>
            }
          </div>
          <div className="artist-hero-text">
            {genre && <div className="artist-genre">{genre}</div>}
            <h1 className="artist-name">{artist.name}</h1>
            {artist.followers?.total != null && (
              <div className="artist-followers">{fmtFollowers(artist.followers.total)}</div>
            )}
            <div className="artist-actions">
              <button className="btn btn-primary" onClick={handlePlayAll} disabled={!mappedTracks.length}>
                <PlayIcon size={14} /> Play Top Tracks
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleAddDiscography}
                disabled={queueing}
              >
                {queueing ? 'Loading…' : '+ Add Discography to Queue'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={handleDownloadTopTracks} title="Download top tracks">
                <DownloadIcon size={14} /> Download Top Tracks
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="artist-body">
        {/* Top Tracks */}
        {mappedTracks.length > 0 && (
          <section className="artist-section">
            <h2 className="section-title">Popular</h2>
            <div className="track-list">
              <div className="track-list-header">
                <div></div><div></div>
                <div className="track-num">#</div>
                <div className="track-info">Title</div>
                <div className="track-album">Album</div>
                <div className="track-duration">Time</div>
                <div className="track-actions" />
              </div>
              {mappedTracks.map((t, i) => (
                <TrackRow key={t.id} track={t} index={i} queue={mappedTracks} showAlbum={true} />
              ))}
            </div>
          </section>
        )}

        {/* Discography */}
        {albums.length > 0 && (
          <section className="artist-section">
            <h2 className="section-title">Discography</h2>
            <div className="cards-grid">
              {albums.map(album => (
                <div key={album.id} className="card card-sm">
                  {album.images?.[0]?.url
                    ? <img src={album.images[0].url} alt={album.name} className="card-img" />
                    : <div className="card-img card-img-placeholder" />
                  }
                  <div className="card-title">{album.name}</div>
                  <div className="card-sub">
                    {album.album_type === 'single' ? 'Single' : 'Album'} · {album.release_date?.slice(0, 4)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Related Artists */}
        {related.length > 0 && (
          <section className="artist-section">
            <h2 className="section-title">Fans Also Like</h2>
            <div className="cards-grid">
              {related.map(a => (
                <div
                  key={a.id}
                  className="card card-sm card-artist"
                  onClick={() => navigate(`/artist/${a.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  {a.images?.[0]?.url
                    ? <img src={a.images[0].url} alt={a.name} className="card-img card-img-round" />
                    : <div className="card-img card-img-round card-img-placeholder">{a.name[0]}</div>
                  }
                  <div className="card-title">{a.name}</div>
                  <div className="card-sub">Artist</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
