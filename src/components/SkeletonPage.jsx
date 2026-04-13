import React from 'react';

export function SkeletonRows({ count = 8 }) {
  return (
    <div className="skeleton-page">
      <div className="skeleton-text-lg" style={{ width: '30%', marginBottom: 20 }} />
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton-box" style={{ width: 40, height: 40 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="skeleton-text" style={{ width: `${60 + Math.random() * 30}%` }} />
            <div className="skeleton-text" style={{ width: `${30 + Math.random() * 20}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonGrid({ count = 6 }) {
  return (
    <div className="skeleton-page">
      <div className="skeleton-text-lg" style={{ width: '25%', marginBottom: 20 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 16 }}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i}>
            <div className="skeleton-box" style={{ width: '100%', paddingTop: '100%' }} />
            <div className="skeleton-text" style={{ width: '70%', marginTop: 10 }} />
            <div className="skeleton-text" style={{ width: '50%', marginTop: 6 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
