const express = require('express');
const axios = require('axios');
const router = express.Router();
const supabase = require('../supabaseClient');

// Fetch and store all liked songs for a user
router.get('/:spotifyId', async (req, res) => {
  const { spotifyId } = req.params;
  const accessToken = req.query.access_token || req.headers['authorization']?.replace('Bearer ', '');

  if (!accessToken) {
    return res.status(400).json({ error: 'Access token required' });
  }

  try {
    // Lookup user_id from spotify_id
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('spotify_id', spotifyId)
      .single();

    if (userError || !user) {
      console.error('User lookup failed:', userError);
      return res.status(404).json({ error: 'User not found in Supabase' });
    }

    const userId = user.id;

    // Fetch all liked songs from Spotify
    let allTracks = [];
    let url = 'https://api.spotify.com/v1/me/tracks?limit=50';

    while (url) {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const { items, next } = response.data;
      allTracks.push(...items);
      url = next;
    }

    console.log(`🎧 Found ${allTracks.length} liked songs for user_id ${userId}`);

    const insertData = allTracks.map(item => {
      const track = item.track;
      return {
        user_id: userId,
        song_id: track.id,
        song_data: track,
        name: track.name,
        artists: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        duration_ms: track.duration_ms,
        popularity: track.popularity,
        created_at: item.added_at
      };
    });
    
    
    

    // Clear old songs for this user
    await supabase
      .from('liked_songs')
      .delete()
      .eq('user_id', userId);

    // Insert fresh liked songs
    const { error: insertError } = await supabase
      .from('liked_songs')
      .insert(insertData);

    if (insertError) {
      console.error('Insert error:', insertError);
      return res.status(500).json({ error: 'Failed to insert liked songs' });
    }

    res.json({
      message: 'Liked songs updated successfully',
      userId,
      total: insertData.length
    });
  } catch (err) {
    console.error('Unexpected error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Unexpected error during liked songs sync' });
  }
});

module.exports = router;
