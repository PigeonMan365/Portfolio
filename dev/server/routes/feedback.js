const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const axios = require('axios');

// Submit feedback for a song in a playlist
router.post('/submit', async (req, res) => {
  const { 
    playlistId, 
    songId, 
    feedbackType, 
    feedbackText,
    rating,
    addToLiked
  } = req.body;
  
  const accessToken = req.headers.authorization?.split(' ')[1];

  if (!accessToken || !playlistId || !songId || !feedbackType) {
    return res.status(400).json({ 
      message: 'Missing required fields: accessToken, playlistId, songId, and feedbackType are required' 
    });
  }

  try {
    // Get Spotify user profile info
    const userRes = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const spotifyUserId = userRes.data.id;

    // Retrieve internal user ID
    const { data: userDbData, error: userDbError } = await supabase
      .from('users')
      .select('id')
      .eq('spotify_id', spotifyUserId)
      .single();

    if (userDbError || !userDbData) {
      console.error('Error fetching user from Supabase:', userDbError);
      return res.status(400).json({ message: 'User not found in database.' });
    }

    const userId = userDbData.id;

    // If feedback type is 'like' or addToLiked is true, save to Spotify's Liked Songs
    if (feedbackType === 'like' || addToLiked) {
      try {
        // Save track to Spotify's "Liked Songs" (using the PUT endpoint)
        await axios.put(
          `https://api.spotify.com/v1/me/tracks?ids=${songId}`,
          {}, // Empty body since we're passing IDs in query params
          {
            headers: { 
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        console.log(`✅ Added track ${songId} to user's Spotify Liked Songs`);
      } catch (spotifyError) {
        console.error('Error saving to Spotify Liked Songs:', spotifyError.response?.data || spotifyError.message);
        // Continue anyway - we'll still save the feedback in our database
      }
    }

    // Get song details from Spotify first
    const songRes = await axios.get(`https://api.spotify.com/v1/tracks/${songId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    
    const track = songRes.data;

    // Insert feedback with song data
    const { data, error } = await supabase
      .from('song_feedback')
      .insert({
        user_id: userId,
        playlist_id: playlistId,
        song_id: songId,
        song_data: track,
        feedback_type: feedbackType,
        feedback_text: feedbackText || null,
        rating: rating || null
      });

    if (error) {
      console.error('Error saving feedback:', error);
      return res.status(500).json({ message: 'Failed to save feedback' });
    }

    // Also update our liked_songs table if it's a 'like' or addToLiked is true
    if (feedbackType === 'like' || addToLiked) {
      try {
        // Add to our liked_songs table
        const { error: likedSongError } = await supabase
          .from('liked_songs')
          .upsert({
            user_id: userId,
            song_id: track.id,
            song_data: track,
            name: track.name,
            artists: track.artists.map(a => a.name).join(', '),
            album: track.album.name,
            duration_ms: track.duration_ms,
            popularity: track.popularity,
            created_at: new Date().toISOString()
          }, {
            onConflict: ['user_id', 'song_id']
          });
          
        if (likedSongError) {
          console.error('Error adding to local liked songs table:', likedSongError);
        }
      } catch (err) {
        console.error('Error updating local liked songs:', err.response?.data || err.message);
      }
    }

    res.json({ 
      success: true, 
      message: 'Feedback submitted successfully', 
      addedToSpotifyLikes: feedbackType === 'like' || addToLiked
    });
  } catch (error) {
    console.error('Error handling feedback submission', error);
    res.status(500).json({ message: 'Failed to submit feedback' });
  }
});

// Get feedback for a specific playlist
router.get('/playlist/:playlistId', async (req, res) => {
  const { playlistId } = req.params;
  const accessToken = req.headers.authorization?.split(' ')[1];

  if (!accessToken) {
    return res.status(400).json({ message: 'Missing access token' });
  }

  try {
    // Get user info
    const userRes = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const spotifyUserId = userRes.data.id;

    // Get internal user ID
    const { data: userDbData, error: userDbError } = await supabase
      .from('users')
      .select('id')
      .eq('spotify_id', spotifyUserId)
      .single();

    if (userDbError || !userDbData) {
      return res.status(400).json({ message: 'User not found in database.' });
    }

    const userId = userDbData.id;

    // Get feedback for this playlist by this user with song data
    const { data, error } = await supabase
      .from('song_feedback')
      .select(`
        id,
        song_id,
        song_data,
        feedback_type,
        feedback_text,
        rating,
        created_at
      `)
      .eq('user_id', userId)
      .eq('playlist_id', playlistId);

    if (error) {
      console.error('Error fetching feedback:', error);
      return res.status(500).json({ message: 'Failed to fetch feedback' });
    }

    // Transform the data to include relevant song information
    const formattedData = data.map(feedback => ({
      ...feedback,
      song_name: feedback.song_data?.name,
      artists: feedback.song_data?.artists?.map(a => a.name).join(', '),
      album: feedback.song_data?.album?.name
    }));

    res.json(formattedData);
  } catch (error) {
    console.error('Error handling feedback request', error);
    res.status(500).json({ message: 'Failed to get feedback' });
  }
});

module.exports = router;
