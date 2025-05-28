// routes/auth.js
const express = require('express');
const axios = require('axios');
const supabase = require('../supabaseClient'); // Keep using Supabase directly
const router = express.Router();

const FRONTEND_URL = 'http://localhost:3000';
const BACKEND_URL = 'http://localhost:3001'; // For internal API calls

// Redirect user to Spotify login
// Route to redirect users to Spotify's authorization page
router.get('/login', (req, res) => {
  const scope = [
    'user-read-private',
    'user-read-email',
    'playlist-modify-public',
    'playlist-modify-private',
    'user-library-read',     // To read liked songs
    'user-library-modify',   // Add this to allow saving tracks to library
    'streaming',             // Required for Web Playback SDK
    'user-read-playback-state', // Required for reading playback state
    'user-modify-playback-state', // Required for controlling playback
    'user-read-currently-playing' // Required for reading current track
  ].join(' ');

  const redirectUri = `${BACKEND_URL}/api/auth/callback`;

  const spotifyAuthUrl = `https://accounts.spotify.com/authorize?` +
    `client_id=${process.env.SPOTIFY_CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}`;

  res.redirect(spotifyAuthUrl);
});


// Handle Spotify callback
router.get('/callback', async (req, res) => {
  const code = req.query.code;
  const error = req.query.error;
  
  if (error) {
    console.error('Spotify auth error:', error);
    return res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    console.error('No code received from Spotify');
    return res.redirect(`${FRONTEND_URL}/login?error=no_code`);
  }

  const redirectUri = `${BACKEND_URL}/api/auth/callback`;

  try {
    // Exchange code for tokens
    const tokenRes = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(
            process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
          ).toString('base64')
        }
      }
    );

    if (!tokenRes.data || !tokenRes.data.access_token) {
      console.error('Invalid token response:', tokenRes.data);
      return res.redirect(`${FRONTEND_URL}/login?error=invalid_token_response`);
    }

    const { access_token, refresh_token } = tokenRes.data;

    // Get user profile from Spotify
    const userRes = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    if (!userRes.data || !userRes.data.id) {
      console.error('Invalid user response:', userRes.data);
      return res.redirect(`${FRONTEND_URL}/login?error=invalid_user_response`);
    }

    const spotify_id = userRes.data.id;

    // Upsert user into Supabase
    const { error: dbError } = await supabase
      .from('users')
      .upsert({
        spotify_id,
        access_token,
        refresh_token,
        preferences: {}
      }, {
        onConflict: 'spotify_id'
      });

    if (dbError) {
      console.error('Error upserting user data in Supabase:', dbError);
      return res.redirect(`${FRONTEND_URL}/login?error=database_error`);
    }

    // Fetch liked songs
    try {
      await axios.get(`${BACKEND_URL}/api/liked-songs/${spotify_id}?access_token=${access_token}`);
    } catch (likedSongsError) {
      console.error('Error fetching liked songs:', likedSongsError);
      // Continue with login even if liked songs fetch fails
    }

    // Redirect to frontend with tokens
    res.redirect(`${FRONTEND_URL}/dashboard?access_token=${access_token}&refresh_token=${refresh_token}`);
  } catch (error) {
    console.error('Auth callback error:', error.response?.data || error.message);
    res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent(error.message)}`);
  }
});

// Get current user's ID
router.get('/me', async (req, res) => {
  try {
    const accessToken = req.headers.authorization?.split(' ')[1];
    if (!accessToken) {
      return res.status(401).json({ error: 'No access token provided' });
    }

    // Get user profile from Spotify
    const userRes = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!userRes.data || !userRes.data.id) {
      return res.status(400).json({ error: 'Invalid user response' });
    }

    const spotify_id = userRes.data.id;

    // Get user from Supabase
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('spotify_id', spotify_id)
      .single();

    if (error) {
      console.error('Error fetching user from Supabase:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!data) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ id: data.id.toString() });
  } catch (error) {
    console.error('Error getting user ID:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
