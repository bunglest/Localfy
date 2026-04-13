import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore, useUIStore } from '../store';

export default function KeyboardShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

      const player = usePlayerStore.getState();
      const ui = useUIStore.getState();

      // Space: Play/Pause
      if (e.code === 'Space' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        player.playPause();
      }

      // Ctrl+K / Cmd+K: Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        ui.toggleCommandPalette();
      }

      // Ctrl+Right: Next track
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') {
        e.preventDefault();
        player.next();
      }

      // Ctrl+Left: Previous track
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') {
        e.preventDefault();
        player.prev();
      }

      // Ctrl+Up: Volume up
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowUp') {
        e.preventDefault();
        const newVol = Math.min(1, player.volume + 0.05);
        player.setVolume(newVol);
      }

      // Ctrl+Down: Volume down
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowDown') {
        e.preventDefault();
        const newVol = Math.max(0, player.volume - 0.05);
        player.setVolume(newVol);
      }

      // Q: Toggle queue
      if (e.key === 'q' && !e.ctrlKey && !e.metaKey) {
        ui.toggleQueue();
      }

      // M: Toggle mute (just set volume to 0 or restore)
      if (e.key === 'm' && !e.ctrlKey && !e.metaKey) {
        if (player.volume > 0) {
          player._prevVolume = player.volume;
          player.setVolume(0);
        } else {
          player.setVolume(player._prevVolume || 0.8);
        }
      }

      // S: Toggle shuffle
      if (e.key === 's' && !e.ctrlKey && !e.metaKey) {
        player.toggleShuffle();
      }

      // R: Toggle repeat
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
        player.toggleRepeat();
      }

      // Escape: Close panels
      if (e.key === 'Escape') {
        if (ui.showCommandPalette) ui.toggleCommandPalette();
        else if (ui.showQueue) ui.toggleQueue();
        else if (ui.showEqualizer) ui.toggleEqualizer();
        else if (ui.showLyrics) ui.toggleLyrics();
      }

      // Ctrl+1-8: Navigate to pages
      if (e.ctrlKey && e.key >= '1' && e.key <= '8') {
        e.preventDefault();
        const routes = ['/', '/search', '/library', '/liked', '/downloads', '/discover', '/stats', '/settings'];
        navigate(routes[parseInt(e.key) - 1]);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  // Also listen for media key events from main process
  useEffect(() => {
    if (!window.localfy.onMediaPlayPause) return;
    const unsub1 = window.localfy.onMediaPlayPause(() => usePlayerStore.getState().playPause());
    const unsub2 = window.localfy.onMediaNext(() => usePlayerStore.getState().next());
    const unsub3 = window.localfy.onMediaPrev(() => usePlayerStore.getState().prev());
    return () => {
      if (typeof unsub1 === 'function') unsub1();
      if (typeof unsub2 === 'function') unsub2();
      if (typeof unsub3 === 'function') unsub3();
    };
  }, []);

  return null; // This component renders nothing
}
