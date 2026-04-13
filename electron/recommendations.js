/**
 * Localfy Smart Recommendation Engine
 *
 * Builds a taste profile from play history and audio features, then runs
 * four parallel strategies to surface personalised recommendations:
 *   1. Audio-feature-targeted recommendations
 *   2. Deep cuts from favourite artists
 *   3. Related artist exploration
 *   4. Mood match (current session)
 */

// ─── In-memory audio-feature cache (persists for the Electron session) ───────
const audioFeaturesCache = new Map();

// ─── Audio-feature dimensions we care about ──────────────────────────────────
const DIMENSIONS = [
  'danceability', 'energy', 'valence',
  'acousticness', 'instrumentalness', 'speechiness', 'tempo',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetch audio features for an array of Spotify track IDs.
 * Batches into groups of 100, caches results.
 */
async function fetchAudioFeatures(ids, spotifyFetch) {
  const uncached = ids.filter(id => !audioFeaturesCache.has(id));

  for (let i = 0; i < uncached.length; i += 100) {
    const batch = uncached.slice(i, i + 100);
    try {
      const data = await spotifyFetch(`/audio-features?ids=${batch.join(',')}`);
      for (const af of (data.audio_features || [])) {
        if (af && af.id) audioFeaturesCache.set(af.id, af);
      }
    } catch (err) {
      console.warn('[recommendations] audio-features batch failed:', err.message);
    }
  }

  const result = {};
  for (const id of ids) {
    if (audioFeaturesCache.has(id)) result[id] = audioFeaturesCache.get(id);
  }
  return result;
}

/**
 * Compute mean and standard deviation for each audio dimension.
 */
function buildProfile(featuresList) {
  const profile = {};
  for (const dim of DIMENSIONS) {
    const vals = featuresList.map(f => f[dim]).filter(v => v != null);
    if (vals.length === 0) { profile[dim] = { mean: 0.5, std: 0.15 }; continue; }
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
    profile[dim] = { mean, std: Math.sqrt(variance) };
  }
  return profile;
}

/**
 * Compute weighted mean and std for each audio dimension.
 * weights[i] corresponds to featuresList[i] (e.g. total listen time).
 */
function buildWeightedProfile(featuresList, weights) {
  const profile = {};
  for (const dim of DIMENSIONS) {
    const pairs = featuresList
      .map((f, i) => ({ val: f[dim], w: weights[i] || 0 }))
      .filter(p => p.val != null && p.w > 0);
    if (pairs.length === 0) { profile[dim] = { mean: 0.5, std: 0.15 }; continue; }
    const totalWeight = pairs.reduce((s, p) => s + p.w, 0);
    const mean = pairs.reduce((s, p) => s + p.val * p.w, 0) / totalWeight;
    const variance = pairs.reduce((s, p) => s + p.w * (p.val - mean) ** 2, 0) / totalWeight;
    profile[dim] = { mean, std: Math.sqrt(variance) };
  }
  return profile;
}

/**
 * Blend two profiles: weight * general + (1-weight) * specific.
 */
function blendProfiles(general, specific, generalWeight = 0.7) {
  const blended = {};
  for (const dim of DIMENSIONS) {
    const g = general[dim] || { mean: 0.5, std: 0.15 };
    const s = specific[dim] || { mean: 0.5, std: 0.15 };
    blended[dim] = {
      mean: g.mean * generalWeight + s.mean * (1 - generalWeight),
      std: g.std * generalWeight + s.std * (1 - generalWeight),
    };
  }
  return blended;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function scoreTrack(track, audioFeatures, tasteProfile, skipData, negativeSignals) {
  let score = 0;

  // Feature similarity (0-40 pts)
  if (audioFeatures) {
    const compareDims = ['energy', 'danceability', 'valence', 'acousticness'];
    let totalDistance = 0;
    for (const dim of compareDims) {
      const target = (tasteProfile[dim] || { mean: 0.5 }).mean;
      const actual = audioFeatures[dim];
      if (actual != null) totalDistance += Math.abs(target - actual);
    }
    // Max distance per dim is 1, so max total is 4
    const similarity = 1 - (totalDistance / compareDims.length);
    score += similarity * 40;
  }

  // Popularity sweet spot (0-10 pts): prefer 30-70 range
  const pop = track.popularity != null ? track.popularity : 50;
  if (pop >= 30 && pop <= 70) {
    score += 10;
  } else {
    const distFromSweet = Math.min(Math.abs(pop - 30), Math.abs(pop - 70));
    score += Math.max(0, 10 - distFromSweet * 0.3);
  }

  // Freshness bonus (0-10 pts)
  if (track.album && track.album.release_date) {
    const releaseDate = new Date(track.album.release_date);
    const ageMs = Date.now() - releaseDate.getTime();
    const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
    score += Math.max(0, 10 - ageYears * 1.5);
  }

  // Skip-aware penalty: -15 if artist is frequently skipped
  if (skipData && skipData.skippedArtists) {
    const trackArtistName = (track.artists && track.artists[0]) ? track.artists[0].name : (track.artist || '');
    if (trackArtistName && skipData.skippedArtists.has(trackArtistName)) {
      score -= 15;
    }
  }

  // Downloaded-never-played artist penalty: -10
  if (negativeSignals && negativeSignals.size > 0) {
    const trackArtistName = (track.artists && track.artists[0]) ? track.artists[0].name : (track.artist || '');
    if (trackArtistName && negativeSignals.has(trackArtistName)) {
      score -= 10;
    }
  }

  return score;
}

// ─── Strategy 1: Audio-Feature-Targeted Recommendations ─────────────────────

async function strategyFeatureTargeted(db, spotifyFetch, tasteProfile, knownIds) {
  const topIds = db.getTopPlayedSpotifyIds(50);
  if (topIds.length === 0) return [];

  // Pick seeds from DIFFERENT artists to maximise diversity
  const stats = db.getStatsData();
  const topTracks = stats.topTracks || [];
  const usedArtists = new Set();
  const seedTracks = [];
  for (const t of topTracks) {
    if (seedTracks.length >= 3) break;
    if (t.spotify_id && !usedArtists.has(t.artist)) {
      usedArtists.add(t.artist);
      seedTracks.push(t.spotify_id);
    }
  }

  // Fill remaining seeds with top artists if possible
  const seedArtists = [];
  try {
    const topArtistsData = await spotifyFetch('/me/top/artists?limit=5&time_range=medium_term');
    const artists = (topArtistsData.items || []);
    for (const a of artists) {
      if (seedTracks.length + seedArtists.length >= 5) break;
      seedArtists.push(a.id);
    }
  } catch {}

  // Ensure we have at least some seeds
  if (seedTracks.length === 0 && seedArtists.length === 0) return [];

  const params = new URLSearchParams({ limit: '50' });
  if (seedTracks.length) params.set('seed_tracks', seedTracks.join(','));
  if (seedArtists.length) params.set('seed_artists', seedArtists.join(','));

  // Set target parameters from blended profile
  for (const dim of ['energy', 'danceability', 'valence', 'acousticness']) {
    const val = (tasteProfile[dim] || { mean: 0.5 }).mean;
    params.set(`target_${dim}`, val.toFixed(3));
  }
  if (tasteProfile.tempo) {
    params.set('target_tempo', tasteProfile.tempo.mean.toFixed(1));
  }

  try {
    const recs = await spotifyFetch(`/recommendations?${params}`);
    return (recs.tracks || [])
      .filter(t => !knownIds.has(t.id))
      .map(t => ({
        ...t,
        _strategy: 'feature_targeted',
        _reason: 'Matched to your listening profile',
      }));
  } catch (err) {
    console.warn('[recommendations] Feature-targeted strategy failed:', err.message);
    return [];
  }
}

// ─── Strategy 2: Deep Cuts ──────────────────────────────────────────────────

async function strategyDeepCuts(db, spotifyFetch, knownIds) {
  const stats = db.getStatsData();
  const topArtists = (stats.topArtists || []).slice(0, 5);
  if (topArtists.length === 0) return [];

  const deepCuts = [];

  for (const artist of topArtists) {
    if (deepCuts.length >= 20) break;
    try {
      // Search for artist ID on Spotify
      const searchData = await spotifyFetch(
        `/search?q=${encodeURIComponent(artist.name)}&type=artist&limit=1`
      );
      const spotifyArtist = (searchData.artists?.items || [])[0];
      if (!spotifyArtist) continue;

      // Get their albums
      const albumsData = await spotifyFetch(
        `/artists/${spotifyArtist.id}/albums?include_groups=album,single&limit=10`
      );
      const albums = albumsData.items || [];

      for (const album of albums) {
        if (deepCuts.length >= 20) break;
        try {
          const tracksData = await spotifyFetch(`/albums/${album.id}/tracks?limit=50`);
          for (const track of (tracksData.items || [])) {
            if (deepCuts.length >= 20) break;
            if (knownIds.has(track.id)) continue;
            deepCuts.push({
              ...track,
              // Album tracks from this endpoint lack album info, add it
              album: { name: album.name, images: album.images, release_date: album.release_date },
              _strategy: 'deep_cut',
              _reason: `Unheard track from ${artist.name}`,
            });
          }
        } catch {}
      }
    } catch (err) {
      console.warn(`[recommendations] Deep cuts failed for ${artist.name}:`, err.message);
    }
  }

  return deepCuts.slice(0, 20);
}

// ─── Strategy 3: Related Artist Exploration ─────────────────────────────────

async function strategyRelatedArtists(db, spotifyFetch, cachedSpotifyFetch, knownIds) {
  const stats = db.getStatsData();
  const topArtists = (stats.topArtists || []).slice(0, 3);
  if (topArtists.length === 0) return [];

  const results = [];

  for (const artist of topArtists) {
    if (results.length >= 20) break;
    try {
      // Resolve artist ID
      const searchData = await spotifyFetch(
        `/search?q=${encodeURIComponent(artist.name)}&type=artist&limit=1`
      );
      const spotifyArtist = (searchData.artists?.items || [])[0];
      if (!spotifyArtist) continue;

      // Get related artists
      let relatedData;
      try {
        relatedData = await cachedSpotifyFetch(`/artists/${spotifyArtist.id}/related-artists`, 300000);
      } catch {
        continue;
      }
      const relatedArtists = (relatedData.artists || []).slice(0, 3);

      for (const related of relatedArtists) {
        if (results.length >= 20) break;
        try {
          const topTracksData = await spotifyFetch(
            `/artists/${related.id}/top-tracks?market=from_token`
          );
          for (const track of (topTracksData.tracks || [])) {
            if (results.length >= 20) break;
            if (knownIds.has(track.id)) continue;
            results.push({
              ...track,
              _strategy: 'related',
              _reason: `Fans of ${artist.name} also like ${related.name}`,
            });
          }
        } catch {}
      }
    } catch (err) {
      console.warn(`[recommendations] Related artists failed for ${artist.name}:`, err.message);
    }
  }

  return results.slice(0, 20);
}

// ─── Strategy 4: Mood Match (Recent Session) ────────────────────────────────

async function strategyMoodMatch(db, spotifyFetch, knownIds) {
  // Session detection: walk backwards through play history to find current session
  const history = db.getPlayHistory();
  if (history.length === 0) return [];

  const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes
  const sessionTracks = [];
  const seen = new Set();

  // Walk backwards to find current session boundary
  for (let i = history.length - 1; i >= 0 && sessionTracks.length < 20; i--) {
    // Check for session gap
    if (i < history.length - 1) {
      const currentTime = new Date(history[i].playedAt).getTime();
      const nextTime = new Date(history[i + 1].playedAt).getTime();
      if (nextTime - currentTime > SESSION_GAP_MS) {
        break; // Session boundary found
      }
    }

    const track = db.getTrackById(history[i].trackId);
    if (track && track.spotify_id && !seen.has(track.spotify_id)) {
      seen.add(track.spotify_id);
      sessionTracks.push(track.spotify_id);
    }
  }

  // Fall back to last 5 if current session has fewer than 3 tracks
  let seedIds;
  if (sessionTracks.length < 3) {
    seedIds = db.getRecentPlayedSpotifyIds(5);
  } else {
    seedIds = sessionTracks;
  }

  if (seedIds.length === 0) return [];

  // Fetch audio features for session tracks
  const features = await fetchAudioFeatures(seedIds, spotifyFetch);
  const featuresList = Object.values(features);
  if (featuresList.length === 0) return [];

  // Build current mood profile
  const moodProfile = buildProfile(featuresList);

  // Use session tracks as seeds (max 5 for API)
  const seeds = seedIds.slice(0, 5);
  const params = new URLSearchParams({ limit: '50' });
  params.set('seed_tracks', seeds.join(','));

  // Set mood targets
  for (const dim of ['energy', 'danceability', 'valence', 'acousticness']) {
    const val = (moodProfile[dim] || { mean: 0.5 }).mean;
    params.set(`target_${dim}`, val.toFixed(3));
  }
  if (moodProfile.tempo) {
    params.set('target_tempo', moodProfile.tempo.mean.toFixed(1));
  }

  try {
    const recs = await spotifyFetch(`/recommendations?${params}`);
    return (recs.tracks || [])
      .filter(t => !knownIds.has(t.id))
      .map(t => ({
        ...t,
        _strategy: 'mood',
        _reason: 'Matches your current vibe',
      }));
  } catch (err) {
    console.warn('[recommendations] Mood match strategy failed:', err.message);
    return [];
  }
}

// ─── Strategy 5: Release Radar ─────────────────────────────────────────────

async function strategyReleaseRadar(db, spotifyFetch, knownIds) {
  const stats = db.getStatsData();
  const topArtists = (stats.topArtists || []).slice(0, 10);
  if (topArtists.length === 0) return [];

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 14);

  const results = [];

  for (const artist of topArtists) {
    if (results.length >= 15) break;
    try {
      // Resolve artist ID on Spotify
      const searchData = await spotifyFetch(
        `/search?q=${encodeURIComponent(artist.name)}&type=artist&limit=1`
      );
      const spotifyArtist = (searchData.artists?.items || [])[0];
      if (!spotifyArtist) continue;

      // Fetch recent albums/singles
      const albumsData = await spotifyFetch(
        `/artists/${spotifyArtist.id}/albums?include_groups=single,album&limit=5`
      );
      const albums = (albumsData.items || []).filter(album => {
        if (!album.release_date) return false;
        const releaseDate = new Date(album.release_date);
        return releaseDate >= cutoffDate;
      });

      for (const album of albums) {
        if (results.length >= 15) break;
        try {
          const tracksData = await spotifyFetch(`/albums/${album.id}/tracks?limit=50`);
          for (const track of (tracksData.items || [])) {
            if (results.length >= 15) break;
            if (knownIds.has(track.id)) continue;
            results.push({
              ...track,
              album: { name: album.name, images: album.images, release_date: album.release_date },
              _strategy: 'release_radar',
              _reason: `New release from ${artist.name}`,
            });
          }
        } catch {}
      }
    } catch (err) {
      console.warn(`[recommendations] Release radar failed for ${artist.name}:`, err.message);
    }
  }

  return results.slice(0, 15);
}

// ─── Strategy 6: Rediscovery ───────────────────────────────────────────────

async function strategyRediscovery(db, spotifyFetch) {
  const history = db.getPlayHistory();
  if (history.length === 0) return [];

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Count plays and find last play date per trackId
  const trackStats = {};
  for (const h of history) {
    if (!trackStats[h.trackId]) {
      trackStats[h.trackId] = { count: 0, lastPlayed: null };
    }
    trackStats[h.trackId].count++;
    const playedAt = new Date(h.playedAt);
    if (!trackStats[h.trackId].lastPlayed || playedAt > trackStats[h.trackId].lastPlayed) {
      trackStats[h.trackId].lastPlayed = playedAt;
    }
  }

  // Find forgotten favorites: 5+ plays but not played in 90 days
  const forgotten = [];
  for (const [trackId, stats] of Object.entries(trackStats)) {
    if (stats.count >= 5 && stats.lastPlayed < ninetyDaysAgo) {
      const track = db.getTrackById(trackId);
      if (track) {
        forgotten.push({
          ...track,
          _playCount: stats.count,
          _lastPlayed: stats.lastPlayed.toISOString(),
        });
      }
    }
  }

  // Sort by play count descending, take top 10
  forgotten.sort((a, b) => b._playCount - a._playCount);
  return forgotten.slice(0, 10).map(t => ({
    ...t,
    _strategy: 'rediscovery',
    _reason: 'You used to love this',
  }));
}

// ─── Strategy 7: Exploration ───────────────────────────────────────────────

async function strategyExploration(db, spotifyFetch, tasteProfile, knownIds) {
  // Invert taste profile targets to push outside comfort zone
  const invertedTargets = {};
  for (const dim of ['energy', 'danceability', 'valence', 'acousticness']) {
    const val = (tasteProfile[dim] || { mean: 0.5 }).mean;
    invertedTargets[dim] = 1 - val;
  }

  // Get user's top artists to derive genres to AVOID
  const stats = db.getStatsData();
  const topTracks = (stats.topTracks || []).slice(0, 3);
  const seedTracks = topTracks
    .filter(t => t.spotify_id)
    .map(t => t.spotify_id)
    .slice(0, 2);

  // Use top artists as negative signal - try to find artists the user DOESN'T listen to
  let seedArtists = [];
  try {
    const topArtistsData = await spotifyFetch('/me/top/artists?limit=5&time_range=long_term');
    const artists = (topArtistsData.items || []);
    // Use related artists of bottom-ranked top artists for diversity
    if (artists.length > 0) {
      const lastArtist = artists[artists.length - 1];
      try {
        const relatedData = await spotifyFetch(`/artists/${lastArtist.id}/related-artists`);
        const relatedArtists = (relatedData.artists || []).slice(0, 3);
        seedArtists = relatedArtists.map(a => a.id);
      } catch {}
    }
  } catch {}

  // Build params with inverted targets
  const params = new URLSearchParams({ limit: '30' });
  if (seedTracks.length) params.set('seed_tracks', seedTracks.join(','));
  if (seedArtists.length) params.set('seed_artists', seedArtists.join(','));

  // Ensure we have at least some seeds
  if (!seedTracks.length && !seedArtists.length) return [];

  for (const [dim, val] of Object.entries(invertedTargets)) {
    params.set(`target_${dim}`, val.toFixed(3));
  }

  try {
    const recs = await spotifyFetch(`/recommendations?${params}`);
    return (recs.tracks || [])
      .filter(t => !knownIds.has(t.id))
      .slice(0, 10)
      .map(t => ({
        ...t,
        _strategy: 'exploration',
        _reason: 'Something different for you',
      }));
  } catch (err) {
    console.warn('[recommendations] Exploration strategy failed:', err.message);
    return [];
  }
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

async function getSmartRecommendations(db, spotifyFetch, cachedSpotifyFetch) {
  const startTime = Date.now();

  // 1. Build taste profile with duration weighting
  const topIds = db.getTopPlayedSpotifyIds(50);
  let generalProfile = {};
  let tasteProfile = {};

  if (topIds.length > 0) {
    const features = await fetchAudioFeatures(topIds, spotifyFetch);

    // Compute total listen time per spotify track ID for weighted profile
    const history = db.getPlayHistory();
    const durationBySpotifyId = {};
    for (const h of history) {
      const track = db.getTrackById(h.trackId);
      if (track && track.spotify_id) {
        durationBySpotifyId[track.spotify_id] = (durationBySpotifyId[track.spotify_id] || 0) + (h.duration_ms || 0);
      }
    }

    // Build aligned featuresList and weights arrays
    const featuresList = [];
    const weights = [];
    for (const id of topIds) {
      if (features[id]) {
        featuresList.push(features[id]);
        weights.push(durationBySpotifyId[id] || 1);
      }
    }

    // Use weighted profile when we have duration data, otherwise standard
    const hasWeights = weights.some(w => w > 1);
    generalProfile = hasWeights
      ? buildWeightedProfile(featuresList, weights)
      : buildProfile(featuresList);

    // 2. Time-of-day + weekend/weekday awareness
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();
    const isWeekend = currentDay === 0 || currentDay === 6;

    const timeFiltered = history.filter(h => {
      const playedDate = new Date(h.playedAt);
      const playedHour = playedDate.getHours();
      const playedDay = playedDate.getDay();
      const playedIsWeekend = playedDay === 0 || playedDay === 6;

      // Filter by day type (weekend/weekday)
      if (isWeekend !== playedIsWeekend) return false;

      // Filter by hour (+-2, wrapping around midnight)
      const diff = Math.abs(playedHour - currentHour);
      return diff <= 2 || diff >= 22;
    });

    // Get spotify IDs for time-filtered tracks
    const timeTrackIds = [];
    const seen = new Set();
    for (const h of timeFiltered) {
      const track = db.getTrackById(h.trackId);
      if (track && track.spotify_id && !seen.has(track.spotify_id)) {
        seen.add(track.spotify_id);
        timeTrackIds.push(track.spotify_id);
      }
    }

    if (timeTrackIds.length > 0) {
      const timeFeatures = await fetchAudioFeatures(timeTrackIds, spotifyFetch);
      const timeFeaturesList = Object.values(timeFeatures);
      if (timeFeaturesList.length > 0) {
        const timeProfile = buildProfile(timeFeaturesList);
        tasteProfile = blendProfiles(generalProfile, timeProfile, 0.7);
      } else {
        tasteProfile = generalProfile;
      }
    } else {
      tasteProfile = generalProfile;
    }
  }

  // 3. Get known IDs to filter out
  const knownIds = new Set(db.getAllSpotifyIds());

  // Build skip data for scoring
  const frequentlySkipped = db.getFrequentlySkippedArtists();
  const skippedArtists = new Set(frequentlySkipped.map(a => a.artist));
  const skipData = { skippedArtists };

  // Build negative signals: downloaded but never played
  const allTracks = db.getAllDownloadedTracks ? db.getAllDownloadedTracks() : [];
  const negativeSignals = new Set();
  for (const t of allTracks) {
    if (t.downloaded && (t.play_count || 0) === 0 && t.artist) {
      const artists = t.artist.split(', ');
      for (const a of artists) {
        if (a) negativeSignals.add(a);
      }
    }
  }

  // Get feedback stats
  const feedbackStats = db.getRecFeedbackStats();

  // 4. Run all 7 strategies in parallel
  const [featureResult, deepCutResult, relatedResult, moodResult, radarResult, rediscoveryResult, explorationResult] = await Promise.allSettled([
    strategyFeatureTargeted(db, spotifyFetch, tasteProfile, knownIds),
    strategyDeepCuts(db, spotifyFetch, knownIds),
    strategyRelatedArtists(db, spotifyFetch, cachedSpotifyFetch, knownIds),
    strategyMoodMatch(db, spotifyFetch, knownIds),
    strategyReleaseRadar(db, spotifyFetch, knownIds),
    strategyRediscovery(db, spotifyFetch),
    strategyExploration(db, spotifyFetch, tasteProfile, knownIds),
  ]);

  const featureTracks = featureResult.status === 'fulfilled' ? featureResult.value : [];
  const deepCutTracks = deepCutResult.status === 'fulfilled' ? deepCutResult.value : [];
  const relatedTracks = relatedResult.status === 'fulfilled' ? relatedResult.value : [];
  const moodTracks = moodResult.status === 'fulfilled' ? moodResult.value : [];
  const radarTracks = radarResult.status === 'fulfilled' ? radarResult.value : [];
  const rediscoveryTracks = rediscoveryResult.status === 'fulfilled' ? rediscoveryResult.value : [];
  const explorationTracks = explorationResult.status === 'fulfilled' ? explorationResult.value : [];

  // 5. Merge all results, deduplicate by track ID
  // Note: rediscovery tracks are intentionally from user's own library
  const allCandidates = [];
  const seenIds = new Set();

  for (const track of [...featureTracks, ...deepCutTracks, ...relatedTracks, ...moodTracks, ...radarTracks, ...explorationTracks]) {
    if (!track.id || seenIds.has(track.id)) continue;
    seenIds.add(track.id);
    allCandidates.push(track);
  }

  // Add rediscovery tracks separately (they bypass knownIds filtering)
  for (const track of rediscoveryTracks) {
    const trackKey = track.id || track.spotify_id;
    if (!trackKey || seenIds.has(trackKey)) continue;
    seenIds.add(trackKey);
    allCandidates.push(track);
  }

  // 6. Fetch audio features for all candidates (for scoring)
  const candidateIds = allCandidates.map(t => t.id).filter(Boolean);
  const allFeatures = await fetchAudioFeatures(candidateIds, spotifyFetch);

  // 7. Score every track (with skip data and negative signals)
  for (const track of allCandidates) {
    track._score = scoreTrack(track, allFeatures[track.id] || null, tasteProfile, skipData, negativeSignals);
  }

  // 8. Genre diversity bonus
  // Collect artist IDs from candidates for genre lookup
  const artistIdsToFetch = new Set();
  for (const track of allCandidates) {
    if (track.artists && track.artists[0] && track.artists[0].id) {
      artistIdsToFetch.add(track.artists[0].id);
    }
  }

  // Batch fetch artist genre data
  const artistGenres = {};
  const artistIdArray = [...artistIdsToFetch];
  for (let i = 0; i < artistIdArray.length; i += 50) {
    const batch = artistIdArray.slice(i, i + 50);
    try {
      const data = await spotifyFetch(`/artists?ids=${batch.join(',')}`);
      for (const artist of (data.artists || [])) {
        if (artist && artist.id) {
          artistGenres[artist.id] = artist.genres || [];
        }
      }
    } catch {}
  }

  // Count genre frequencies in results
  const genreCount = {};
  for (const track of allCandidates) {
    const artistId = track.artists && track.artists[0] && track.artists[0].id;
    if (artistId && artistGenres[artistId]) {
      for (const genre of artistGenres[artistId]) {
        genreCount[genre] = (genreCount[genre] || 0) + 1;
      }
    }
  }

  // Apply genre diversity bonus: underrepresented genres get +5
  if (Object.keys(genreCount).length > 0) {
    const avgGenreCount = Object.values(genreCount).reduce((s, v) => s + v, 0) / Object.keys(genreCount).length;
    for (const track of allCandidates) {
      const artistId = track.artists && track.artists[0] && track.artists[0].id;
      if (artistId && artistGenres[artistId]) {
        const trackGenres = artistGenres[artistId];
        const isUnderrepresented = trackGenres.some(g => (genreCount[g] || 0) < avgGenreCount);
        if (isUnderrepresented) {
          track._score += 5;
        }
      }
    }
  }

  // Sort by score descending
  allCandidates.sort((a, b) => b._score - a._score);

  // Apply artist diversity (max 2 tracks per artist)
  const artistCount = {};
  const diversified = [];
  for (const track of allCandidates) {
    const artistKey = (track.artists || []).map(a => a.id || a.name).join(',') || track.artist || 'unknown';
    artistCount[artistKey] = (artistCount[artistKey] || 0) + 1;
    if (artistCount[artistKey] > 2) {
      track._score -= 20; // Apply diversity penalty
    }
    diversified.push(track);
  }

  // Re-sort after penalty
  diversified.sort((a, b) => b._score - a._score);

  // 9. Build categorized results
  const topTracks = diversified.slice(0, 50);
  const forYou = topTracks.filter(t => t._strategy === 'feature_targeted').slice(0, 15);
  const deepCuts = topTracks.filter(t => t._strategy === 'deep_cut').slice(0, 10);
  const newArtists = topTracks.filter(t => t._strategy === 'related').slice(0, 10);
  const moodMatch = topTracks.filter(t => t._strategy === 'mood').slice(0, 10);
  const releaseRadar = radarTracks.slice(0, 15);
  const rediscovery = rediscoveryTracks.slice(0, 10);
  const exploration = explorationTracks.slice(0, 10);

  // If categorized lists are short, fill from top tracks
  const fillForYou = forYou.length < 15
    ? topTracks.filter(t => !forYou.includes(t)).slice(0, 15 - forYou.length)
    : [];

  // Build seed info for the response
  const stats = db.getStatsData();
  const seedArtists = (stats.topArtists || []).slice(0, 5);
  const seedTrackIds = db.getTopPlayedSpotifyIds(5);

  const elapsed = Date.now() - startTime;
  console.log(`[recommendations] Built in ${elapsed}ms — ${topTracks.length} tracks from ${featureTracks.length} feature + ${deepCutTracks.length} deep + ${relatedTracks.length} related + ${moodTracks.length} mood + ${radarTracks.length} radar + ${rediscoveryTracks.length} rediscovery + ${explorationTracks.length} exploration`);

  return {
    tracks: topTracks,
    forYou: [...forYou, ...fillForYou],
    deepCuts,
    newArtists,
    moodMatch,
    releaseRadar,
    rediscovery,
    exploration,
    tasteProfile,
    feedbackStats,
    seeds: {
      artists: seedArtists,
      tracks: seedTrackIds,
    },
  };
}

module.exports = { getSmartRecommendations };
