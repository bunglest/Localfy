import React, { useEffect, useState } from 'react';
import { useAuthStore, useLibraryStore, useDownloadStore, useToastStore } from '../store';
import { ImportIcon, TrashIcon, CheckIcon, FolderIcon, AlertIcon, PlusIcon, RefreshIcon } from '../components/Icons';

export default function Settings() {
  const { user, logout } = useAuthStore();
  const { loadPlaylists, loadLiked, playlists, folders } = useLibraryStore();
  const { loadStats, stats } = useDownloadStore();
  const { add: toast } = useToastStore();

  const [downloadPath, setDownloadPath] = useState('');
  const [importingLiked, setImportingLiked] = useState(false);
  const [importingPlaylists, setImportingPlaylists] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [newFolder, setNewFolder] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newPlaylist, setNewPlaylist] = useState({ name: '', folderId: '' });
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [ytDlpStatus, setYtDlpStatus] = useState(null);
  const [appVersion, setAppVersion] = useState('');
  const [discordClientId, setDiscordClientId] = useState('');
  const [discordSaving, setDiscordSaving] = useState(false);

  useEffect(() => {
    loadDownloadPath();
    loadStats();
    checkYtDlp();
    window.localfy.getVersion().then(v => setAppVersion(v)).catch(() => {});
    window.localfy.discordGetClientId().then(id => setDiscordClientId(id || '')).catch(() => {});
    loadPlaylists();

    const unsub = window.localfy.onImportProgress((data) => {
      setImportProgress(data);
      if (data.imported >= data.total) {
        setImportingLiked(false);
        setImportingPlaylists(false);
        setTimeout(() => setImportProgress(null), 2000);
      }
    });
    return unsub;
  }, []);

  const loadDownloadPath = async () => {
    const p = await window.localfy.settingsGetDownloadPath();
    setDownloadPath(p || '');
  };

  const checkYtDlp = async () => {
    const r = await window.localfy.downloadCheckYtDlp();
    setYtDlpStatus(r);
  };

  const handleChoosePath = async () => {
    const p = await window.localfy.settingsChooseDownloadPath();
    if (p) { setDownloadPath(p); toast('Download folder updated', 'success'); }
  };

  const handleImportLiked = async () => {
    setImportingLiked(true);
    try {
      const r = await window.localfy.importLikedSongs();
      if (r.success) {
        await loadLiked();
        toast(`Imported ${r.imported} liked songs`, 'success');
      } else { toast('Import failed: ' + r.error, 'error'); }
    } catch (e) { toast(e.message, 'error'); }
    finally { setImportingLiked(false); setImportProgress(null); }
  };

  const handleImportPlaylists = async () => {
    setImportingPlaylists(true);
    try {
      const r = await window.localfy.importPlaylists();
      if (r.success) {
        await loadPlaylists();
        toast(`Imported ${r.imported} playlists`, 'success');
      } else { toast('Import failed: ' + r.error, 'error'); }
    } catch (e) { toast(e.message, 'error'); }
    finally { setImportingPlaylists(false); setImportProgress(null); }
  };

  const handleDeleteAll = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeletingAll(true);
    try {
      const r = await window.localfy.settingsDeleteAllFiles();
      if (r.success) {
        await loadStats();
        toast(`Deleted ${r.deleted} files`, 'success');
      } else { toast('Delete failed: ' + r.error, 'error'); }
    } catch (e) { toast(e.message, 'error'); }
    finally { setDeletingAll(false); setConfirmDelete(false); }
  };

  const handleCreateFolder = async () => {
    if (!newFolder.trim()) return;
    await window.localfy.dbCreateFolder(newFolder.trim());
    setNewFolder(''); setShowNewFolder(false);
    await loadPlaylists();
    toast('Folder created', 'success');
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylist.name.trim()) return;
    await window.localfy.dbCreatePlaylist(newPlaylist.name.trim(), newPlaylist.folderId || null);
    setNewPlaylist({ name: '', folderId: '' }); setShowNewPlaylist(false);
    await loadPlaylists();
    toast('Playlist created', 'success');
  };

  const handleDeleteFolder = async (id) => {
    await window.localfy.dbDeleteFolder(id);
    await loadPlaylists();
    toast('Folder deleted', 'info');
  };

  const handleDeletePlaylist = async (id) => {
    await window.localfy.dbDeletePlaylist(id);
    await loadPlaylists();
    toast('Playlist deleted', 'info');
  };

  const handleSaveDiscord = async () => {
    setDiscordSaving(true);
    try {
      await window.localfy.discordSetClientId(discordClientId.trim());
      toast(discordClientId.trim() ? 'Discord Rich Presence enabled!' : 'Discord Rich Presence disabled', 'success');
    } catch (e) {
      toast('Failed to save Discord settings', 'error');
    } finally {
      setDiscordSaving(false);
    }
  };

  return (
    <div style={{ padding: '28px 28px 60px', maxWidth: 720 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, letterSpacing: -0.8, marginBottom: 32 }}>
        Settings
      </h1>

      {/* Account */}
      <SettingsSection title="Account">
        {user && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            marginBottom: 12,
          }}>
            {user.images?.[0]?.url ? (
              <img src={user.images[0].url} alt="" style={{ width: 48, height: 48, borderRadius: '50%' }} />
            ) : (
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 20 }}>👤</span>
              </div>
            )}
            <div>
              <div style={{ fontWeight: 600 }}>{user.display_name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{user.email}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                {user.product === 'premium' ? '✦ Spotify Premium' : 'Spotify Free'}
              </div>
            </div>
            <button className="btn btn-outline btn-sm" style={{ marginLeft: 'auto', borderColor: 'rgba(255,71,87,0.4)', color: 'var(--red)' }}
              onClick={async () => { await logout(); toast('Logged out', 'info'); }}>
              Sign Out
            </button>
          </div>
        )}
      </SettingsSection>

      {/* Import */}
      <SettingsSection title="Import">
        <SettingRow
          label="Import Liked Songs"
          desc="Pull all your Spotify liked songs into Localfy's local database"
        >
          <button className="btn btn-outline btn-sm" onClick={handleImportLiked} disabled={importingLiked}>
            <ImportIcon size={13} />
            {importingLiked ? `${importProgress?.imported || 0}/${importProgress?.total || '…'}` : 'Import'}
          </button>
        </SettingRow>
        <SettingRow
          label="Import Playlists"
          desc="Import all your Spotify playlists and their tracks"
        >
          <button className="btn btn-outline btn-sm" onClick={handleImportPlaylists} disabled={importingPlaylists}>
            <ImportIcon size={13} />
            {importingPlaylists ? `${importProgress?.imported || 0}/${importProgress?.total || '…'} playlists` : 'Import'}
          </button>
        </SettingRow>

        {importProgress && (
          <div style={{ marginTop: 8 }}>
            <div className="dl-status-bar">
              <div className="dl-status-fill" style={{ width: `${(importProgress.imported / (importProgress.total || 1)) * 100}%` }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
              {importProgress.imported} / {importProgress.total} · {importProgress.type}
            </div>
          </div>
        )}
      </SettingsSection>

      {/* Download */}
      <SettingsSection title="Downloads">
        <SettingRow
          label="Download Folder"
          desc={downloadPath || 'Using default Music/Localfy folder'}
        >
          <button className="btn btn-outline btn-sm" onClick={handleChoosePath}>
            <FolderIcon size={13} /> Choose Folder
          </button>
        </SettingRow>

        <SettingRow
          label="yt-dlp Status"
          desc={ytDlpStatus?.available
            ? `Found at: ${ytDlpStatus.path || 'yt-dlp'}`
            : 'Not installed — required for downloading'}
        >
          {ytDlpStatus?.available
            ? <span className="badge badge-green"><CheckIcon size={11} /> Installed</span>
            : <button className="btn btn-outline btn-sm" onClick={() => window.localfy.openExternal('https://github.com/yt-dlp/yt-dlp/releases')}>
                Install yt-dlp
              </button>
          }
        </SettingRow>

        <SettingRow
          label="Downloaded Songs"
          desc={`${stats.done || 0} songs downloaded`}
        >
          <button
            className={`btn btn-sm ${confirmDelete ? 'btn-danger' : 'btn-outline'}`}
            onClick={handleDeleteAll}
            disabled={deletingAll}
            style={confirmDelete ? { animation: 'pulse 0.5s ease' } : {}}
          >
            <TrashIcon size={13} />
            {deletingAll ? 'Deleting…' : confirmDelete ? 'Confirm Delete All?' : 'Delete All Downloads'}
          </button>
        </SettingRow>
        {confirmDelete && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
            Click again to confirm. This will delete all downloaded MP3 files.{' '}
            <span style={{ color: 'var(--pink)', cursor: 'pointer' }} onClick={() => setConfirmDelete(false)}>Cancel</span>
          </div>
        )}
      </SettingsSection>

      {/* Playlist Folders */}
      <SettingsSection title="Playlist Folders">
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setShowNewFolder(s => !s)}>
            <PlusIcon size={13} /> New Folder
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setShowNewPlaylist(s => !s)}>
            <PlusIcon size={13} /> New Playlist
          </button>
        </div>

        {showNewFolder && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input className="input-field" style={{ flex: 1 }} placeholder="Folder name…"
              value={newFolder} onChange={e => setNewFolder(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateFolder()} autoFocus />
            <button className="btn btn-primary btn-sm" onClick={handleCreateFolder}>Create</button>
          </div>
        )}

        {showNewPlaylist && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input className="input-field" style={{ flex: 1, minWidth: 180 }} placeholder="Playlist name…"
              value={newPlaylist.name} onChange={e => setNewPlaylist(s => ({ ...s, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleCreatePlaylist()} autoFocus />
            <select className="input-field" style={{ width: 160 }}
              value={newPlaylist.folderId} onChange={e => setNewPlaylist(s => ({ ...s, folderId: e.target.value }))}>
              <option value="">No folder</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={handleCreatePlaylist}>Create</button>
          </div>
        )}

        {folders.length === 0 && playlists.length === 0 && (
          <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '8px 0' }}>
            No folders or playlists. Import from Spotify or create local ones.
          </div>
        )}

        {folders.map(folder => (
          <div key={folder.id} style={{ marginBottom: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            }}>
              <FolderIcon size={14} style={{ color: 'var(--text-3)' }} />
              <span style={{ fontWeight: 600, flex: 1 }}>{folder.name}</span>
              <button className="track-action-btn" onClick={() => handleDeleteFolder(folder.id)} title="Delete folder">
                <TrashIcon size={13} />
              </button>
            </div>
          </div>
        ))}

        {playlists.filter(p => p.is_local).map(pl => (
          <div key={pl.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 4,
          }}>
            <span style={{ flex: 1, fontSize: 13 }}>{pl.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>Local</span>
            <button className="track-action-btn" onClick={() => handleDeletePlaylist(pl.id)} title="Delete">
              <TrashIcon size={13} />
            </button>
          </div>
        ))}
      </SettingsSection>

      {/* Discord Rich Presence */}
      <SettingsSection title="Discord Rich Presence">
        <SettingRow
          label="Discord Application ID"
          desc={
            <>
              Create an app at{' '}
              <span style={{ color: 'var(--pink)', cursor: 'pointer' }} onClick={() => window.localfy.openExternal('https://discord.com/developers/applications')}>
                discord.com/developers
              </span>
              {' '}and paste the Application ID here
            </>
          }
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input-field"
              style={{ width: 180, fontFamily: 'var(--font-mono)', fontSize: 12 }}
              placeholder="Application ID…"
              value={discordClientId}
              onChange={e => setDiscordClientId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveDiscord()}
            />
            <button className="btn btn-primary btn-sm" onClick={handleSaveDiscord} disabled={discordSaving}>
              {discordSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </SettingRow>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.6 }}>
          When enabled, Localfy shows the track you're currently playing on your Discord profile. Leave blank to disable.
        </div>
      </SettingsSection>

      {/* About */}
      <SettingsSection title="About">
        <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.8 }}>
          <div><strong style={{ color: 'var(--text-1)' }}>Localfy</strong>{appVersion ? ` v${appVersion}` : ''}</div>
          <div>A personal Spotify-powered music downloader.</div>
          <div style={{ marginTop: 8 }}>
            <span style={{ color: 'var(--pink)', cursor: 'pointer' }}
              onClick={() => window.localfy.openExternal('https://github.com/yt-dlp/yt-dlp')}>
              yt-dlp
            </span>{' '}·{' '}
            <span style={{ color: 'var(--pink)', cursor: 'pointer' }}
              onClick={() => window.localfy.openExternal('https://developer.spotify.com')}>
              Spotify API
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)' }}>
            For personal use only. Respect copyright laws in your jurisdiction.
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}

function SettingsSection({ title, children }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
        letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-3)',
        marginBottom: 12, paddingBottom: 8,
        borderBottom: '1px solid var(--border)',
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function SettingRow({ label, desc, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }}>
          {desc}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}
