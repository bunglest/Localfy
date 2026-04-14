const { contextBridge, ipcRenderer } = require('electron');

const api = {
  // ─── Spotify Auth ──────────────────────────────────────────────────────────
  spotifyLogin: (clientId) => ipcRenderer.invoke('spotify:login', clientId),
  spotifyLogout: () => ipcRenderer.invoke('spotify:logout'),
  spotifyGetTokens: () => ipcRenderer.invoke('spotify:getTokens'),
  spotifyRefreshToken: () => ipcRenderer.invoke('spotify:refreshToken'),

  // ─── Spotify Data ──────────────────────────────────────────────────────────
  spotifyGetMe: () => ipcRenderer.invoke('spotify:getMe'),
  spotifyGetRecommendations: () => ipcRenderer.invoke('spotify:getRecommendations'),
  spotifyGetLikedSongs: (offset) => ipcRenderer.invoke('spotify:getLikedSongs', offset),
  spotifyGetPlaylists: () => ipcRenderer.invoke('spotify:getPlaylists'),
  spotifyGetPlaylist: (id) => ipcRenderer.invoke('spotify:getPlaylist', id),
  spotifySearch: (query) => ipcRenderer.invoke('spotify:search', query),
  spotifyGetRecentlyPlayed: () => ipcRenderer.invoke('spotify:getRecentlyPlayed'),
  spotifyGetFeatured: () => ipcRenderer.invoke('spotify:getFeatured'),
  spotifyGetNewReleases: () => ipcRenderer.invoke('spotify:getNewReleases'),
  spotifyGetCategories: () => ipcRenderer.invoke('spotify:getCategories'),
  spotifyGetArtist: (id) => ipcRenderer.invoke('spotify:getArtist', id),
  spotifyGetArtistTopTracks: (id) => ipcRenderer.invoke('spotify:getArtistTopTracks', id),
  spotifyGetArtistAlbums: (id) => ipcRenderer.invoke('spotify:getArtistAlbums', id),
  spotifyGetAlbumTracks: (id) => ipcRenderer.invoke('spotify:getAlbumTracks', id),
  spotifyGetRelatedArtists: (id) => ipcRenderer.invoke('spotify:getRelatedArtists', id),
  spotifyGetTopArtists: (range) => ipcRenderer.invoke('spotify:getTopArtists', range),
  spotifyGetDiscoverTracks: () => ipcRenderer.invoke('spotify:getDiscoverTracks'),
  getSmartRecommendations: () => ipcRenderer.invoke('recommendations:get'),

  // ─── Library / DB ──────────────────────────────────────────────────────────
  dbGetDownloaded: () => ipcRenderer.invoke('db:getDownloaded'),
  dbGetLiked: () => ipcRenderer.invoke('db:getLiked'),
  dbGetTrack: (query) => ipcRenderer.invoke('db:getTrack', query),
  dbGetPlaylists: () => ipcRenderer.invoke('db:getPlaylists'),
  dbGetPlaylistTracks: (id) => ipcRenderer.invoke('db:getPlaylistTracks', id),
  dbGetFolders: () => ipcRenderer.invoke('db:getFolders'),
  dbSearchTracks: (q) => ipcRenderer.invoke('db:searchTracks', q),
  dbCreatePlaylist: (name, folderId) => ipcRenderer.invoke('db:createPlaylist', name, folderId),
  dbDeletePlaylist: (id) => ipcRenderer.invoke('db:deletePlaylist', id),
  dbCreateFolder: (name) => ipcRenderer.invoke('db:createFolder', name),
  dbDeleteFolder: (id) => ipcRenderer.invoke('db:deleteFolder', id),
  dbMovePlaylist: (playlistId, folderId) => ipcRenderer.invoke('db:movePlaylist', playlistId, folderId),
  dbToggleLike: (track) => ipcRenderer.invoke('db:toggleLike', track),
  dbIncrementPlay: (id) => ipcRenderer.invoke('db:incrementPlay', id),
  dbDeleteAllDownloads: () => ipcRenderer.invoke('db:deleteAllDownloads'),
  dbRecordPlay: (trackId, durationMs) => ipcRenderer.invoke('db:recordPlay', trackId, durationMs),
  dbGetStatsData: () => ipcRenderer.invoke('db:getStatsData'),
  dbGetAllSpotifyIds: () => ipcRenderer.invoke('db:getAllSpotifyIds'),
  dbUpdatePlaylistImage: (playlistId, imagePath) => ipcRenderer.invoke('db:updatePlaylistImage', playlistId, imagePath),
  dbRenamePlaylist: (id, name) => ipcRenderer.invoke('db:renamePlaylist', id, name),
  dbRenameFolder: (id, name) => ipcRenderer.invoke('db:renameFolder', id, name),
  dbRemoveTrackFromPlaylist: (playlistId, trackId) => ipcRenderer.invoke('db:removeTrackFromPlaylist', playlistId, trackId),
  dbReorderPlaylistTrack: (playlistId, trackId, newPosition) => ipcRenderer.invoke('db:reorderPlaylistTrack', playlistId, trackId, newPosition),
  dbFindDuplicates: () => ipcRenderer.invoke('db:findDuplicates'),
  dbRecordSkip: (trackId, listenedMs, totalMs) => ipcRenderer.invoke('db:recordSkip', trackId, listenedMs, totalMs),
  dbRecordRecFeedback: (trackId, action, strategy) => ipcRenderer.invoke('db:recordRecFeedback', trackId, action, strategy),
  dbGetRecFeedbackStats: () => ipcRenderer.invoke('db:getRecFeedbackStats'),
  dbExport: () => ipcRenderer.invoke('db:export'),
  dbImport: () => ipcRenderer.invoke('db:import'),

  // ─── Downloads ─────────────────────────────────────────────────────────────
  downloadTrack: (track) => ipcRenderer.invoke('download:track', track),
  downloadAll: (tracks) => ipcRenderer.invoke('download:all', tracks),
  downloadGetStats: () => ipcRenderer.invoke('download:getStats'),
  downloadGetQueue: () => ipcRenderer.invoke('download:getQueue'),
  downloadClearQueue: () => ipcRenderer.invoke('download:clearQueue'),
  downloadCheckYtDlp: () => ipcRenderer.invoke('download:checkYtDlp'),
  downloadRetryFailed: () => ipcRenderer.invoke('download:retryFailed'),
  downloadCancel: (trackId) => ipcRenderer.invoke('download:cancel', trackId),
  onDownloadProgress: (cb) => {
    const listener = (_, data) => cb(data);
    ipcRenderer.on('download:progress', listener);
    return () => ipcRenderer.removeListener('download:progress', listener);
  },

  // ─── Import ────────────────────────────────────────────────────────────────
  importLikedSongs: () => ipcRenderer.invoke('import:likedSongs'),
  importPlaylists: () => ipcRenderer.invoke('import:playlists'),
  onImportProgress: (cb) => {
    const listener = (_, data) => cb(data);
    ipcRenderer.on('import:progress', listener);
    return () => ipcRenderer.removeListener('import:progress', listener);
  },

  // ─── Settings ──────────────────────────────────────────────────────────────
  settingsGet: (key, def) => ipcRenderer.invoke('settings:get', key, def),
  settingsSet: (key, val) => ipcRenderer.invoke('settings:set', key, val),
  settingsGetDownloadPath: () => ipcRenderer.invoke('settings:getDownloadPath'),
  settingsChooseDownloadPath: () => ipcRenderer.invoke('settings:chooseDownloadPath'),
  settingsDeleteAllFiles: () => ipcRenderer.invoke('settings:deleteAllFiles'),
  settingsChooseImage: () => ipcRenderer.invoke('settings:chooseImage'),

  // ─── Player (file path → local URL) ───────────────────────────────────────
  playerGetFileUrl: (filePath) => ipcRenderer.invoke('player:getFileUrl', filePath),

  // ─── Playlist Export / Import ───────────────────────────────────────────────
  playlistExport: (playlistId) => ipcRenderer.invoke('playlist:export', playlistId),
  playlistImport: () => ipcRenderer.invoke('playlist:import'),

  // ─── Network ──────────────────────────────────────────────────────────────
  networkStatus: () => ipcRenderer.invoke('network:status'),
  onOnlineChange: (cb) => {
    const listener = (_, data) => cb(data);
    ipcRenderer.on('online-status-changed', listener);
    return () => ipcRenderer.removeListener('online-status-changed', listener);
  },

  // ─── Media Keys ───────────────────────────────────────────────────────────
  onMediaPlayPause: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('media:playPause', listener);
    return () => ipcRenderer.removeListener('media:playPause', listener);
  },
  onMediaNext: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('media:next', listener);
    return () => ipcRenderer.removeListener('media:next', listener);
  },
  onMediaPrev: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('media:prev', listener);
    return () => ipcRenderer.removeListener('media:prev', listener);
  },

  // ─── Cache ────────────────────────────────────────────────────────────────
  cacheClear: () => ipcRenderer.invoke('cache:clear'),

  // ─── Window controls ───────────────────────────────────────────────────────
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),

  // ─── Discord RPC ───────────────────────────────────────────────────────────
  discordSetClientId: (id) => ipcRenderer.invoke('discord:setClientId', id),
  discordUpdatePresence: (data) => ipcRenderer.invoke('discord:updatePresence', data),
  discordClearPresence: () => ipcRenderer.invoke('discord:clearPresence'),
  discordGetClientId: () => ipcRenderer.invoke('discord:getClientId'),

  // ─── Auto-Updater ──────────────────────────────────────────────────────────
  updaterCheck: () => ipcRenderer.invoke('updater:check'),
  updaterDownload: () => ipcRenderer.invoke('updater:download'),
  updaterInstall: () => ipcRenderer.invoke('updater:install'),
  onUpdaterStatus: (cb) => {
    const listener = (_, data) => cb(data);
    ipcRenderer.on('updater:status', listener);
    return () => ipcRenderer.removeListener('updater:status', listener);
  },

  // ─── Misc ──────────────────────────────────────────────────────────────────
  openExternal: (url) => ipcRenderer.invoke('misc:openExternal', url),
  getVersion: () => ipcRenderer.invoke('misc:getVersion'),
};

contextBridge.exposeInMainWorld('localfy', api);
