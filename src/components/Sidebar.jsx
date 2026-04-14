import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useLibraryStore, useDownloadStore, useToastStore, useUIStore } from '../store';
import ConfirmDialog from './ConfirmDialog';
import {
  HomeIcon, SearchIcon, LibraryIcon, HeartIcon, DownloadIcon, SettingsIcon,
  FolderIcon, ChevronIcon, PlusIcon, MusicIcon, DiscoverIcon, StatsIcon
} from './Icons';

export default function Sidebar() {
  const { playlists, folders, loadPlaylists } = useLibraryStore();
  const { stats } = useDownloadStore();
  const { add: toast } = useToastStore();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const navigate = useNavigate();

  const [openFolders, setOpenFolders] = useState({});
  const [contextMenu, setContextMenu] = useState(null);

  useEffect(() => { loadPlaylists(); }, []);

  const toggleFolder = (id) => setOpenFolders(s => ({ ...s, [id]: !s[id] }));

  // Group playlists by folder
  const folderPlaylists = {};
  const rootPlaylists = [];
  for (const pl of playlists) {
    if (pl.folder_id) {
      if (!folderPlaylists[pl.folder_id]) folderPlaylists[pl.folder_id] = [];
      folderPlaylists[pl.folder_id].push(pl);
    } else {
      rootPlaylists.push(pl);
    }
  }

  const queueCount = stats.active || ((stats.queued || 0) + (stats.running || 0));

  return (
    <aside className={`sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          {/* Concentric sound-wave arcs anchored bottom-left — forms an "L" */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="3" cy="13" r="1.8" fill="white"/>
            <path d="M3 8.5 a4.5 4.5 0 0 1 4.5 4.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
            <path d="M3 4 a9 9 0 0 1 9 9" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.5"/>
          </svg>
        </div>
        <span className="sidebar-logo-text">Localfy</span>
      </div>

      {/* Main Nav */}
      <nav className="sidebar-nav" aria-label="Main navigation">
        <NavLink to="/" end className={({isActive}) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
          <HomeIcon size={17} /> Home
        </NavLink>
        <NavLink to="/search" className={({isActive}) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
          <SearchIcon size={17} /> Search
        </NavLink>
        <NavLink to="/library" className={({isActive}) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
          <LibraryIcon size={17} /> Library
        </NavLink>
        <NavLink to="/liked" className={({isActive}) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
          <HeartIcon size={17} /> Liked Songs
        </NavLink>
        <NavLink to="/downloads" className={({isActive}) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
          <DownloadIcon size={17} />
          <span>Downloads</span>
          {queueCount > 0 && (
            <span style={{
              marginLeft: 'auto',
              background: 'var(--pink)',
              color: '#fff',
              borderRadius: '999px',
              padding: '1px 7px',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
            }}>
              {queueCount}
            </span>
          )}
        </NavLink>
        <NavLink to="/discover" className={({isActive}) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
          <DiscoverIcon size={17} /> Discover
        </NavLink>
        <NavLink to="/stats" className={({isActive}) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
          <StatsIcon size={17} /> Stats
        </NavLink>
        <NavLink to="/settings" className={({isActive}) => `sidebar-nav-item ${isActive ? 'active' : ''}`}>
          <SettingsIcon size={17} /> Settings
        </NavLink>
      </nav>

      {/* Playlists */}
      <div className="sidebar-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>Playlists</span>
        <button
          title="New playlist"
          onClick={async () => {
            try {
              const id = await window.localfy.dbCreatePlaylist('New Playlist', null);
              await loadPlaylists();
              navigate(`/playlist/${id}?new=1`);
            } catch (e) {
              toast('Could not create playlist', 'error');
            }
          }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', padding: '2px 4px', borderRadius: 4,
            display: 'flex', alignItems: 'center',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-1)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
        >
          <PlusIcon size={14} />
        </button>
      </div>

      <div className="sidebar-playlists">
        {/* Folder groups */}
        {folders.map(folder => (
          <FolderItem key={folder.id} folder={folder} isOpen={openFolders[folder.id]} onToggle={() => toggleFolder(folder.id)} folderPlaylists={folderPlaylists[folder.id] || []} navigate={navigate} />
        ))}

        {/* Root playlists */}
        {rootPlaylists.map(pl => (
          <PlaylistItem key={pl.id} pl={pl} navigate={navigate} />
        ))}

        {playlists.length === 0 && (
          <div style={{
            padding: '20px 12px',
            color: 'var(--text-3)',
            fontSize: '12px',
            textAlign: 'center',
            lineHeight: 1.6,
          }}>
            Import playlists from Settings
          </div>
        )}
      </div>

      {/* Collapse/expand toggle */}
      <button
        onClick={toggleSidebar}
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-3)', padding: '10px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'color 0.15s',
          marginTop: 'auto', flexShrink: 0,
        }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--text-1)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: sidebarCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
    </aside>
  );
}

function FolderItem({ folder, isOpen, onToggle, folderPlaylists, navigate }) {
  const { loadPlaylists } = useLibraryStore();
  const { add: toast } = useToastStore();
  const [contextMenu, setContextMenu] = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleRenameFolder = async () => {
    const newName = window.prompt('Rename folder', folder.name);
    if (newName && newName !== folder.name) {
      try {
        await window.localfy.dbRenameFolder(folder.id, newName);
        await loadPlaylists();
        toast(`Folder renamed to "${newName}"`, 'success');
      } catch (e) {
        toast('Failed to rename folder', 'error');
      }
    }
    setContextMenu(null);
  };

  const handleDeleteFolder = () => {
    setConfirmState({
      title: 'Delete folder',
      message: `Delete folder "${folder.name}"? Playlists will not be deleted.`,
      onConfirm: async () => {
        try {
          await window.localfy.dbDeleteFolder(folder.id);
          await loadPlaylists();
          toast('Folder deleted', 'success');
        } catch (e) {
          toast('Failed to delete folder', 'error');
        }
        setConfirmState(null);
      },
    });
    setContextMenu(null);
  };

  return (
    <div>
      <div className="sidebar-folder" onClick={onToggle} onContextMenu={handleContextMenu}>
        <ChevronIcon size={12} dir={isOpen ? 'down' : 'right'} />
        <FolderIcon size={13} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {folder.name}
        </span>
      </div>
      {isOpen && (
        <div className="folder-children">
          {folderPlaylists.map(pl => (
            <PlaylistItem key={pl.id} pl={pl} navigate={navigate} />
          ))}
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            { label: 'Rename', onClick: handleRenameFolder },
            { label: 'Delete', onClick: handleDeleteFolder, danger: true },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}

function PlaylistItem({ pl, navigate }) {
  const { loadPlaylists, folders } = useLibraryStore();
  const { add: toast } = useToastStore();
  const [contextMenu, setContextMenu] = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleRename = async () => {
    const newName = window.prompt('Rename playlist', pl.name);
    if (newName && newName !== pl.name) {
      try {
        await window.localfy.dbRenamePlaylist(pl.id, newName);
        await loadPlaylists();
        toast(`Renamed to "${newName}"`, 'success');
      } catch (e) {
        toast('Failed to rename playlist', 'error');
      }
    }
    setContextMenu(null);
  };

  const handleDelete = () => {
    setConfirmState({
      title: 'Delete playlist',
      message: `Delete "${pl.name}"? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await window.localfy.dbDeletePlaylist(pl.id);
          await loadPlaylists();
          toast('Playlist deleted', 'success');
        } catch (e) {
          toast('Failed to delete playlist', 'error');
        }
        setConfirmState(null);
      },
    });
    setContextMenu(null);
  };

  const handleMoveToFolder = async () => {
    if (folders.length === 0) {
      toast('No folders available', 'info');
      setContextMenu(null);
      return;
    }
    const folderNames = folders.map(f => f.name).join('\n');
    const selectedFolder = window.prompt(`Select a folder:\n${folderNames}`, folders[0]?.name || '');
    if (selectedFolder) {
      const folder = folders.find(f => f.name === selectedFolder);
      if (folder) {
        try {
          await window.localfy.dbMovePlaylist(pl.id, folder.id);
          await loadPlaylists();
          toast(`Moved to "${selectedFolder}"`, 'success');
        } catch (e) {
          toast('Failed to move playlist', 'error');
        }
      }
    }
    setContextMenu(null);
  };

  const handleRemoveFromFolder = async () => {
    if (pl.folder_id) {
      try {
        await window.localfy.dbMovePlaylist(pl.id, null);
        await loadPlaylists();
        toast('Removed from folder', 'success');
      } catch (e) {
        toast('Failed to remove from folder', 'error');
      }
    }
    setContextMenu(null);
  };

  return (
    <>
      <div
        className="sidebar-playlist-item"
        onClick={() => navigate(`/playlist/${pl.id}`)}
        onContextMenu={handleContextMenu}
      >
        {pl.image_url ? (
          <img src={pl.image_url} alt="" className="sidebar-playlist-art" />
        ) : (
          <div className="sidebar-playlist-art" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
            <MusicIcon size={12} />
          </div>
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pl.name}
        </span>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            { label: 'Rename', onClick: handleRename },
            { label: 'Move to Folder', onClick: handleMoveToFolder },
            ...(pl.folder_id ? [{ label: 'Remove from Folder', onClick: handleRemoveFromFolder }] : []),
            { label: 'Delete', onClick: handleDelete, danger: true },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </>
  );
}

function ContextMenu({ x, y, items, onClose }) {
  useEffect(() => {
    const handleClick = () => onClose();
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed',
      left: `${x}px`,
      top: `${y}px`,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      overflow: 'hidden',
      zIndex: 9999,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      minWidth: 150,
    }}>
      {items.map((item, i) => (
        <div key={i}>
          <button
            onClick={item.onClick}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'none',
              border: 'none',
              color: item.danger ? 'var(--red)' : 'var(--text-1)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'var(--font-body)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}
