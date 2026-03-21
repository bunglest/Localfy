import React, { useState } from 'react';
import { useAuthStore, useToastStore } from '../store';

export default function LoginPage() {
  const { login } = useAuthStore();
  const { add: toast } = useToastStore();
  const [clientId, setClientId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!clientId.trim()) { toast('Enter your Spotify Client ID', 'error'); return; }
    setLoading(true);
    try {
      const result = await login(clientId.trim());
      if (!result?.success) toast('Login failed. Check your Client ID and try again.', 'error');
    } catch (err) {
      toast(err.message || 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      width: '100vw', height: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
      position: 'relative',
      overflow: 'hidden',
      flexDirection: 'column',
      '-webkit-app-region': 'drag',
    }}>
      {/* Background decoration */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,45,120,0.08) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 100%, rgba(255,107,160,0.05) 0%, transparent 50%)',
        pointerEvents: 'none',
      }} />

      {/* Grid pattern */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 420,
        padding: '0 24px',
        '-webkit-app-region': 'no-drag',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40, justifyContent: 'center' }}>
          <div style={{
            width: 48, height: 48, background: 'linear-gradient(135deg, var(--pink) 0%, var(--pink-soft) 100%)',
            borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 32px var(--pink-glow)',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M17.9 10.9C14.7 9 9.1 8.8 6 9.7c-.5.1-1-.2-1.1-.7-.1-.5.2-1 .7-1.1 3.5-1 9.7-.8 13.5 1.5.5.3.6.9.3 1.4-.3.4-.9.6-1.5.1z" fill="var(--bg)"/>
              <path d="M17.2 13.2c-.3.4-.8.5-1.2.3-2.6-1.6-6.6-2.1-9.7-1.1-.4.1-.8-.1-.9-.5-.1-.4.1-.8.5-.9 3.5-.9 7.9-.5 10.9 1.3.4.2.5.7.4 1.2l-.1.7z" fill="var(--bg)"/>
              <path d="M16.1 15.5c-.2.3-.6.4-1 .2-2.3-1.4-5.2-1.7-8.6-.9-.3.1-.7-.2-.7-.5-.1-.3.2-.7.5-.7 3.7-.8 6.9-.5 9.5 1.1.4.2.5.6.3.8z" fill="var(--bg)"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, letterSpacing: -1, color: 'var(--text-1)' }}>
              Localfy
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              your music, downloaded
            </div>
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)', padding: '28px 28px 32px',
        }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
            Connect Spotify
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 24, lineHeight: 1.6 }}>
            Link your Spotify account to import your music library and get personalized recommendations.
          </p>

          <form onSubmit={handleLogin}>
            <label className="input-label">Spotify Client ID</label>
            <input
              className="input-field"
              type="text"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              placeholder="Enter your Spotify app Client ID"
              autoFocus
            />

            <div style={{
              marginTop: 12, padding: '10px 14px',
              background: 'rgba(255,45,120,0.06)',
              border: '1px solid rgba(255,45,120,0.15)',
              borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--text-2)',
              lineHeight: 1.7,
            }}>
              <strong style={{ color: 'var(--pink)' }}>How to get a Client ID:</strong>
              <ol style={{ paddingLeft: 16, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>Go to <span style={{ color: 'var(--pink)', cursor: 'pointer', textDecoration: 'underline' }}
                  onClick={() => window.localfy.openExternal('https://developer.spotify.com/dashboard')}>
                  developer.spotify.com/dashboard
                </span></li>
                <li>Create a new app (any name)</li>
                <li>
                  In app settings → <strong style={{ color: 'var(--text-1)' }}>Redirect URIs</strong>, add exactly:
                  <div style={{
                    marginTop: 4, padding: '5px 10px',
                    background: 'var(--bg)', border: '1px solid var(--border-2)',
                    borderRadius: 4, fontFamily: 'var(--font-mono)',
                    color: 'var(--pink)', fontSize: 12, letterSpacing: 0.3,
                    userSelect: 'all', cursor: 'text',
                  }}>
                    localfy://callback
                  </div>
                </li>
                <li>Click <strong style={{ color: 'var(--text-1)' }}>Save</strong>, then copy the <strong style={{ color: 'var(--text-1)' }}>Client ID</strong> and paste above</li>
              </ol>
            </div>

            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              style={{ width: '100%', marginTop: 20, height: 44, fontSize: 15, justifyContent: 'center', borderRadius: 'var(--radius)' }}
            >
              {loading
                ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>opening browser…</span>
                : <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                    </svg>
                    Connect with Spotify
                  </>
              }
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-3)', marginTop: 16 }}>
          Localfy uses Spotify's free API — no premium required for browsing.
          <br />Downloads use yt-dlp. Install it at{' '}
          <span style={{ color: 'var(--pink)', cursor: 'pointer' }}
            onClick={() => window.localfy.openExternal('https://github.com/yt-dlp/yt-dlp/releases')}>
            github.com/yt-dlp/yt-dlp
          </span>
        </p>
      </div>
    </div>
  );
}
