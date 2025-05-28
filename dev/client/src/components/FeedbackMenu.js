import React, { useState, useEffect } from 'react';

function FeedbackMenu({ accessToken, playlistId, onClose }) {
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState({});

  useEffect(() => {
    // Get playlist details from Spotify
    async function fetchPlaylistSongs() {
      try {
        // First get the Spotify playlist ID from the database
        const playlistRes = await fetch(`http://localhost:3001/api/playlists/${playlistId}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        if (!playlistRes.ok) throw new Error('Failed to fetch playlist info');
        
        const playlistData = await playlistRes.json();
        const spotifyPlaylistUrl = playlistData.playlist_data.playlistUrl;
        const spotifyPlaylistId = spotifyPlaylistUrl.split('/').pop();
        
        // Now fetch the tracks from Spotify
        const tracksRes = await fetch(`https://api.spotify.com/v1/playlists/${spotifyPlaylistId}/tracks`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        if (!tracksRes.ok) throw new Error('Failed to fetch tracks');
        
        const tracksData = await tracksRes.json();
        setSongs(tracksData.items.map(item => item.track));
        
        // Get any existing feedback for this playlist
        const feedbackRes = await fetch(`http://localhost:3001/api/feedback/playlist/${playlistId}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        if (feedbackRes.ok) {
          const feedbackData = await feedbackRes.json();
          
          // Create a map of song_id -> feedback
          const feedbackMap = {};
          feedbackData.forEach(item => {
            feedbackMap[item.song_id] = item;
          });
          
          setFeedback(feedbackMap);
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching playlist songs:', err);
        setError('Failed to load songs. Please try again.');
        setLoading(false);
      }
    }
    
    fetchPlaylistSongs();
  }, [accessToken, playlistId]);

  const handleFeedbackSubmit = async (songId, feedbackType, rating = null, feedbackText = null, addToLiked = false) => {
    try {
      const response = await fetch('http://localhost:3001/api/feedback/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          playlistId,
          songId,
          feedbackType,
          rating,
          feedbackText,
          addToLiked
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // Update local state to reflect the feedback
        setFeedback(prev => ({
          ...prev,
          [songId]: {
            song_id: songId,
            feedback_type: feedbackType,
            rating,
            feedback_text: feedbackText,
            added_to_spotify: data.addedToSpotifyLikes
          }
        }));
        
        // Show a notification if the song was added to Spotify Liked Songs
        if (data.addedToSpotifyLikes) {
          alert('This song has been added to your Spotify Liked Songs!');
        }
      } else {
        console.error('Failed to submit feedback');
      }
    } catch (err) {
      console.error('Error submitting feedback:', err);
    }
  };

  if (loading) return (
    <div className="feedback-menu" style={styles.overlay}>
      <div className="card" style={styles.menu}>
        <p style={styles.loading}>Loading songs...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="feedback-menu" style={styles.overlay}>
      <div className="card" style={styles.menu}>
        <p style={styles.error}>{error}</p>
        <button onClick={onClose} className="button">Close</button>
      </div>
    </div>
  );

  return (
    <div className="feedback-menu" style={styles.overlay}>
      <div className="card" style={styles.menu}>
        <div style={styles.header}>
          <h2 style={styles.title}>Rate Songs</h2>
          <button 
            onClick={onClose}
            style={styles.closeButton}
            className="button"
          >
            ✕
          </button>
        </div>
        
        {songs.length === 0 ? (
          <p style={styles.noSongs}>No songs found in this playlist.</p>
        ) : (
          <div style={styles.songList}>
            {songs.map(song => {
              const existingFeedback = feedback[song.id];
              
              return (
                <div key={song.id} style={styles.songItem}>
                  <div style={styles.songInfo}>
                    <strong style={{ color: '#ffffff' }}>{song.name}</strong>
                    <span style={styles.artists}>{song.artists.map(a => a.name).join(', ')}</span>
                  </div>
                  
                  {existingFeedback ? (
                    <div style={styles.existingFeedback}>
                      <p>Your feedback: <strong>{existingFeedback.feedback_type}</strong></p>
                      {existingFeedback.rating && <p>Rating: {existingFeedback.rating}/5</p>}
                      {existingFeedback.feedback_text && (
                        <p style={styles.feedbackText}>"{existingFeedback.feedback_text}"</p>
                      )}
                    </div>
                  ) : (
                    <div style={styles.feedbackActions}>
                      <div style={styles.quickActions}>
                        <button 
                          onClick={() => handleFeedbackSubmit(song.id, 'like')}
                          className="button"
                          style={styles.likeButton}
                        >
                          👍 Like
                        </button>
                        <button 
                          onClick={() => handleFeedbackSubmit(song.id, 'dislike')}
                          className="button"
                          style={styles.dislikeButton}
                        >
                          👎 Dislike
                        </button>
                      </div>
                      
                      <details style={styles.detailedFeedback}>
                        <summary style={styles.detailsSummary}>Add Detailed Feedback</summary>
                        <div style={styles.detailsContent}>
                          <div style={styles.ratingSection}>
                            <label style={styles.label}>Rating:</label>
                            <select 
                              id={`rating-${song.id}`}
                              className="select"
                              style={styles.select}
                            >
                              <option value="">Select a rating</option>
                              <option value="1">1 - Poor</option>
                              <option value="2">2 - Fair</option>
                              <option value="3">3 - Good</option>
                              <option value="4">4 - Very Good</option>
                              <option value="5">5 - Excellent</option>
                            </select>
                          </div>
                          
                          <div style={styles.commentSection}>
                            <label style={styles.label}>Comments:</label>
                            <textarea 
                              id={`comments-${song.id}`}
                              style={styles.textarea}
                              placeholder="Share your thoughts about this song..."
                            />
                          </div>
                          
                          <div style={styles.likeCheckbox}>
                            <input
                              type="checkbox"
                              id={`like-${song.id}`}
                              style={styles.checkbox}
                            />
                            <label htmlFor={`like-${song.id}`} style={styles.checkboxLabel}>
                              Add to Spotify Liked Songs
                            </label>
                          </div>
                          
                          <button
                            onClick={() => {
                              const rating = document.getElementById(`rating-${song.id}`).value;
                              const comments = document.getElementById(`comments-${song.id}`).value;
                              const addToLiked = document.getElementById(`like-${song.id}`).checked;
                              handleFeedbackSubmit(
                                song.id, 
                                'detailed', 
                                rating ? parseInt(rating) : null, 
                                comments || null,
                                addToLiked
                              );
                            }}
                            className="button"
                            style={styles.submitButton}
                          >
                            Submit Feedback
                          </button>
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  },
  menu: {
    width: '90%',
    maxWidth: '800px',
    maxHeight: '90vh',
    overflowY: 'auto',
    backgroundColor: 'var(--card-background)',
    borderRadius: '15px',
    padding: '2rem',
    position: 'relative'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem'
  },
  title: {
    color: 'var(--text-color)',
    margin: 0,
    fontSize: '2rem'
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: 'var(--text-color)',
    fontSize: '1.5rem',
    cursor: 'pointer',
    padding: '0.5rem',
    borderRadius: '50%',
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  songList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem'
  },
  songItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  songInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  artists: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: '0.9rem'
  },
  feedbackActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  quickActions: {
    display: 'flex',
    gap: '1rem'
  },
  likeButton: {
    backgroundColor: 'var(--primary-color)',
    flex: 1
  },
  dislikeButton: {
    backgroundColor: '#e74c3c',
    flex: 1
  },
  detailedFeedback: {
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    paddingTop: '1rem'
  },
  detailsSummary: {
    color: 'var(--text-color)',
    cursor: 'pointer',
    userSelect: 'none'
  },
  detailsContent: {
    marginTop: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  label: {
    color: 'var(--text-color)',
    display: 'block',
    marginBottom: '0.5rem'
  },
  select: {
    width: '100%',
    padding: '0.5rem',
    borderRadius: '4px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: 'var(--text-color)',
    border: '1px solid rgba(255, 255, 255, 0.2)'
  },
  textarea: {
    width: '100%',
    padding: '0.5rem',
    borderRadius: '4px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: 'var(--text-color)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    minHeight: '100px',
    resize: 'vertical'
  },
  submitButton: {
    backgroundColor: 'var(--primary-color)',
    width: '100%'
  },
  existingFeedback: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: '1rem',
    borderRadius: '4px',
    color: 'var(--text-color)'
  },
  feedbackText: {
    fontStyle: 'italic',
    marginTop: '0.5rem'
  },
  loading: {
    color: 'var(--text-color)',
    textAlign: 'center',
    fontSize: '1.2rem'
  },
  error: {
    color: '#e74c3c',
    textAlign: 'center',
    marginBottom: '1rem'
  },
  noSongs: {
    color: 'var(--text-color)',
    textAlign: 'center',
    fontSize: '1.2rem'
  },
  likeCheckbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '1rem'
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer'
  },
  checkboxLabel: {
    color: 'white',
    cursor: 'pointer',
    fontSize: '0.9rem'
  }
};

export default FeedbackMenu;
