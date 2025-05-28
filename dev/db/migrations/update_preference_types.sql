-- Drop the existing constraint
ALTER TABLE user_preferences DROP CONSTRAINT user_preferences_preference_type_check;

-- Add the new constraint with 'era' included
ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_preference_type_check 
CHECK (preference_type IN ('artist', 'song', 'genre', 'era')); 