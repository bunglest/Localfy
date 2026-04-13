import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore, usePlayerStore } from '../store';
import {
  HomeIcon,
  SearchIcon,
  LibraryIcon,
  HeartIcon,
  DownloadIcon,
  DiscoverIcon,
  StatsIcon,
  SettingsIcon,
  PlayIcon,
  PauseIcon,
  SkipNextIcon,
  SkipPrevIcon,
  ShuffleIcon,
  RepeatIcon,
} from './Icons';

const commands = [
  // Navigation
  { id: 'nav-home', label: 'Go to Home', icon: HomeIcon, category: 'Navigate', action: 'navigate', path: '/', shortcut: 'Ctrl+1' },
  { id: 'nav-search', label: 'Go to Search', icon: SearchIcon, category: 'Navigate', action: 'navigate', path: '/search', shortcut: 'Ctrl+2' },
  { id: 'nav-library', label: 'Go to Library', icon: LibraryIcon, category: 'Navigate', action: 'navigate', path: '/library', shortcut: 'Ctrl+3' },
  { id: 'nav-liked', label: 'Go to Liked Songs', icon: HeartIcon, category: 'Navigate', action: 'navigate', path: '/liked', shortcut: 'Ctrl+4' },
  { id: 'nav-downloads', label: 'Go to Downloads', icon: DownloadIcon, category: 'Navigate', action: 'navigate', path: '/downloads', shortcut: 'Ctrl+5' },
  { id: 'nav-discover', label: 'Go to Discover', icon: DiscoverIcon, category: 'Navigate', action: 'navigate', path: '/discover', shortcut: 'Ctrl+6' },
  { id: 'nav-stats', label: 'Go to Stats', icon: StatsIcon, category: 'Navigate', action: 'navigate', path: '/stats', shortcut: 'Ctrl+7' },
  { id: 'nav-settings', label: 'Go to Settings', icon: SettingsIcon, category: 'Navigate', action: 'navigate', path: '/settings', shortcut: 'Ctrl+8' },
  // Player
  { id: 'player-playpause', label: 'Play / Pause', icon: PlayIcon, category: 'Player', action: 'player', method: 'playPause', shortcut: 'Space' },
  { id: 'player-next', label: 'Next Track', icon: SkipNextIcon, category: 'Player', action: 'player', method: 'next', shortcut: 'Ctrl+Right' },
  { id: 'player-prev', label: 'Previous Track', icon: SkipPrevIcon, category: 'Player', action: 'player', method: 'prev', shortcut: 'Ctrl+Left' },
  { id: 'player-shuffle', label: 'Toggle Shuffle', icon: ShuffleIcon, category: 'Player', action: 'player', method: 'toggleShuffle', shortcut: 'S' },
  { id: 'player-repeat', label: 'Toggle Repeat', icon: RepeatIcon, category: 'Player', action: 'player', method: 'toggleRepeat', shortcut: 'R' },
  // UI
  { id: 'ui-queue', label: 'Toggle Queue', icon: LibraryIcon, category: 'UI', action: 'ui', method: 'toggleQueue', shortcut: 'Q' },
  { id: 'ui-theme', label: 'Toggle Theme', icon: SettingsIcon, category: 'UI', action: 'ui', method: 'toggleTheme' },
  { id: 'ui-equalizer', label: 'Toggle Equalizer', icon: SettingsIcon, category: 'UI', action: 'ui', method: 'toggleEqualizer' },
];

export default function CommandPalette() {
  const navigate = useNavigate();
  const { showCommandPalette, toggleCommandPalette } = useUIStore();
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const lower = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(lower) ||
        cmd.category.toLowerCase().includes(lower)
    );
  }, [query]);

  useEffect(() => {
    if (showCommandPalette) {
      setQuery('');
      setSelectedIndex(0);
      // Slight delay to allow DOM to render
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [showCommandPalette]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const executeCommand = (cmd) => {
    toggleCommandPalette();
    if (cmd.action === 'navigate') {
      navigate(cmd.path);
    } else if (cmd.action === 'player') {
      const player = usePlayerStore.getState();
      if (typeof player[cmd.method] === 'function') {
        player[cmd.method]();
      }
    } else if (cmd.action === 'ui') {
      const ui = useUIStore.getState();
      if (typeof ui[cmd.method] === 'function') {
        ui[cmd.method]();
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        executeCommand(filtered[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      toggleCommandPalette();
    }
  };

  if (!showCommandPalette) return null;

  // Group by category
  let currentCategory = '';

  return (
    <div className="command-palette-overlay" onClick={toggleCommandPalette}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette-input"
          type="text"
          placeholder="Type a command..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="command-palette-results">
          {filtered.length === 0 ? (
            <div style={{ padding: '16px 20px', opacity: 0.5 }}>No results found</div>
          ) : (
            filtered.map((cmd, index) => {
              const showCategory = cmd.category !== currentCategory;
              if (showCategory) currentCategory = cmd.category;
              const Icon = cmd.icon;
              return (
                <React.Fragment key={cmd.id}>
                  {showCategory && (
                    <div
                      style={{
                        padding: '8px 20px 4px',
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        opacity: 0.4,
                      }}
                    >
                      {cmd.category}
                    </div>
                  )}
                  <div
                    className={`command-palette-item ${index === selectedIndex ? 'selected' : ''}`}
                    onClick={() => executeCommand(cmd)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {Icon && <Icon size={16} />}
                      <span>{cmd.label}</span>
                    </span>
                    {cmd.shortcut && (
                      <span
                        style={{
                          fontSize: 11,
                          opacity: 0.4,
                          background: 'var(--bg-tertiary, #333)',
                          padding: '2px 6px',
                          borderRadius: 4,
                        }}
                      >
                        {cmd.shortcut}
                      </span>
                    )}
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
