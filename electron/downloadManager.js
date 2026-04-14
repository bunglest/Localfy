const fs = require('fs');
const https = require('https');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const AUDIO_EXTENSIONS = /\.(mp3|m4a|opus|ogg|webm)$/i;
const MAX_AUTO_RETRIES = 2;
const RETRY_DELAYS_MS = [1500, 4000];
const YT_DLP_DOWNLOAD_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const HTTP_REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeMatchText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .toLowerCase()
    .trim();
}

function tokenizeMatchText(value) {
  return normalizeMatchText(value).split(/\s+/).filter(Boolean);
}

function sanitizeFileStem(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100) || 'Unknown Track';
}

function legacyStatusFromState(state) {
  return {
    queued: 'queued',
    running: 'downloading',
    completed: 'done',
    failed: 'failed',
    cancelled: 'failed',
  }[state] || 'queued';
}

class DownloadManager {
  constructor({ app, db, getMainWindow }) {
    this.app = app;
    this.db = db;
    this.getMainWindow = getMainWindow;
    this.processing = false;
    this.currentRun = null;
    this.ytDlpInstallPromise = null;
    this.lastYtDlpBootstrapError = null;
  }

  init() {
    this.db.requeueInterruptedDownloadJobs();
    this.db.reconcileCompletedDownloadJobs();
    this.emitChange();
    this.processQueue();
  }

  getSnapshot() {
    return this.db.getDownloadSnapshot();
  }

  emitChange(job = null) {
    const snapshot = this.getSnapshot();
    const payload = {
      job,
      jobs: snapshot.jobs,
      stats: snapshot.stats,
    };
    const window = this.getMainWindow?.();
    if (window && !window.isDestroyed()) {
      window.webContents.send('download:changed', payload);
      if (job) {
        window.webContents.send('download:progress', this.toLegacyProgress(job));
      }
    }
    return payload;
  }

  toLegacyProgress(job) {
    return {
      queueItemId: job.id,
      trackId: job.trackId,
      status: legacyStatusFromState(job.state),
      progress: job.progress || 0,
      title: job.title,
      artist: job.artist,
      filePath: job.filePath || null,
      error: job.lastError || null,
    };
  }

