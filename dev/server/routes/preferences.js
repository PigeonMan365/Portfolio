const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Get user's artists
router.get('/artists', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('preference_type', 'artist');

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching artists:', error);
    res.status(500).json({ error: 'Failed to fetch artists' });
  }
});

// Add new artist
router.post('/artists', async (req, res) => {
  try {
    const { value, isExcluded } = req.body;
    const { data, error } = await supabase
      .from('user_preferences')
      .insert([
        { preference_type: 'artist', preference_value: value, is_excluded: isExcluded }
      ])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error adding artist:', error);
    res.status(500).json({ error: 'Failed to add artist' });
  }
});

// Get user's songs
router.get('/songs', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('preference_type', 'song');

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching songs:', error);
    res.status(500).json({ error: 'Failed to fetch songs' });
  }
});

// Add new song
router.post('/songs', async (req, res) => {
  try {
    const { value, isExcluded } = req.body;
    const { data, error } = await supabase
      .from('user_preferences')
      .insert([
        { preference_type: 'song', preference_value: value, is_excluded: isExcluded }
      ])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error adding song:', error);
    res.status(500).json({ error: 'Failed to add song' });
  }
});

// Get user's genres
router.get('/genres', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('preference_type', 'genre');

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching genres:', error);
    res.status(500).json({ error: 'Failed to fetch genres' });
  }
});

// Add new genre
router.post('/genres', async (req, res) => {
  try {
    const { value, isExcluded } = req.body;
    const { data, error } = await supabase
      .from('user_preferences')
      .insert([
        { preference_type: 'genre', preference_value: value, is_excluded: isExcluded }
      ])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error adding genre:', error);
    res.status(500).json({ error: 'Failed to add genre' });
  }
});

// Get user's eras
router.get('/eras', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('preference_type', 'era');

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching eras:', error);
    res.status(500).json({ error: 'Failed to fetch eras' });
  }
});

// Add new era
router.post('/eras', async (req, res) => {
  try {
    const { value, isExcluded } = req.body;
    const { data, error } = await supabase
      .from('user_preferences')
      .insert([
        { preference_type: 'era', preference_value: value, is_excluded: isExcluded }
      ])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error adding era:', error);
    res.status(500).json({ error: 'Failed to add era' });
  }
});

// Remove preference
router.delete('/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    const { error } = await supabase
      .from('user_preferences')
      .delete()
      .eq('id', id)
      .eq('preference_type', type);

    if (error) throw error;
    res.status(204).send();
  } catch (error) {
    console.error('Error removing preference:', error);
    res.status(500).json({ error: 'Failed to remove preference' });
  }
});

// Toggle preference exclusion
router.post('/:type/:id/exclude', async (req, res) => {
  try {
    const { type, id } = req.params;
    const { data, error } = await supabase
      .from('user_preferences')
      .update({ is_excluded: true })
      .eq('id', id)
      .eq('preference_type', type)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error toggling preference exclusion:', error);
    res.status(500).json({ error: 'Failed to toggle preference exclusion' });
  }
});

module.exports = router;
