// Localfy custom icon set — hand-crafted SVG paths, 1.7px stroke, rounded caps
// Consistent 24×24 viewbox, designed to feel bespoke and cohesive.

const S = { strokeWidth: '1.7', strokeLinecap: 'round', strokeLinejoin: 'round' };

export const HomeIcon = ({ size = 18, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...S} {...p}>
    {/* Minimal house: clean roofline, no internal cross-hatch */}
    <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-5.5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1V21H4a1 1 0 0 1-1-1V10.5Z" />
  </svg>
);

export const SearchIcon = ({ size = 18, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...S} {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    {/* Longer diagonal handle */}
    <path d="M15.5 15.5L21.5 21.5" />
  </svg>
);

export const LibraryIcon = ({ size = 18, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...S} {...p}>
    {/* Three vertical bars of different heights — collection / shelves */}
    <path d="M4 20V6" />
    <path d="M9 20V10" />
    <path d="M14 20V4" />
    <path d="M19 20V8" />
    <path d="M2 20h20" />
  </svg>
);

export const HeartIcon = ({ size = 18, filled = false, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" {...S} {...p}>
    {/* Slightly more elegant heart with rounder top curves */}
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A5.99 5.99 0 0 1 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z" />
  </svg>
);

export const DownloadIcon = ({ size = 18, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...S} {...p}>
    {/* Arrow + platform */}
    <path d="M12 4v12" />
    <path d="M7.5 12.5L12 17l4.5-4.5" />
    <path d="M4 20h16" />
  </svg>
);

export const SettingsIcon = ({ size = 18, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...S} {...p}>
    {/* EQ / mixer sliders — much more fitting for a music player than a gear */}
    {/* The lines go behind the filled circles to create a "slider" look */}
    <path d="M3 6h18" />
    <path d="M3 12h18" />
    <path d="M3 18h18" />
    {/* Slider knobs — filled circle with a stroke outline */}
    <circle cx="8" cy="6" r="2.5" style={{ fill: 'var(--bg, #09090F)' }} />
    <circle cx="16" cy="12" r="2.5" style={{ fill: 'var(--bg, #09090F)' }} />
    <circle cx="11" cy="18" r="2.5" style={{ fill: 'var(--bg, #09090F)' }} />
  </svg>
);

export const PlayIcon = ({ size = 18, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}>
    {/* Slightly rounded-feel triangle — softer than a sharp polygon */}
    <path d="M7 4.5C7 3.55 8.06 2.97 8.87 3.49L20.13 10.99C20.9 11.49 20.9 12.51 20.13 13.01L8.87 20.51C8.06 21.03 7 20.45 7 19.5V4.5Z" />
  </svg>
);

export const PauseIcon = ({ size = 18, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}>
    {/* Rounded-rect bars */}
    <rect x="5" y="4" width="4" height="16" rx="1.5" />
    <rect x="15" y="4" width="4" height="16" rx="1.5" />
  </svg>
);

export const SkipNextIcon = ({ size = 18, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M5 5.5C5 4.55 6.06 3.97 6.87 4.49L16.13 10.99C16.9 11.49 16.9 12.51 16.13 13.01L6.87 19.51C6.06 20.03 5 19.45 5 18.5V5.5Z" />
    <rect x="18" y="4" width="2.5" height="16" rx="1.25" />
  </svg>
);

export const SkipPrevIcon = ({ size = 18, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M19 5.5C19 4.55 17.94 3.97 17.13 4.49L7.87 10.99C7.1 11.49 7.1 12.51 7.87 13.01L17.13 19.51C17.94 20.03 19 19.45 19 18.5V5.5Z" />
    <rect x="3.5" y="4" width="2.5" height="16" rx="1.25" />
  </svg>
);

export const ShuffleIcon = ({ size = 18, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...S} {...p}>
    {/* Top path: left → cross → right-top */}
    <path d="M2 4h3c3 0 4.5 2 6.5 5" />
    <path d="M14 15c1.5 2 3 3 5 3h3" />
    {/* Bottom path: left → cross → right-bottom */}
    <path d="M2 20h3c2.5 0 4-1.5 5.5-4" />
    <path d="M14 9c1.5-2.5 3-5 6-5" />
    {/* Arrow on top right */}
    <path d="M18 2l4 2-4 2" />
    {/* Arrow on bottom right */}
    <path d="M18 16l4 2-4 2" />
  </svg>
);

export const RepeatIcon = ({ size = 18, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...S} {...p}>
    {/* Cleaner loop — top arc goes right, bottom arc goes left */}
    <path d="M17 2l4 4-4 4" />
    <path d="M3 8a9 9 0 0 1 18 0v1" />
    <path d="M7 22l-4-4 4-4" />
    <path d="M21 16a9 9 0 0 1-18 0v-1" />
  </svg>
);

export const VolumeIcon = ({ size = 18, muted = false, ...p }) => muted ? (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...S} {...p}>
    {/* Speaker cone */}
    <path d="M11 5L6 9H2v6h4l5 4V5Z" />
    {/* Clean ×  */}
    <path d="M23 9l-6 6" />
    <path d="M17 9l6 6" />
  </svg>
) : (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...S} {...p}>
    <path d="M11 5L6 9H2v6h4l5 4V5Z" />
    {/* Two concentric arcs */}
    <path d="M15.5 9a5 5 0 0 1 0 6" />
    <path d="M19 6.5a9 9 0 0 1 0 11" />
  </svg>
);

export const FolderIcon = ({ size = 16, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...S} {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  </svg>
);

export const ChevronIcon = ({ size = 16, dir = 'right', ...p }) => {
  const r = dir === 'right' ? 0 : dir === 'down' ? 90 : dir === 'left' ? 180 : -90;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${r}deg)` }} {...p}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
};

export const PlusIcon = ({ size = 16, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const TrashIcon = ({ size = 16, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...S} {...p}>
    <path d="M3 6h18" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6l-.867 13a2 2 0 0 1-2 1.867H7.867A2 2 0 0 1 5.867 19L5 6" />
    <path d="M10 11v5M14 11v5" />
  </svg>
);

export const ImportIcon = ({ size = 16, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...S} {...p}>
    <path d="M12 14V3" />
    <path d="M7.5 9.5L12 14l4.5-4.5" />
    <path d="M3 16v2a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-2" />
  </svg>
);

export const CheckIcon = ({ size = 16, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export const XIcon = ({ size = 16, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

export const MoreIcon = ({ size = 18, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}>
    {/* Horizontal dots — less ambiguous than vertical */}
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="19" cy="12" r="1.5" />
  </svg>
);

export const MusicIcon = ({ size = 24, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
    {/* Single note with a flag — cleaner than double-note */}
    <path d="M9 18V6l10-2v12" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="16" cy="16" r="3" />
  </svg>
);

export const UserIcon = ({ size = 18, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...S} {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" />
  </svg>
);

export const LogoutIcon = ({ size = 16, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...S} {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
);

export const RefreshIcon = ({ size = 16, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...S} {...p}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);

export const AlertIcon = ({ size = 18, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...S} {...p}>
    {/* Triangle warning instead of circle — more distinctive */}
    <path d="M12 2L2 20h20L12 2Z" />
    <path d="M12 9v5" />
    <circle cx="12" cy="17" r="0.5" fill="currentColor" />
  </svg>
);

export const WaveformIcon = ({ size = 18, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...S} {...p}>
    {/* Audio waveform bars */}
    <path d="M2 12h2" />
    <path d="M5 8v8" />
    <path d="M8 5v14" />
    <path d="M11 9v6" />
    <path d="M14 6v12" />
    <path d="M17 9v6" />
    <path d="M20 8v8" />
    <path d="M23 12h-1" />
  </svg>
);

export const SpotifyIcon = ({ size = 16, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
  </svg>
);

export function DiscoverIcon({ size = 20, style, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
      <circle cx="12" cy="12" r="9"/>
      <polygon points="16 8 10 10 8 16 14 14 16 8" fill="currentColor" opacity="0.7" stroke="none"/>
    </svg>
  );
}

export function StatsIcon({ size = 20, style, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
      <rect x="3" y="14" width="4" height="7" rx="1"/>
      <rect x="10" y="9" width="4" height="12" rx="1"/>
      <rect x="17" y="4" width="4" height="17" rx="1"/>
    </svg>
  );
}