  getDownloadPath() {
    const custom = this.db.getSetting('downloadPath', '');
    if (custom && fs.existsSync(custom)) return custom;
    const dir = path.join(this.app.getPath('music'), 'Localfy');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  getTempRoot() {
    const dir = path.join(this.getDownloadPath(), '.localfy-temp');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  getLogDir() {
    const dir = path.join(this.app.getPath('userData'), 'download-logs');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  logJob(jobId, message) {
    try {
      const line = `[${nowIso()}] ${message}\n`;
      fs.appendFileSync(path.join(this.getLogDir(), `${jobId}.log`), line, 'utf8');
    } catch {}
  }

  normalizeExecutablePath(executablePath) {
    if (!executablePath) return null;
    return executablePath.replace('app.asar', 'app.asar.unpacked');
  }

  canExecuteBinary(command, args = ['--version']) {
    if (!command) return false;
    try {
      execFileSync(command, args, { stdio: 'ignore', timeout: 5000, windowsHide: true });
      return true;
    } catch {
      return false;
    }
  }

  findCommandOnPath(command) {
    try {
      const lookup = process.platform === 'win32' ? 'where.exe' : 'which';
      const output = execFileSync(lookup, [command], {
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
        windowsHide: true,
      }).toString('utf8');
      return output
        .split(/\r?\n/)
        .map(line => line.trim())
        .find(Boolean) || null;
    } catch {
      return null;
    }
  }

  getBundledYtDlpPath() {
    if (!this.app.isPackaged || !process.resourcesPath) return null;
    return path.join(
      process.resourcesPath,
      'bin',
      'yt-dlp',
      process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
    );
  }

  getManagedYtDlpPath() {
    const binDir = path.join(this.app.getPath('userData'), 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    return path.join(binDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  }

  canAutoInstallYtDlp() {
    return process.platform === 'win32';
  }

  findYtDlp() {
    const candidates = [
      this.getBundledYtDlpPath(),
      this.getManagedYtDlpPath(),
      'yt-dlp',
      'yt-dlp.exe',
      path.join(this.app.getPath('userData'), 'yt-dlp.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'yt-dlp', 'yt-dlp.exe'),
    ];
    for (const candidate of candidates) {
      if (this.canExecuteBinary(candidate)) return candidate;
    }
    return null;
  }

  downloadFile(url, destinationPath, redirectCount = 0) {
    return new Promise((resolve, reject) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects while downloading yt-dlp'));
        return;
      }

      const tempPath = `${destinationPath}.download`;
      try { fs.rmSync(tempPath, { force: true }); } catch {}

      const request = https.get(url, {
        headers: {
          'user-agent': `Localfy/${this.app.getVersion?.() || 'dev'}`,
        },
      }, (response) => {
        if (HTTP_REDIRECT_CODES.has(response.statusCode) && response.headers.location) {
          response.resume();
          const nextUrl = new URL(response.headers.location, url).toString();
          this.downloadFile(nextUrl, destinationPath, redirectCount + 1).then(resolve, reject);
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Failed to download yt-dlp (${response.statusCode || 'unknown status'})`));
          return;
        }

        const file = fs.createWriteStream(tempPath);
        response.pipe(file);

        file.on('finish', () => {
          file.close(() => {
            try {
              fs.renameSync(tempPath, destinationPath);
              resolve(destinationPath);
            } catch (error) {
              reject(error);
            }
          });
        });

        file.on('error', (error) => {
          try { file.close(() => {}); } catch {}
          try { fs.rmSync(tempPath, { force: true }); } catch {}
          reject(error);
        });
      });

      request.on('error', (error) => {
        try { fs.rmSync(tempPath, { force: true }); } catch {}
        reject(error);
      });

      request.setTimeout(30000, () => {
        request.destroy(new Error('Timed out while downloading yt-dlp'));
      });
    });
  }

  async ensureYtDlp() {
    const existing = this.findYtDlp();
    if (existing) {
      this.lastYtDlpBootstrapError = null;
      return existing;
    }

    if (!this.canAutoInstallYtDlp()) return null;
    if (this.ytDlpInstallPromise) return this.ytDlpInstallPromise;

    const targetPath = this.getManagedYtDlpPath();
    this.ytDlpInstallPromise = (async () => {
      try {
        await this.downloadFile(YT_DLP_DOWNLOAD_URL, targetPath);
        if (!this.canExecuteBinary(targetPath)) {
          throw new Error('yt-dlp was downloaded but could not be executed');
        }
        this.lastYtDlpBootstrapError = null;
        return targetPath;
      } catch (error) {
        this.lastYtDlpBootstrapError = error.message;
        try { fs.rmSync(targetPath, { force: true }); } catch {}
        return null;
      } finally {
        this.ytDlpInstallPromise = null;
      }
    })();

    return this.ytDlpInstallPromise;
  }

  getJsRuntimePath() {
    return process.execPath || null;
  }

  getJsRuntimeArg() {
    const runtimePath = this.getJsRuntimePath();
    return runtimePath ? `node:${runtimePath}` : null;
  }

  findFfmpegSuite() {
    const candidates = [];

    if (this.app.isPackaged && process.resourcesPath) {
      const bundledDir = path.join(process.resourcesPath, 'bin', 'ffmpeg');
      candidates.push({
        source: 'bundled',
        ffmpegPath: path.join(bundledDir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
        ffprobePath: path.join(bundledDir, process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'),
      });
    }

    try {
      const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
      const ffprobeStatic = require('ffprobe-static');
      candidates.push({
        source: 'npm',
        ffmpegPath: this.normalizeExecutablePath(ffmpegInstaller.path),
        ffprobePath: this.normalizeExecutablePath(ffprobeStatic.path),
      });
    } catch {}

    const systemFfmpeg = this.findCommandOnPath(process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    const systemFfprobe = this.findCommandOnPath(process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
    if (systemFfmpeg && systemFfprobe) {
      candidates.push({
        source: 'system',
        ffmpegPath: systemFfmpeg,
        ffprobePath: systemFfprobe,
      });
    }

    for (const candidate of candidates) {
      const ffmpegPath = candidate.ffmpegPath;
      const ffprobePath = candidate.ffprobePath;
      if (!this.canExecuteBinary(ffmpegPath, ['-version'])) continue;
      if (!this.canExecuteBinary(ffprobePath, ['-version'])) continue;
      const ffmpegDir = path.dirname(ffmpegPath);
      const ffprobeDir = path.dirname(ffprobePath);
      return {
        available: true,
        source: candidate.source,
        ffmpegPath,
        ffprobePath,
        locationArg: ffmpegDir === ffprobeDir ? ffmpegDir : ffmpegPath,
        pathEntries: unique([ffmpegDir, ffprobeDir]),
      };
    }

    return {
      available: false,
      source: null,
      ffmpegPath: null,
      ffprobePath: null,
      locationArg: null,
      pathEntries: [],
    };
  }

  checkYtDlp() {
    const ytDlp = this.findYtDlp();
    const ffmpeg = this.findFfmpegSuite();
    const jsRuntimePath = this.getJsRuntimePath();
    return {
      available: !!ytDlp,
      path: ytDlp,
      autoInstallSupported: this.canAutoInstallYtDlp(),
      managedPath: this.canAutoInstallYtDlp() ? this.getManagedYtDlpPath() : null,
      lastBootstrapError: this.lastYtDlpBootstrapError,
      ffmpegAvailable: ffmpeg.available,
      ffmpegPath: ffmpeg.ffmpegPath,
      ffprobePath: ffmpeg.ffprobePath,
      ffmpegSource: ffmpeg.source,
      jsRuntimeAvailable: !!jsRuntimePath,
      jsRuntimePath,
    };
  }

  resolveStoredTrack(track) {
    if (!track) return null;
    if (track.id) {
      const byId = this.db.getTrackById(track.id);
      if (byId) return byId;
    }
    if (track.spotify_id) {
      const bySpotifyId = this.db.getTrackBySpotifyId(track.spotify_id);
      if (bySpotifyId) return bySpotifyId;
    }
    return null;
  }

  isDownloadedLocally(track) {
    return !!(track?.downloaded && track?.file_path && fs.existsSync(track.file_path));
  }

  buildFileStem(track) {
    const pattern = this.db.getSetting('download.filenamePattern', '{artist} - {title}');
    return sanitizeFileStem(
      pattern
        .replace(/\{artist\}/g, track.artist || 'Unknown Artist')
        .replace(/\{title\}/g, track.title || 'Unknown Title')
        .replace(/\{album\}/g, track.album || '')
    );
  }

  buildUniqueFilePath(downloadDir, stem, extWithDot) {
    const ext = extWithDot || '.mp3';
    let attempt = 0;
    while (attempt < 1000) {
      const suffix = attempt === 0 ? '' : ` (${attempt})`;
      const candidate = path.join(downloadDir, `${stem}${suffix}${ext}`);
      if (!fs.existsSync(candidate)) return candidate;
      attempt += 1;
    }
    throw new Error('Unable to allocate a file name for the download');
  }

  findDownloadedTempFile(tempDir) {
    const files = fs.readdirSync(tempDir).filter(file => AUDIO_EXTENSIONS.test(file));
    if (!files.length) return null;
    files.sort((a, b) => {
      try {
        return fs.statSync(path.join(tempDir, b)).mtimeMs - fs.statSync(path.join(tempDir, a)).mtimeMs;
      } catch {
        return 0;
      }
    });
    return path.join(tempDir, files[0]);
  }

  cleanupTempDir(tempDir) {
    if (!tempDir) return;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }

  finalizeDownloadedFile(track, tempFilePath) {
    const downloadDir = this.getDownloadPath();
    const stem = this.buildFileStem(track);
    const ext = path.extname(tempFilePath) || '.mp3';
    const finalPath = this.buildUniqueFilePath(downloadDir, stem, ext);
    fs.renameSync(tempFilePath, finalPath);
    return finalPath;
  }

  parseProgress(text) {
    const match = text.match(/(\d+(?:\.\d+)?)%/);
    return match ? Math.min(100, Math.max(0, parseFloat(match[1]))) : null;
  }

  summarizeYtDlpFailure(code, stderrOutput) {
    const lines = String(stderrOutput || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    const errors = lines.filter(line => line.startsWith('ERROR:'));
    if (errors.length > 0) {
      return errors[errors.length - 1].replace(/^ERROR:\s*/, '');
    }
    const meaningful = lines.filter(line => !line.startsWith('WARNING:'));
    const tail = (meaningful.length > 0 ? meaningful : lines).slice(-2).join(' ');
    return tail
      ? `yt-dlp exited with code ${code}: ${tail}`.substring(0, 500)
      : `yt-dlp exited with code ${code}`;
  }

  buildSearchQueries(track) {
    const artist = String(track?.artist || '').trim();
    const title = String(track?.title || '').trim();
    const album = String(track?.album || '').trim();
    return unique([
      [artist, title].filter(Boolean).join(' '),
      [artist, title, 'official audio'].filter(Boolean).join(' '),
      [title, artist].filter(Boolean).join(' '),
      album ? [artist, title, album].filter(Boolean).join(' ') : null,
    ]);
  }

  searchCandidates(ytDlp, track, env) {
    const queries = this.buildSearchQueries(track);
    const candidates = [];
    const seenIds = new Set();

    for (const query of queries) {
      try {
        const args = [
          ...(this.getJsRuntimeArg() ? ['--js-runtimes', this.getJsRuntimeArg()] : []),
          `ytsearch8:${query}`,
          '--flat-playlist',
          '--dump-single-json',
          '--no-warnings',
        ];
        const output = execFileSync(ytDlp, args, {
          env,
          windowsHide: true,
          encoding: 'utf8',
          timeout: 30000,
          maxBuffer: 8 * 1024 * 1024,
        });
        const payload = JSON.parse(output);
        for (const entry of payload.entries || []) {
          if (!entry?.id || seenIds.has(entry.id)) continue;
          seenIds.add(entry.id);
          candidates.push(entry);
        }
      } catch {}

      if (candidates.length >= 8) break;
    }

    return candidates;
  }

  scoreCandidate(track, candidate) {
    const expectedTitle = normalizeMatchText(track?.title);
    const expectedArtist = normalizeMatchText(track?.artist);
    const expectedAlbum = normalizeMatchText(track?.album);
    const title = normalizeMatchText(candidate?.title);
    const channel = normalizeMatchText(candidate?.channel || candidate?.uploader);
    const description = normalizeMatchText(candidate?.description);
    const haystack = [title, channel, description].filter(Boolean).join(' ');
    const expectedTitleTokens = new Set(tokenizeMatchText(track?.title));
    const candidateTitleTokens = tokenizeMatchText(candidate?.title);
    const candidateAllTokens = new Set(tokenizeMatchText(haystack));

    let score = 0;
    const reasons = [];

    if (title && expectedTitle && title === expectedTitle) {
      score += 70;
      reasons.push('exact title');
    } else if (title && expectedTitle && (title.includes(expectedTitle) || expectedTitle.includes(title))) {
      score += 50;
      reasons.push('title contains match');
    }

    const matchedTitleTokens = candidateTitleTokens.filter(token => expectedTitleTokens.has(token)).length;
    if (candidateTitleTokens.length > 0 && expectedTitleTokens.size > 0) {
      const overlapRatio = matchedTitleTokens / Math.max(expectedTitleTokens.size, candidateTitleTokens.length);
      const overlapScore = Math.round(overlapRatio * 30);
      score += overlapScore;
      if (overlapScore > 0) reasons.push(`title overlap ${overlapScore}`);
    }

    if (expectedArtist) {
      const artistTokens = tokenizeMatchText(track?.artist);
      const artistMatches = artistTokens.filter(token => candidateAllTokens.has(token)).length;
      if (artistMatches > 0) {
        const artistScore = 12 + Math.round((artistMatches / Math.max(artistTokens.length, 1)) * 18);
        score += artistScore;
        reasons.push(`artist match ${artistScore}`);
      }
    }

    if (candidate?.channel_is_verified) {
      score += 10;
      reasons.push('verified channel');
    }

    if (channel.includes('official') || channel.includes('topic') || channel.includes('vevo')) {
      score += 10;
      reasons.push('official channel');
    }

    if (description.includes('provided to youtube by')) {
      score += 18;
      reasons.push('official release audio');
    }

    if (expectedAlbum && haystack.includes(expectedAlbum)) {
      score += 6;
      reasons.push('album match');
    }

    const expectedDuration = Number(track?.duration_ms) > 0 ? Number(track.duration_ms) / 1000 : null;
    const candidateDuration = Number(candidate?.duration) || null;
    if (expectedDuration && candidateDuration) {
      const delta = Math.abs(candidateDuration - expectedDuration);
      if (delta <= 2) {
        score += 28;
        reasons.push('duration exact');
      } else if (delta <= 5) {
        score += 22;
        reasons.push('duration close');
      } else if (delta <= 10) {
        score += 14;
        reasons.push('duration near');
      } else if (delta <= 20) {
        score += 6;
      } else if (delta > 45) {
        score -= 18;
        reasons.push('duration mismatch');
      }
    }

    const discouragedTokens = {
      parody: 50,
      karaoke: 45,
      instrumental: 42,
      cover: 35,
      reaction: 30,
      tutorial: 30,
      nightcore: 35,
      remix: 18,
      live: 16,
      lyrics: 12,
      slowed: 25,
      reverb: 20,
      sped: 18,
      shorts: 25,
      '8d': 25,
    };

    for (const [token, penalty] of Object.entries(discouragedTokens)) {
      if (!candidateAllTokens.has(token)) continue;
      if (expectedTitleTokens.has(token)) continue;
      score -= penalty;
      reasons.push(`unexpected ${token}`);
    }

    if (title.includes('first take') && !expectedTitle.includes('first take')) {
      score -= 18;
      reasons.push('unexpected first take');
    }

    return {
      score,
      reasons,
    };
  }

  pickDownloadCandidate(track, candidates) {
    const ranked = (candidates || [])
      .map(candidate => {
        const assessment = this.scoreCandidate(track, candidate);
        return {
          candidate,
          score: assessment.score,
          reasons: assessment.reasons,
        };
      })
      .sort((a, b) => b.score - a.score);

    return {
      best: ranked[0] || null,
      ranked,
    };
  }

  resolveDownloadTarget(ytDlp, track, env, jobId = null) {
    const candidates = this.searchCandidates(ytDlp, track, env);
    if (!candidates.length) {
      return {
        url: `ytsearch1:${[track?.artist, track?.title].filter(Boolean).join(' ')}`,
        best: null,
        ranked: [],
      };
    }

    const selection = this.pickDownloadCandidate(track, candidates);
    if (jobId) {
      for (const item of selection.ranked.slice(0, 5)) {
        this.logJob(
          jobId,
          `Candidate ${item.score}: ${item.candidate.title} | ${item.candidate.channel || item.candidate.uploader || 'unknown'} | ${item.candidate.duration || '?'}s | ${item.reasons.join(', ')}`
        );
      }
      if (selection.best) {
        this.logJob(
          jobId,
          `Selected source: ${selection.best.candidate.title} (${selection.best.candidate.url || selection.best.candidate.webpage_url})`
        );
      }
    }

    return {
      url: selection.best?.candidate?.url || selection.best?.candidate?.webpage_url || `ytsearch1:${[track?.artist, track?.title].filter(Boolean).join(' ')}`,
      best: selection.best,
      ranked: selection.ranked,
    };
  }

  getAudioDownloadPlan(requestedFormat, audioQuality, ffmpeg) {
    const normalizedFormat = String(requestedFormat || 'mp3').toLowerCase();
    const nativeSelectors = {
      m4a: 'bestaudio[ext=m4a]/bestaudio[acodec*=mp4a]/bestaudio',
      opus: 'bestaudio[acodec*=opus]/bestaudio[ext=webm]/bestaudio',
    };

    if (normalizedFormat === 'mp3' && ffmpeg.available) {
      return {
        args: ['-x', '--audio-format', 'mp3', '--audio-quality', String(audioQuality || '0')],
        effectiveFormat: 'mp3',
        note: null,
      };
    }

    if (normalizedFormat === 'mp3') {
      return {
        args: ['-f', nativeSelectors.m4a],
        effectiveFormat: 'm4a',
        note: 'ffmpeg not found, falling back to the native audio stream instead of MP3 conversion',
      };
    }

    if (normalizedFormat === 'opus') {
      return {
        args: ['-f', nativeSelectors.opus],
        effectiveFormat: 'opus',
        note: null,
      };
    }

    return {
      args: ['-f', nativeSelectors.m4a],
      effectiveFormat: 'm4a',
      note: null,
    };
  }

  buildProcessEnv(extraPathEntries = []) {
    const env = { ...process.env };
    const pathKey = Object.keys(env).find(key => /^path$/i.test(key)) || 'PATH';
    const currentPath = env[pathKey] || env.PATH || env.Path || '';
    for (const key of Object.keys(env)) {
      if (/^path$/i.test(key) && key !== pathKey) delete env[key];
    }
    env[pathKey] = [...extraPathEntries, currentPath].filter(Boolean).join(path.delimiter);
    return env;
  }

  checkDiskSpace(downloadDir) {
    try {
      const stat = fs.statfsSync(downloadDir);
      const freeBytes = stat.bfree * stat.bsize;
      if (freeBytes < 100 * 1024 * 1024) {
        return 'Low disk space';
      }
    } catch {}
    return null;
  }

  async enqueue(track, options = {}) {
    const intent = options.intent || 'download';
    const autoPlay = !!options.autoPlay;
    const storedTrack = this.resolveStoredTrack(track) || this.db.upsertTrack(track);

    if (this.isDownloadedLocally(storedTrack)) {
      return {
        jobId: null,
        state: 'completed',
        queued: false,
        deduped: false,
        alreadyDownloaded: true,
        filePath: storedTrack.file_path,
        track: storedTrack,
      };
    }

    let existingJob = this.db.findActiveDownloadJob(storedTrack.id, storedTrack.spotify_id);
    if (existingJob) {
      const patch = {};
      if (autoPlay && !existingJob.autoPlay) patch.auto_play = true;
      if (intent === 'play_when_ready' && existingJob.intent !== 'play_when_ready') {
        patch.intent = 'play_when_ready';
      }
      if (Object.keys(patch).length > 0) {
        existingJob = this.db.updateDownloadJob(existingJob.id, patch);
        this.emitChange(existingJob);
      }
      return {
        jobId: existingJob.id,
        state: existingJob.state,
        queued: false,
        deduped: true,
        alreadyDownloaded: false,
        filePath: existingJob.filePath || null,
        track: storedTrack,
      };
    }

    const job = this.db.createDownloadJob({
      track_id: storedTrack.id,
      spotify_id: storedTrack.spotify_id || null,
      intent,
      state: 'queued',
      progress: 0,
      attempt_count: 0,
      auto_play: autoPlay,
      title: storedTrack.title || null,
      artist: storedTrack.artist || null,
      requested_at: nowIso(),
      updated_at: nowIso(),
    });
    this.logJob(job.id, `Queued "${job.artist || 'Unknown Artist'} - ${job.title || 'Unknown Title'}"`);
    this.emitChange(job);
    this.processQueue();
    return {
      jobId: job.id,
      state: job.state,
      queued: true,
      deduped: false,
      alreadyDownloaded: false,
      filePath: null,
      track: storedTrack,
    };
  }

  async enqueueMany(tracks, options = {}) {
    let queued = 0;
    let deduped = 0;
    let alreadyDownloaded = 0;
    const jobIds = [];
    for (const track of tracks || []) {
      const result = await this.enqueue(track, options);
      if (result.queued) queued += 1;
      else if (result.deduped) deduped += 1;
      else if (result.alreadyDownloaded) alreadyDownloaded += 1;
      if (result.jobId) jobIds.push(result.jobId);
    }
    return {
      total: Array.isArray(tracks) ? tracks.length : 0,
      queued,
      deduped,
      alreadyDownloaded,
      jobIds,
    };
  }

  cancel(jobId, options = {}) {
    const job = this.db.getDownloadJobById(jobId);
    if (!job) return { cancelled: false, reason: 'not_found' };

    if (job.state === 'completed' || job.state === 'failed' || job.state === 'cancelled') {
      return { cancelled: false, state: job.state };
    }

    if (this.currentRun?.jobId === jobId) {
      this.currentRun.cancelled = true;
      this.currentRun.suppressTerminalState = !!options.suppressTerminalState;
      try {
        this.currentRun.proc.kill();
      } catch {}
      return { cancelled: true, state: 'running' };
    }

    const cancelledJob = this.db.updateDownloadJob(jobId, {
      state: 'cancelled',
      last_error: 'Cancelled by user',
      updated_at: nowIso(),
    });
    this.emitChange(cancelledJob);
    setImmediate(() => this.processQueue());
    return { cancelled: true, state: cancelledJob?.state || 'cancelled' };
  }

  cancelAll(options = {}) {
    const activeJobs = this.db.listDownloadJobs(['queued', 'running']);
    for (const job of activeJobs) {
      this.cancel(job.id, options);
    }
    return { cancelled: activeJobs.length };
  }

  retry(target) {
    const requeued = [];
    if (target === 'allFailed') {
      for (const job of this.db.listDownloadJobs(['failed'])) {
        const nextJob = this.db.resetDownloadJobForRetry(job.id);
        if (nextJob) requeued.push(nextJob);
      }
    } else {
      const job = this.db.getDownloadJobById(target);
      if (job && (job.state === 'failed' || job.state === 'cancelled')) {
        const nextJob = this.db.resetDownloadJobForRetry(job.id);
        if (nextJob) requeued.push(nextJob);
      }
    }
    this.emitChange();
    this.processQueue();
    return { requeued: requeued.length, jobIds: requeued.map(job => job.id) };
  }

  clearHistory() {
    const snapshot = this.db.clearDownloadHistory();
    this.emitChange();
    return snapshot;
  }

  clearAllJobs() {
    this.cancelAll({ suppressTerminalState: true });
    const snapshot = this.db.clearAllDownloadJobs();
    this.emitChange();
    return snapshot;
  }

  async processQueue() {
    if (this.processing) return;
    this.processing = true;
    try {
      while (true) {
        const nextJob = this.db.getNextQueuedDownloadJob();
        if (!nextJob) break;
        await this.runJob(nextJob.id);
      }
    } finally {
      this.processing = false;
      if (!this.currentRun && this.db.getDownloadStats().active > 0) {
        setImmediate(() => this.processQueue());
      }
    }
  }

  async runJob(jobId) {
    let job = this.db.getDownloadJobById(jobId);
    if (!job || job.state !== 'queued') return;

    const track = job.trackId
      ? this.db.getTrackById(job.trackId)
      : (job.spotifyId ? this.db.getTrackBySpotifyId(job.spotifyId) : null);

    if (!track) {
      const failedJob = this.db.updateDownloadJob(jobId, {
        state: 'failed',
        progress: 0,
        last_error: 'Track record missing from library',
        updated_at: nowIso(),
      });
      this.logJob(jobId, 'Failed: track record missing from library');
      this.emitChange(failedJob);
      return;
    }

    if (this.isDownloadedLocally(track)) {
      const completedJob = this.db.updateDownloadJob(jobId, {
        state: 'completed',
        progress: 100,
        file_path: track.file_path,
        last_error: null,
        updated_at: nowIso(),
        title: track.title || job.title,
        artist: track.artist || job.artist,
      });
      this.emitChange(completedJob);
      return;
    }

    job = this.db.updateDownloadJob(jobId, {
      state: 'running',
      progress: 0,
      attempt_count: (job.attemptCount || 0) + 1,
      last_error: null,
      updated_at: nowIso(),
      title: track.title || job.title,
      artist: track.artist || job.artist,
    });
    this.emitChange(job);
    this.logJob(job.id, `Starting attempt ${job.attemptCount} for "${job.artist || 'Unknown Artist'} - ${job.title || 'Unknown Title'}"`);

    const result = await this.executeDownload(job, track);
    if (!this.db.getDownloadJobById(jobId) && result.suppress) {
      return;
    }

    if (result.cancelled) {
      if (result.suppress) return;
      const cancelledJob = this.db.updateDownloadJob(jobId, {
        state: 'cancelled',
        last_error: 'Cancelled by user',
        updated_at: nowIso(),
      });
      this.logJob(jobId, 'Cancelled by user');
      this.emitChange(cancelledJob);
      return;
    }

    if (result.success) {
      this.db.updateTrackDownloaded(track.id, result.filePath);
      const completedJob = this.db.updateDownloadJob(jobId, {
        state: 'completed',
        progress: 100,
        file_path: result.filePath,
        last_error: null,
        updated_at: nowIso(),
      });
      this.logJob(jobId, `Completed: ${result.filePath}`);
      this.emitChange(completedJob);
      return;
    }

    const latestJob = this.db.getDownloadJobById(jobId);
    if (!latestJob) return;

    if (latestJob.attemptCount <= MAX_AUTO_RETRIES) {
      const delayMs = RETRY_DELAYS_MS[Math.min(latestJob.attemptCount - 1, RETRY_DELAYS_MS.length - 1)];
      const requeuedJob = this.db.updateDownloadJob(jobId, {
        state: 'queued',
        progress: 0,
        last_error: result.error,
        updated_at: nowIso(),
      });
      this.logJob(jobId, `Attempt ${latestJob.attemptCount} failed, retrying in ${delayMs}ms: ${result.error}`);
      this.emitChange(requeuedJob);
      await sleep(delayMs);
      return;
    }

    const failedJob = this.db.updateDownloadJob(jobId, {
      state: 'failed',
      progress: 0,
      last_error: result.error,
      updated_at: nowIso(),
    });
    this.logJob(jobId, `Failed permanently: ${result.error}`);
    this.emitChange(failedJob);
  }

  async executeDownload(job, track) {
    const downloadDir = this.getDownloadPath();
    const tempDir = path.join(this.getTempRoot(), job.id);
    const spaceError = this.checkDiskSpace(downloadDir);
    if (spaceError) return { success: false, error: spaceError };

    const existingYtDlp = this.findYtDlp();
    if (!existingYtDlp && this.canAutoInstallYtDlp()) {
      this.logJob(job.id, 'yt-dlp not found locally, downloading managed copy...');
    }

    const ytDlp = await this.ensureYtDlp();
    if (!ytDlp) {
      return {
        success: false,
        error: this.lastYtDlpBootstrapError
          ? `yt-dlp not available: ${this.lastYtDlpBootstrapError}`
          : 'yt-dlp not found',
      };
    }
    const ffmpeg = this.findFfmpegSuite();

    this.cleanupTempDir(tempDir);
    fs.mkdirSync(tempDir, { recursive: true });

    const audioFormat = String(this.db.getSetting('audio.format', 'mp3'));
    const audioQuality = String(this.db.getSetting('audio.quality', '0'));
    const plan = this.getAudioDownloadPlan(audioFormat, audioQuality, ffmpeg);
    const outTemplate = path.join(tempDir, 'source.%(ext)s');
    const env = this.buildProcessEnv(ffmpeg.pathEntries);
    if (this.getJsRuntimeArg()) {
      env.ELECTRON_RUN_AS_NODE = '1';
    }
    const target = this.resolveDownloadTarget(ytDlp, track, env, job.id);
    const args = [
      target.url,
      ...(this.getJsRuntimeArg() ? ['--js-runtimes', this.getJsRuntimeArg()] : []),
      ...(ffmpeg.available && ffmpeg.locationArg ? ['--ffmpeg-location', ffmpeg.locationArg] : []),
      ...plan.args,
      '-o', outTemplate,
      '--no-playlist',
      '--socket-timeout', '30',
      '--retries', '3',
      '--no-part',
      '--newline',
    ];
    if (plan.note) this.logJob(job.id, plan.note);

    return new Promise((resolve) => {
      const proc = spawn(ytDlp, args, {
        windowsHide: true,
        env,
      });
      const runtime = {
        jobId: job.id,
        trackId: job.trackId,
        proc,
        cancelled: false,
        suppressTerminalState: false,
      };
      this.currentRun = runtime;

      let stderrOutput = '';
      let lastProgress = -1;

      const handleChunk = (chunk) => {
        const text = chunk.toString();
        if (text.trim()) this.logJob(job.id, text.trim());
        const progress = this.parseProgress(text);
        if (progress == null) return;
        const rounded = Math.round(progress);
        if (rounded === lastProgress) return;
        lastProgress = rounded;
        const progressJob = this.db.updateDownloadJob(job.id, {
          progress: rounded,
          updated_at: nowIso(),
        });
        if (progressJob) this.emitChange(progressJob);
      };

      proc.stdout.on('data', handleChunk);
      proc.stderr.on('data', (chunk) => {
        stderrOutput += chunk.toString();
        handleChunk(chunk);
      });

      proc.on('error', (error) => {
        this.currentRun = null;
        this.cleanupTempDir(tempDir);
        resolve({ success: false, error: error.message });
      });

      proc.on('close', (code) => {
        const cancelled = runtime.cancelled;
        const suppress = runtime.suppressTerminalState;
        this.currentRun = null;

        if (cancelled) {
          this.cleanupTempDir(tempDir);
          resolve({ cancelled: true, suppress });
          return;
        }

        if (code === 0) {
          try {
            const tempFile = this.findDownloadedTempFile(tempDir);
            if (!tempFile) {
              this.cleanupTempDir(tempDir);
              resolve({ success: false, error: 'Download completed but no audio file was produced' });
              return;
            }
            const finalPath = this.finalizeDownloadedFile(track, tempFile);
            this.cleanupTempDir(tempDir);
            resolve({ success: true, filePath: finalPath });
            return;
          } catch (error) {
            this.cleanupTempDir(tempDir);
            resolve({ success: false, error: error.message });
            return;
          }
        }

        this.cleanupTempDir(tempDir);
        resolve({
          success: false,
          error: this.summarizeYtDlpFailure(code, stderrOutput),
        });
      });
    });
  }
}

module.exports = {
  DownloadManager,
};
