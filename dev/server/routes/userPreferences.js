const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// Wipe all preferences
router.delete('/wipe/:userId', async (req, res) => {
  try {
    console.log('Received request to wipe preferences');
    console.log('Full URL:', req.originalUrl);
    console.log('Request params:', req.params);
    console.log('Request body:', req.body);
    console.log('Request headers:', req.headers);

    const userId = req.params.userId;
    console.log('Extracted userId from params:', userId);
    console.log('Type of userId:', typeof userId);

    if (!userId) {
      console.log('No userId provided in params');
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Convert userId to number for database query
    const numericUserId = parseInt(userId, 10);
    if (isNaN(numericUserId)) {
      console.log('Invalid userId format:', userId);
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    console.log('Attempting to delete preferences for user:', numericUserId);
    const { error } = await supabase
      .from('user_preferences')
      .delete()
      .eq('user_id', numericUserId);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Failed to wipe preferences' });
    }

    console.log('Successfully wiped preferences for user:', numericUserId);
    res.json({ message: 'All preferences wiped successfully' });
  } catch (error) {
    console.error('Error wiping preferences:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user preferences by type
router.get('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .eq('preference_type', type);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error fetching user preferences:', error);
    res.status(500).json({ error: 'Failed to fetch user preferences' });
  }
});

// Add preference
router.post('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { value, isExcluded = false, userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (!value) {
      return res.status(400).json({ error: 'Preference value is required' });
    }

    // Validate preference type
    const validTypes = ['artist', 'song', 'genre', 'era'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ 
        error: `Invalid preference type. Must be one of: ${validTypes.join(', ')}` 
      });
    }

    console.log('Adding preference:', { type, value, isExcluded, userId });

    const { data, error } = await supabase
      .from('user_preferences')
      .insert([
        { 
          user_id: userId, 
          preference_type: type, 
          preference_value: value, 
          is_excluded: isExcluded 
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      if (error.code === '23505') { // Unique violation
        return res.status(409).json({ error: 'This preference already exists' });
      }
      if (error.code === '23514') { // Check constraint violation
        return res.status(400).json({ error: `Invalid preference type. Must be one of: ${validTypes.join(', ')}` });
      }
      throw error;
    }

    res.status(201).json(data);
  } catch (error) {
    console.error('Error adding preference:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Remove preference
router.delete('/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const { error } = await supabase
      .from('user_preferences')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .eq('preference_type', type);

    if (error) throw error;
    res.json({ message: 'Preference removed successfully' });
  } catch (error) {
    console.error('Error removing preference:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle preference exclusion
router.post('/:type/:id/exclude', async (req, res) => {
  try {
    const { type, id } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const { data, error } = await supabase
      .from('user_preferences')
      .update({ is_excluded: true })
      .eq('id', id)
      .eq('user_id', userId)
      .eq('preference_type', type)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error toggling preference exclusion:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router; 