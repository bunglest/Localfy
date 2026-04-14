const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const AUDIO_EXTENSIONS = /\.(mp3|m4a|opus|ogg|webm)$/i;
const MAX_AUTO_RETRIES = 2;
const RETRY_DELAYS_MS = [1500, 4000];

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

  findYtDlp() {
    const candidates = [
      'yt-dlp',
      'yt-dlp.exe',
      path.join(this.app.getPath('userData'), 'yt-dlp.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'yt-dlp', 'yt-dlp.exe'),
    ];
    for (const candidate of candidates) {
      try {
        execSync(`"${candidate}" --version`, { stdio: 'ignore', timeout: 5000 });
        return candidate;
      } catch {}
    }
    return null;
  }

  checkYtDlp() {
    const ytDlp = this.findYtDlp();
    return { available: !!ytDlp, path: ytDlp };
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

    const ytDlp = this.findYtDlp();
    if (!ytDlp) return { success: false, error: 'yt-dlp not found' };

    this.cleanupTempDir(tempDir);
    fs.mkdirSync(tempDir, { recursive: true });

    const audioFormat = String(this.db.getSetting('audio.format', 'mp3'));
    const audioQuality = String(this.db.getSetting('audio.quality', '0'));
    const outTemplate = path.join(tempDir, 'source.%(ext)s');
    const query = [track.artist, track.title, 'audio'].filter(Boolean).join(' ');
    const args = [
      `ytsearch1:${query}`,
      '-x',
      '--audio-format', audioFormat,
      '--audio-quality', audioQuality,
      '-o', outTemplate,
      '--no-playlist',
      '--socket-timeout', '30',
      '--retries', '3',
      '--no-part',
      '--newline',
    ];

    return new Promise((resolve) => {
      const proc = spawn(ytDlp, args, { windowsHide: true });
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
        const trimmed = stderrOutput.trim().replace(/\s+/g, ' ').substring(0, 500);
        resolve({
          success: false,
          error: trimmed ? `yt-dlp exited with code ${code}: ${trimmed}` : `yt-dlp exited with code ${code}`,
        });
      });
    });
  }
}

module.exports = {
  DownloadManager,
};
