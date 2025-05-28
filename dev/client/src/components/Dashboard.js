import React, { useEffect, useState, useRef, useCallback } from 'react';
import '../styles/shared.css';
import '../styles/dashboard.css';
import FeedbackMenu from './FeedbackMenu';
import SpotifyPlayer from './SpotifyPlayer';
import UserPreferences from './UserPreferences';
import { FaCog } from 'react-icons/fa';
import '../styles/UserPreferences.css';

function Dashboard() {
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [userProfile, setUserProfile] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [playlistId, setPlaylistId] = useState(null);
  const [showFeedbackMenu, setShowFeedbackMenu] = useState(false);
  const [songList, setSongList] = useState('');
  const [songCount, setSongCount] = useState('');
  const [genres, setGenres] = useState('');
  const [excludedArtists, setExcludedArtists] = useState('');
  const [excludedSongs, setExcludedSongs] = useState('');
  const [activeTab, setActiveTab] = useState('prompt');
  const [summary, setSummary] = useState('');
  const [showPlayer, setShowPlayer] = useState(false);
  const playerRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasScrolled, setHasScrolled] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [userId, setUserId] = useState(null);

  const scrollToPlayer = useCallback(() => {
    if (playerRef.current && !hasScrolled) {
      const yOffset = -100; // Add some offset from the top
      const y = playerRef.current.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
      setHasScrolled(true);
    }
  }, [hasScrolled]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const access = params.get('access_token');
    const refresh = params.get('refresh_token');

    setAccessToken(access);
    setRefreshToken(refresh);

    if (access) {
      fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${access}` },
      })
        .then((res) => res.json())
        .then((data) => setUserProfile(data))
        .catch((err) => console.error('Failed to fetch user profile', err));
    }
  }, []);

  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/auth/me', {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setUserId(data.id.toString());
        } else {
          const errorData = await response.json();
          console.error('Error fetching user ID:', errorData.error);
        }
      } catch (error) {
        console.error('Error fetching user ID:', error);
      }
    };
    
    if (accessToken) {
      fetchUserId();
    }
  }, [accessToken]);

  // Remove the auto-show effect
  useEffect(() => {
    if (playlistUrl) {
      // Do nothing with scrolling
    }
  }, [playlistUrl]);

  const handleShowPlayer = () => {
    setShowPlayer(true);
    setTimeout(scrollToPlayer, 100);
  };

  const handlePromptSubmit = async (e) => {
    e.preventDefault();
    
    // Validate inputs
    if (!prompt.trim()) {
      setAiResult('Please enter a prompt for your playlist.');
      return;
    }
    
    const count = parseInt(songCount, 10);
    if (!count || count < 1) {
      setAiResult('Please enter a valid number of songs (1-30).');
      return;
    }

    setAiResult('Loading...');
    setPlaylistUrl('');
    setPlaylistId(null);
    setSongList('');
    setActiveTab('prompt');
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('http://localhost:3001/api/playlists/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ 
          prompt,
          songCount: Math.min(30, count)
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to generate playlist');
      }

      // Set the AI response and song list from the JSON response
      setAiResult(data.message || 'No AI response.');
      if (data.playlistUrl) {
        setPlaylistUrl(data.playlistUrl);
        // Try to get songList from either the root level or playlist_data
        const songListText = data.songList || (data.playlist_data && data.playlist_data.songList) || '';
        setSongList(songListText);
        setSummary(data.summary || '');
        
        // Get the playlist ID from Supabase
        try {
          const playlistRes = await fetch('http://localhost:3001/api/playlists/recent', {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          
          if (playlistRes.ok) {
            const playlistData = await playlistRes.json();
            if (playlistData && playlistData.length > 0) {
              setPlaylistId(playlistData[0].id);
            }
          }
        } catch (err) {
          console.error('Error getting playlist ID:', err);
        }
      }
    } catch (err) {
      setAiResult('Error generating playlist: ' + err.message);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const openFeedbackMenu = () => {
    setShowFeedbackMenu(true);
  };

  const closeFeedbackMenu = () => {
    setShowFeedbackMenu(false);
  };

  const handleWebPlayer = () => {
    if (!showPlayer) {
      setHasScrolled(false);
      setShowPlayer(true);
      setTimeout(scrollToPlayer, 100);
    } else {
      setShowPlayer(false);
    }
  };

  const renderPlaylistForm = () => {
    return (
      <form onSubmit={handlePromptSubmit} className="prompt-form">
        <div style={{
          display: 'flex',
          marginBottom: '1rem'
        }}>
          <div className="prompt-input" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            flex: 1,
            margin: 0
          }}>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your playlist vibe..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: 'var(--text-color)',
                fontSize: '1rem',
                outline: 'none',
                padding: 0
              }}
            />
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
              paddingLeft: '1rem'
            }}>
              <label htmlFor="songCount" style={{ 
                color: 'rgba(255, 255, 255, 0.5)',
                fontSize: '1rem',
                whiteSpace: 'nowrap'
              }}>
                Songs:
              </label>
              <input
                id="songCount"
                type="number"
                min="1"
                max="30"
                value={songCount}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    setSongCount('');
                  } else {
                    const num = parseInt(value, 10);
                    if (num > 30) {
                      setSongCount('30');
                    } else {
                      setSongCount(value);
                    }
                  }
                }}
                placeholder="1-30"
                style={{
                  width: '60px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-color)',
                  textAlign: 'center',
                  fontSize: '1rem',
                  outline: 'none',
                  padding: 0
                }}
              />
            </div>
          </div>
        </div>
        <button type="submit" className="button" disabled={isLoading} style={{
          width: '200px',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {isLoading ? '🎵 Generating...' : '🎵 Generate Playlist'}
        </button>
      </form>
    );
  };

  const renderResults = () => {
    if (!aiResult) return null;

    return (
      <div className="result-section">
        <h3 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>AI Response</h3>
        <p style={{ whiteSpace: 'pre-wrap', marginBottom: '1rem', color: 'white' }}>{aiResult}</p>

        {playlistUrl && (
          <div className="playlist-actions" style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            marginBottom: '1rem',
            justifyContent: 'center'
          }}>
            <div style={{
              display: 'flex',
              gap: '0.5rem'
            }}>
              <button 
                onClick={handleWebPlayer}
                className="button"
                style={{ 
                  background: 'var(--accent-color)',
                  width: '160px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0',
                  fontWeight: 400,
                  fontFamily: 'inherit'
                }}
              >
                {showPlayer ? '🎧 Hide Player' : '🎧 Show Player'}
              </button>

              <a
                href={playlistUrl}
                target="_blank"
                rel="noreferrer"
                className="button"
                style={{ 
                  display: 'flex',
                  textDecoration: 'none',
                  background: 'var(--accent-color)',
                  width: '160px',
                  height: '40px',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0',
                  fontWeight: 400,
                  fontFamily: 'inherit'
                }}
              >
                🎧 Open in Spotify
              </a>
            </div>

            {playlistId && (
              <button 
                onClick={openFeedbackMenu}
                className="button"
                style={{ 
                  background: 'var(--accent-color)',
                  width: '160px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0',
                  fontWeight: 400,
                  fontFamily: 'inherit'
                }}
              >
                ⭐ Rate Songs
              </button>
            )}
          </div>
        )}

        {songList && (
          <div className="song-list" style={{ 
            marginTop: '2rem',
            textAlign: 'left',
            background: 'rgba(255, 255, 255, 0.1)',
            padding: '1.5rem',
            borderRadius: '8px'
          }}>
            <h4 style={{ 
              color: 'var(--primary-color)', 
              marginBottom: '1.5rem',
              fontSize: '1.5rem',
              fontWeight: 'bold'
            }}>Playlist Songs:</h4>
            <div style={{ 
              padding: '1rem',
              borderRadius: '4px',
              color: 'white',
              background: 'rgba(0, 0, 0, 0.1)',
              fontSize: '1.1rem',
              lineHeight: '1.6'
            }}>
              {songList.split('\n').map((song, index) => (
                <div 
                  key={index} 
                  style={{ 
                    padding: '0.75rem',
                    borderBottom: index < songList.split('\n').length - 1 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <span style={{ 
                    marginRight: '1rem',
                    color: 'var(--primary-color)',
                    fontWeight: 'bold',
                    minWidth: '2rem'
                  }}>
                    {index + 1}.
                  </span>
                  <span>{song}</span>
                </div>
              ))}
            </div>
            {summary && summary.includes('could not find results') && summary.includes('0 songs') === false && (
              <p style={{ 
                marginTop: '1rem',
                color: 'var(--text-color)',
                fontSize: '1rem',
                textAlign: 'center'
              }}>
                {summary}
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="animated-background">
      <div className="container">
        <img 
          src="/CookieLogo.png" 
          alt="Push-D Logo" 
          className="floating-logo" 
          style={{ width: '420px', height: '320px' }} 
        />
        <div className="card">
          <h1 className="title">Push-D</h1>
          
          <div className="dashboard-content">
            <h2 style={{ color: 'var(--primary-color)', marginBottom: '2rem' }}>
              Welcome, {userProfile?.display_name || 'User'} 👋
            </h2>
            {renderPlaylistForm()}
            {renderResults()}
          </div>

          <p style={{ marginTop: '2rem', color: 'var(--text-color)' }}>
            © 2025 Push-D. All rights reserved.
          </p>
        </div>

        {showPlayer && (
          <div className="card" style={{
            marginTop: '1rem',
            padding: '1.5rem',
            maxWidth: '650px',
            margin: '1rem auto 0',
            background: 'rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(10px)'
          }} ref={playerRef}>
            <SpotifyPlayer accessToken={accessToken} playlistUrl={playlistUrl} />
          </div>
        )}

        <button 
          className="preferences-button"
          onClick={async () => {
            try {
              const response = await fetch('http://localhost:3001/api/auth/me', {
                headers: {
                  Authorization: `Bearer ${accessToken}`
                }
              });
              
              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch user ID');
              }
              
              const data = await response.json();
              if (!data.id) {
                throw new Error('No user ID received');
              }
              
              setUserId(data.id);
              setShowPreferences(true);
            } catch (error) {
              console.error('Error fetching user ID:', error);
              alert('Failed to fetch user ID. Please try logging in again.');
            }
          }}
          title="User Preferences"
        >
          <FaCog />
        </button>

        <UserPreferences
          isOpen={showPreferences}
          onClose={() => setShowPreferences(false)}
          userId={userId}
          accessToken={accessToken}
        />
      </div>

      {showFeedbackMenu && playlistId && (
        <FeedbackMenu 
          accessToken={accessToken}
          playlistId={playlistId}
          onClose={closeFeedbackMenu}
        />
      )}
    </div>
  );
}

export default Dashboard;
