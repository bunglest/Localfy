import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Renders a comma-separated list of clickable artist names.
 *
 * Props:
 *   artist     {string}   — comma-joined artist string, e.g. "Metro Boomin, 21 Savage"
 *   artistIds  {string[]} — optional Spotify artist IDs in matching order
 *   className  {string}   — extra class on each <span>
 *   style      {object}   — extra inline styles on each <span>
 */
export default function ArtistLinks({ artist, artistIds, className, style }) {
  const navigate = useNavigate();
  if (!artist) return null;

  const names = artist.split(', ');

  return (
    <>
      {names.map((name, i) => (
        <React.Fragment key={name + i}>
          <span
            className={`artist-link${className ? ` ${className}` : ''}`}
            style={style}
            onClick={e => {
              e.stopPropagation();
              const id = artistIds?.[i] || encodeURIComponent(name);
              navigate(`/artist/${id}`);
            }}
          >
            {name}
          </span>
          {i < names.length - 1 && ', '}
        </React.Fragment>
      ))}
    </>
  );
}
