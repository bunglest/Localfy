# Localfy — Your music, downloaded.

A Spotify-powered desktop music player for Windows that lets you download and play your entire library locally.

## Quick Start

### 1. Prerequisites

- **Node.js** (v18+) — https://nodejs.org
- **yt-dlp** — https://github.com/yt-dlp/yt-dlp/releases
  Install via: `winget install yt-dlp` (must be in PATH)

### 2. Setup

Double-click `setup.bat` or run:

```
npm install
```

### 3. Spotify Developer App

1. Go to https://developer.spotify.com/dashboard
2. Create a new app (any name/description)
3. In app settings → **Redirect URIs**, add: `http://localhost:8888/callback`
4. Copy your **Client ID**

### 4. Launch

```
npm run dev
```

or double-click `start.bat`

### 5. First Login

Paste your Spotify Client ID → your browser will open for auth → come back to Localfy.

---

## Features

| Feature | Details |
|---------|---------|
| 🏠 Home | Personalized recommendations from your listening history |
| 🔍 Search | Full Spotify catalog search |
| 📚 Library | All downloaded songs, offline |
| ❤️ Liked Songs | Import + download all liked songs with one click |
| 📁 Playlists | Import Spotify playlists with folder organization |
| ⬇️ Downloads | Real-time queue with progress tracking |
| ⚙️ Settings | Manage folders, download path, account |
| 🎵 Player | Spinning album art disc while playing |

## How Downloads Work

Localfy uses **yt-dlp** to find and download audio from YouTube, matched by artist + song name. Downloads are saved as MP3 to your `Music/Localfy` folder (configurable in Settings).

## File Structure

```
LocalfyV2/
├── electron/          # Main process (Node.js)
│   ├── main.js        # Window, IPC handlers, Spotify auth, download logic
│   ├── preload.js     # Secure bridge between renderer and main
│   └── db.js          # SQLite schema & queries
├── src/               # React renderer
│   ├── components/    # Sidebar, TopBar, Player, TrackRow, etc.
│   ├── pages/         # Home, Library, LikedSongs, Downloads, Settings, Playlist, Search
│   ├── store/         # Zustand state management
│   └── index.css      # Full design system
├── setup.bat          # First-time setup script
└── start.bat          # Launch shortcut
```
