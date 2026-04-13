import React, { useState, useCallback } from 'react';
import { useUIStore } from '../store';

const BANDS = [
  { freq: '60Hz', default: 0 },
  { freq: '170Hz', default: 0 },
  { freq: '310Hz', default: 0 },
  { freq: '600Hz', default: 0 },
  { freq: '1kHz', default: 0 },
  { freq: '3kHz', default: 0 },
  { freq: '6kHz', default: 0 },
  { freq: '12kHz', default: 0 },
];

const PRESETS = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost': [6, 5, 3, 1, 0, 0, 0, 0],
  'Treble Boost': [0, 0, 0, 0, 1, 3, 5, 6],
  Vocal: [-2, -1, 0, 3, 5, 3, 0, -1],
  Rock: [4, 3, 1, 0, -1, 1, 3, 4],
  Electronic: [5, 4, 1, 0, -1, 2, 4, 5],
};

export default function Equalizer() {
  const { showEqualizer, toggleEqualizer } = useUIStore();
  const [gains, setGains] = useState(BANDS.map((b) => b.default));
  const [activePreset, setActivePreset] = useState('Flat');

  const handleBandChange = useCallback((index, value) => {
    setGains((prev) => {
      const next = [...prev];
      next[index] = Number(value);
      return next;
    });
    setActivePreset('');
  }, []);

  const applyPreset = useCallback((name) => {
    const preset = PRESETS[name];
    if (preset) {
      setGains([...preset]);
      setActivePreset(name);
    }
  }, []);

  const handleReset = useCallback(() => {
    setGains(BANDS.map(() => 0));
    setActivePreset('Flat');
  }, []);

  if (!showEqualizer) return null;

  return (
    <div className="equalizer-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Equalizer</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleReset}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary, #999)',
              cursor: 'pointer',
              fontSize: 13,
              padding: '4px 8px',
            }}
          >
            Reset
          </button>
          <button
            onClick={toggleEqualizer}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-primary, #fff)',
              cursor: 'pointer',
              fontSize: 18,
              padding: '4px 8px',
              lineHeight: 1,
            }}
            aria-label="Close equalizer"
          >
            ×
          </button>
        </div>
      </div>

      <div className="eq-bands">
        {BANDS.map((band, index) => (
          <div key={band.freq} className="eq-band">
            <span style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>
              {gains[index] > 0 ? '+' : ''}{gains[index]}dB
            </span>
            <input
              className="eq-slider"
              type="range"
              min={-12}
              max={12}
              step={1}
              value={gains[index]}
              onChange={(e) => handleBandChange(index, e.target.value)}
              orient="vertical"
              style={{
                writingMode: 'vertical-lr',
                direction: 'rtl',
                height: 120,
                width: 24,
              }}
              aria-label={`${band.freq} gain`}
            />
            <span className="eq-label">{band.freq}</span>
          </div>
        ))}
      </div>

      <div className="eq-presets">
        {Object.keys(PRESETS).map((name) => (
          <button
            key={name}
            className={`eq-preset-btn ${activePreset === name ? 'active' : ''}`}
            onClick={() => applyPreset(name)}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
