DROP TABLE IF EXISTS liked_songs;
DROP TABLE IF EXISTS playlists;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
 id SERIAL PRIMARY KEY,
 spotify_id VARCHAR(255) NOT NULL UNIQUE,
 access_token VARCHAR(500),
 refresh_token VARCHAR(500),
 preferences JSONB,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE playlists (
 id SERIAL PRIMARY KEY,
 user_id INTEGER REFERENCES users(id),
 playlist_data JSONB, -- JSON data for the playlist
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE liked_songs (
 id SERIAL PRIMARY KEY,
 user_id INTEGER REFERENCES users(id),
 song_id VARCHAR(255) NOT NULL,
 song_data JSONB, -- JSON data for the song details
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE song_feedback (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  playlist_id INTEGER REFERENCES playlists(id),
  song_id VARCHAR(255) NOT NULL,
  song_data JSONB, -- Add this new column to store song details
  feedback_type VARCHAR(50) NOT NULL, -- e.g., 'like', 'dislike', 'skip'
  feedback_text TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    preference_type VARCHAR(20) NOT NULL CHECK (preference_type IN ('artist', 'song', 'genre', 'era')),
    preference_value VARCHAR(255) NOT NULL,
    is_excluded BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, preference_type, preference_value)
);
