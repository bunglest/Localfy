import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../store';

export default function BackForward() {
  const navigate = useNavigate();
  const { canGoBack, canGoForward, goBack, goForward } = useUIStore();

  const handleBack = () => {
    const path = goBack();
    if (path) navigate(path);
  };

  const handleForward = () => {
    const path = goForward();
    if (path) navigate(path);
  };

  return (
    <div className="nav-buttons">
      <button className="nav-btn" onClick={handleBack} disabled={!canGoBack()} title="Go back" aria-label="Go back">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <button className="nav-btn" onClick={handleForward} disabled={!canGoForward()} title="Go forward" aria-label="Go forward">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}
