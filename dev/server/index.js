// index.js
require('dotenv').config();

const cors = require('cors');
const express = require('express');
const bodyParser = require('body-parser');
const userRoutes = require('./routes/user'); 
const userPreferencesRoutes = require('./routes/userPreferences');

const authRoutes = require('./routes/auth');
const playlistRoutes = require('./routes/playlist');
const likedSongsRoutes = require('./routes/likedSongs');
const feedbackRoutes = require('./routes/feedback');
const testRoutes = require('./routes/test');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use('/api/test', testRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/liked-songs', likedSongsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/user-preferences', userPreferencesRoutes);

// ✅ Start server directly — no DB pool needed
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
