// routes/user.js
const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Get user profile (existing)
router.get('/:spotifyId', async (req, res) => {
  const { spotifyId } = req.params;
  res.json({
    spotifyId,
    preferences: {}
  });
});

// Update preferences (existing)
router.put('/:spotifyId', async (req, res) => {
  const { spotifyId } = req.params;
  const { preferences } = req.body;
  res.json({
    message: 'User preferences updated',
    spotifyId,
    preferences
  });
});

// 🆕 Upsert user from auth flow
// routes/user.js
router.post('/upsert', async (req, res) => {
  const { spotify_id, access_token, refresh_token } = req.body;

  try {
    const { error } = await supabase
      .from('users')
      .upsert(
        {
          spotify_id,
          access_token,
          refresh_token,
          preferences: {} // optional default prefs
        },
        {
          onConflict: 'spotify_id' // ✅ this resolves the unique constraint error
        }
      );

    if (error) {
      console.error('Supabase upsert error:', error);
      return res.status(500).json({ error: 'Failed to upsert user' });
    }

    res.json({ message: 'User upserted successfully' });
  } catch (err) {
    console.error('Unexpected error during upsert:', err);
    res.status(500).json({ error: 'Unexpected error during user upsert' });
  }
});


module.exports = router;
