const express = require('express');
const router = express.Router();
const { generatePlaylist } = require('../ai/deepseek');
const {
  extractTrackInfoFromResponse,
  searchSpotifyTracks,
  createSpotifyPlaylist
} = require('../utils/spotifyPlaylist');
const axios = require('axios');
const supabase = require('../supabaseClient');

router.post('/generate', async (req, res) => {
  const { prompt, songCount = 10 } = req.body;
  const accessToken = req.headers.authorization?.split(' ')[1];

  if (!prompt || !accessToken) {
    return res.status(400).json({ message: 'Missing prompt or access token' });
  }

  // Validate song count
  const validatedSongCount = Math.min(30, Math.max(1, parseInt(songCount, 10) || 10));

  try {
    // Get Spotify user profile info
    const userRes = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const spotifyUserId = userRes.data.id;

    // Retrieve internal Supabase user ID
    const { data: userDbData, error: userDbError } = await supabase
      .from('users')
      .select('id')
      .eq('spotify_id', spotifyUserId)
      .single();

    if (userDbError || !userDbData) {
      console.error('Error fetching user from Supabase:', userDbError);
      return res.status(400).json({ message: 'User not found in database.' });
    }

    const internalUserId = userDbData.id;

    // Generate playlist using user's liked songs and song count
    const aiResponse = await generatePlaylist(prompt, internalUserId, validatedSongCount);
    
    // Split the response into description and playlist
    const [description, ...songLines] = aiResponse.split('\n');
    const playlist = songLines.join('\n').trim();

    console.log('\n=== AI RESPONSE ===');
    console.log('Description:', description);
    console.log('Playlist:', playlist);
    console.log('==================');

    // Extract track information from AI response
    const trackInfos = extractTrackInfoFromResponse(playlist);
    
    if (!trackInfos || trackInfos.length === 0) {
      return res.status(400).json({ 
        message: 'No valid tracks found in AI response',
        details: 'The AI did not generate any valid track information'
      });
    }

    // Search for tracks on Spotify
    const { trackUris, foundSongs, notFoundSongs } = await searchSpotifyTracks(trackInfos, accessToken);
    
    console.log('Found Songs:', foundSongs);
    console.log('Not Found Songs:', notFoundSongs);

    if (trackUris.length === 0) {
      return res.status(400).json({ 
        message: 'No valid tracks found on Spotify',
        details: 'None of the suggested songs could be found on Spotify. Please try a different prompt or check the song names.',
        notFoundSongs: notFoundSongs.map(song => `${song.artist} - ${song.title}`)
      });
    }

    // Create playlist on Spotify
    const playlistUrl = await createSpotifyPlaylist(
      spotifyUserId,
      `AI Generated: ${prompt}`,
      trackUris,
      accessToken
    );

    // Insert the playlist into Supabase
    const { error: playlistDbError } = await supabase
      .from('playlists')
      .insert({
        user_id: internalUserId,
        playlist_data: {
          playlistUrl,
          message: description,
          songList: foundSongs.map(song => `${song.artist} - ${song.name}`).join('\n'),
          summary: `Added ${foundSongs.length} songs, could not find results for ${notFoundSongs.length} songs on Spotify`
        }
      });

    if (playlistDbError) {
      console.error('Error inserting playlist data in Supabase:', playlistDbError);
    }

    // Return response in the format the frontend expects
    res.json({
      message: description,
      playlistUrl,
      songList: foundSongs.map(song => `${song.artist} - ${song.name}`).join('\n'),
      summary: `Added ${foundSongs.length} songs, could not find results for ${notFoundSongs.length} songs on Spotify`,
      playlist_data: {
        playlistUrl,
        message: description,
        songList: foundSongs.map(song => `${song.artist} - ${song.name}`).join('\n'),
        summary: `Added ${foundSongs.length} songs, could not find results for ${notFoundSongs.length} songs on Spotify`
      }
    });
  } catch (error) {
    console.error('Error handling playlist creation:', error.response?.data || error.message);
    res.status(500).json({ 
      message: 'Failed to create playlist',
      error: error.response?.data?.error?.message || error.message
    });
  }
});

// Get user's most recent playlist
router.get('/recent', async (req, res) => {
  const accessToken = req.headers.authorization?.split(' ')[1];

  if (!accessToken) {
    return res.status(400).json({ message: 'Missing access token' });
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

    // Get most recent playlist
    const { data, error } = await supabase
      .from('playlists')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching recent playlist:', error);
      return res.status(500).json({ message: 'Failed to fetch recent playlist' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error handling recent playlist request', error);
    res.status(500).json({ message: 'Failed to get recent playlist' });
  }
});

// Get a specific playlist
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const accessToken = req.headers.authorization?.split(' ')[1];

  if (!accessToken) {
    return res.status(400).json({ message: 'Missing access token' });
  }

  try {
    // Get playlist
    const { data, error } = await supabase
      .from('playlists')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching playlist:', error);
      return res.status(500).json({ message: 'Failed to fetch playlist' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error handling playlist request', error);
    res.status(500).json({ message: 'Failed to get playlist' });
  }
});

router.post('/create', async (req, res) => {
  try {
    const { prompt, userId } = req.body;
    
    // Generate playlist using AI
    const aiResponse = await generatePlaylist(prompt, userId);
    
    // Extract tracks from AI response
    const tracks = aiResponse.playlist.split('\n').map(line => {
      const [artist, ...titleParts] = line.split(' - ');
      const title = titleParts.join(' - ').trim();
      return { artist, title };
    });

    // Create playlist in Spotify
    const spotifyResponse = await createSpotifyPlaylist(userId, prompt, tracks);
    
    res.json({
      success: true,
      playlist: spotifyResponse,
      description: aiResponse.description
    });
  } catch (error) {
    console.error('Error creating playlist:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;
