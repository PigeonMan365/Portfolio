const express = require('express');
const app = express();
const userPreferencesRouter = require('./routes/userPreferences');

// ... existing code ...

app.use('/api/user-preferences', userPreferencesRouter);

// ... existing code ... 