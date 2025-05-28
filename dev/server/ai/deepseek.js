const axios = require('axios');
const supabase = require('../supabaseClient');

/**
 * Fetch recent liked songs for a given user.
 */
async function getUserLikedSongs(userId, limit = 10) {
  const { data, error } = await supabase
    .from('liked_songs')
    .select('name, artists, song_data, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching liked songs:', error);
    throw error;
  }

  return data.map(song => ({
    name: song.name,
    artists: song.artists,
    created_at: song.created_at,
    // Extract additional data from song_data
    release_date: song.song_data?.album?.release_date,
    energy: song.song_data?.energy,
    popularity: song.song_data?.popularity,
    genres: song.song_data?.genres || []
  }));
}

/**
 * Format liked songs into a readable list for the AI prompt.
 */
function formatSongsForPrompt(songs) {
  if (!songs || songs.length === 0) return 'No specific preferences available.';
  return songs.map(song => `- ${song.artists} - ${song.name}`).join('\n');
}

/**
 * Get user's feedback history to understand their preferences.
 */
async function getUserFeedbackHistory(userId) {
  const { data, error } = await supabase
    .from('song_feedback')
    .select('song_data, feedback_type, rating, feedback_text, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching feedback history:', error);
    return [];
  }

  return data.map(feedback => ({
    song_data: {
      name: feedback.song_data?.name,
      artists: feedback.song_data?.artists,
      release_date: feedback.song_data?.album?.release_date,
      energy: feedback.song_data?.energy,
      popularity: feedback.song_data?.popularity,
      genres: feedback.song_data?.genres || []
    },
    feedback_type: feedback.feedback_type,
    rating: feedback.rating,
    feedback_text: feedback.feedback_text,
    created_at: feedback.created_at
  }));
}

/**
 * Process feedback history and create a summary of preferences.
 */
function processFeedbackHistory(feedbackHistory, likedSongs) {
  const artistFeedback = new Map();
  const genreFeedback = new Map();
  const songFeedback = new Map();
  const dislikedSongs = new Set();
  const likedSongsSet = new Set(likedSongs.map(song => `${song.artists} - ${song.name}`));
  const eraFeedback = new Map();
  const energyLevels = new Map();
  const feedbackKeywords = new Map(); // Track keywords from written feedback

  // First process explicit feedback
  feedbackHistory.forEach((feedback, index) => {
    const song = feedback.song_data;
    
    if (!song || !song.artists) {
      console.error('Invalid song data in feedback:', JSON.stringify(song));
      return;
    }

    // Ensure artists is an array
    const artists = Array.isArray(song.artists) ? song.artists : [song.artists];
    const songKey = `${artists.map(a => a.name).join(', ')} - ${song.name}`;
    
    // Calculate rating weight (higher ratings have more impact)
    let ratingWeight = 1;
    if (feedback.rating !== undefined && feedback.rating !== null) {
      ratingWeight = (feedback.rating / 5) * 2; // Ratings have double weight
    } else if (feedback.feedback_type === 'like') {
      ratingWeight = 1.5;
    } else if (feedback.feedback_type === 'dislike') {
      ratingWeight = 0.5;
      dislikedSongs.add(song.name);
    }

    // Process written feedback if available
    if (feedback.feedback_text) {
      // Simple keyword extraction (can be enhanced with NLP)
      const keywords = feedback.feedback_text.toLowerCase()
        .split(/[\s,.!?]+/)
        .filter(word => word.length > 3); // Filter out short words
      
      keywords.forEach(keyword => {
        if (!feedbackKeywords.has(keyword)) {
          feedbackKeywords.set(keyword, { count: 0, totalWeight: 0 });
        }
        const keywordData = feedbackKeywords.get(keyword);
        keywordData.count++;
        keywordData.totalWeight += ratingWeight;
      });
    }

    // Track era information
    if (song.release_date) {
      const year = new Date(song.release_date).getFullYear();
      const decade = Math.floor(year / 10) * 10;
      if (!eraFeedback.has(decade)) {
        eraFeedback.set(decade, { count: 0, totalWeight: 0 });
      }
      const eraData = eraFeedback.get(decade);
      eraData.count++;
      eraData.totalWeight += ratingWeight;
    }

    // Track energy levels
    if (song.energy) {
      const energyLevel = Math.floor(song.energy * 10) / 10; // Round to 1 decimal
      if (!energyLevels.has(energyLevel)) {
        energyLevels.set(energyLevel, { count: 0, totalWeight: 0 });
      }
      const energyData = energyLevels.get(energyLevel);
      energyData.count++;
      energyData.totalWeight += ratingWeight;
    }

    // Track genre information
    if (song.genres && song.genres.length > 0) {
      song.genres.forEach(genre => {
        if (!genre) return;
        
        if (!genreFeedback.has(genre)) {
          genreFeedback.set(genre, { 
            likes: 0, 
            dislikes: 0, 
            totalWeight: 0,
            isRecent: false,
            artists: new Set()
          });
        }
        const genreData = genreFeedback.get(genre);
        if (isPositive) genreData.likes += ratingWeight;
        if (isNegative) genreData.dislikes += ratingWeight;
        genreData.totalWeight += ratingWeight;
        artists.forEach(artist => {
          if (artist && artist.name) genreData.artists.add(artist.name);
        });
        
        // Mark as recent if within last 30 days
        const feedbackDate = new Date(feedback.created_at);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        genreData.isRecent = feedbackDate > thirtyDaysAgo;
      });
    }

    // Determine feedback sentiment
    const isPositive = feedback.feedback_type === 'like' || 
                      (feedback.feedback_type !== 'dislike' && feedback.rating >= 4);
    const isNegative = feedback.feedback_type === 'dislike' || 
                      (feedback.feedback_type !== 'like' && feedback.rating <= 2);

    // Track artist feedback
    artists.forEach(artist => {
      if (!artist || !artist.name) return;
      
      if (!artistFeedback.has(artist.name)) {
        artistFeedback.set(artist.name, { 
          likes: 0, 
          dislikes: 0, 
          totalWeight: 0,
          songs: new Set(),
          recentSongs: new Set(),
          isLiked: false,
          feedbackComments: [] // Store written feedback for this artist
        });
      }
      const artistData = artistFeedback.get(artist.name);
      if (isPositive) artistData.likes += ratingWeight;
      if (isNegative) artistData.dislikes += ratingWeight;
      artistData.totalWeight += ratingWeight;
      artistData.songs.add(song.name);
      artistData.isLiked = artistData.isLiked || likedSongsSet.has(songKey);
      
      // Store written feedback for this artist
      if (feedback.feedback_text) {
        artistData.feedbackComments.push({
          text: feedback.feedback_text,
          rating: feedback.rating,
          created_at: feedback.created_at
        });
      }
      
      // Mark as recent if within last 30 days
      const feedbackDate = new Date(feedback.created_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      if (feedbackDate > thirtyDaysAgo) {
        artistData.recentSongs.add(song.name);
      }
    });

    // Track song-specific feedback
    if (song.id) {
      if (!songFeedback.has(song.id)) {
        songFeedback.set(song.id, {
          name: song.name,
          artists: artists.map(a => a.name),
          likes: 0,
          dislikes: 0,
          totalWeight: 0,
          isRecent: false,
          isLiked: likedSongsSet.has(songKey),
          feedbackComments: [] // Store written feedback for this song
        });
      }
      const songData = songFeedback.get(song.id);
      if (isPositive) songData.likes += ratingWeight;
      if (isNegative) songData.dislikes += ratingWeight;
      songData.totalWeight += ratingWeight;
      
      // Store written feedback for this song
      if (feedback.feedback_text) {
        songData.feedbackComments.push({
          text: feedback.feedback_text,
          rating: feedback.rating,
          created_at: feedback.created_at
        });
      }
      
      // Mark as recent if within last 30 days
      const feedbackDate = new Date(feedback.created_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      songData.isRecent = feedbackDate > thirtyDaysAgo;
    }
  });

  // Then process liked songs that don't have explicit feedback
  likedSongs.forEach(song => {
    if (!song.artists) return;
    
    // Ensure artists is an array
    const artists = Array.isArray(song.artists) ? song.artists : [song.artists];
    const songKey = `${artists.map(a => a.name).join(', ')} - ${song.name}`;
    
    // Track era information for liked songs
    if (song.release_date) {
      const year = new Date(song.release_date).getFullYear();
      const decade = Math.floor(year / 10) * 10;
      if (!eraFeedback.has(decade)) {
        eraFeedback.set(decade, { count: 0, totalWeight: 1 });
      }
      const eraData = eraFeedback.get(decade);
      eraData.count++;
      eraData.totalWeight += 1;
    }

    // Track energy levels for liked songs
    if (song.energy) {
      const energyLevel = Math.floor(song.energy * 10) / 10;
      if (!energyLevels.has(energyLevel)) {
        energyLevels.set(energyLevel, { count: 0, totalWeight: 1 });
      }
      const energyData = energyLevels.get(energyLevel);
      energyData.count++;
      energyData.totalWeight += 1;
    }

    artists.forEach(artist => {
      if (!artist || !artist.name) return;
      
      if (!artistFeedback.has(artist.name)) {
        artistFeedback.set(artist.name, { 
          likes: 1, 
          dislikes: 0, 
          totalWeight: 1,
          songs: new Set(),
          recentSongs: new Set(),
          isLiked: true,
          feedbackComments: []
        });
      }
      const artistData = artistFeedback.get(artist.name);
      artistData.songs.add(song.name);
      artistData.isLiked = true;
      
      // Mark as recent if within last 30 days
      const songDate = new Date(song.created_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      if (songDate > thirtyDaysAgo) {
        artistData.recentSongs.add(song.name);
      }
    });
  });

  // Get top keywords from feedback
  const topKeywords = Array.from(feedbackKeywords.entries())
    .sort((a, b) => b[1].totalWeight - a[1].totalWeight)
    .slice(0, 5)
    .map(([keyword, data]) => `${keyword} (mentioned ${data.count} times)`);

  return { 
    artistFeedback, 
    genreFeedback, 
    songFeedback, 
    dislikedSongs,
    eraFeedback,
    energyLevels,
    topKeywords
  };
}

/**
 * Generate a playlist based on mood prompt and user's feedback history.
 */
async function generatePlaylist(prompt, userId, songCount = 10) {
  try {
    console.log('\n=== FETCHING USER PREFERENCES ===');
    
    // Get all user preferences
    const [likedSongs, feedbackHistory, preferences] = await Promise.all([
      getUserLikedSongs(userId),
      getUserFeedbackHistory(userId),
      supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
    ]);

    // Separate preferences by type and exclusion status
    const preferencesByType = {
      artist: { included: [], excluded: [] },
      song: { included: [], excluded: [] },
      genre: { included: [], excluded: [] },
      era: { included: [], excluded: [] }
    };

    preferences.data?.forEach(pref => {
      if (pref.is_excluded) {
        preferencesByType[pref.preference_type].excluded.push(pref.preference_value);
      } else {
        preferencesByType[pref.preference_type].included.push(pref.preference_value);
      }
    });

    // Filter out songs from excluded artists
    const filteredLikedSongs = likedSongs.filter(song => {
      const artist = song.artists;
      return !preferencesByType.artist.excluded.some(excluded => 
        artist.toLowerCase().includes(excluded.toLowerCase())
      );
    });

    // Log if any songs were filtered out
    if (filteredLikedSongs.length !== likedSongs.length) {
      console.log('\n=== FILTERED EXCLUDED ARTISTS ===');
      console.log(`Filtered out ${likedSongs.length - filteredLikedSongs.length} songs from excluded artists`);
    }

    console.log(`Found ${filteredLikedSongs.length} liked songs after filtering`);
    console.log(`Found ${feedbackHistory.length} feedback entries`);
    console.log('Preference counts:', {
      includedArtists: preferencesByType.artist.included.length,
      excludedArtists: preferencesByType.artist.excluded.length,
      includedSongs: preferencesByType.song.included.length,
      excludedSongs: preferencesByType.song.excluded.length,
      includedGenres: preferencesByType.genre.included.length,
      excludedGenres: preferencesByType.genre.excluded.length,
      includedEras: preferencesByType.era.included.length,
      excludedEras: preferencesByType.era.excluded.length
    });

    // Process feedback history with filtered liked songs
    const { 
      artistFeedback, 
      genreFeedback, 
      songFeedback, 
      dislikedSongs,
      eraFeedback,
      energyLevels,
      topKeywords
    } = processFeedbackHistory(feedbackHistory, filteredLikedSongs);

    // Create a context from feedback
    const feedbackContext = [];
    
    // Add included artists
    if (preferencesByType.artist.included.length > 0) {
      feedbackContext.push(`Included artists: ${preferencesByType.artist.included.join(', ')}`);
    }

    // Add excluded artists
    if (preferencesByType.artist.excluded.length > 0) {
      feedbackContext.push(`Excluded artists: ${preferencesByType.artist.excluded.join(', ')}`);
    }

    // Add included songs
    if (preferencesByType.song.included.length > 0) {
      feedbackContext.push(`Included songs: ${preferencesByType.song.included.join(', ')}`);
    }

    // Add excluded songs
    if (preferencesByType.song.excluded.length > 0) {
      feedbackContext.push(`Excluded songs: ${preferencesByType.song.excluded.join(', ')}`);
    }

    // Add included genres
    if (preferencesByType.genre.included.length > 0) {
      feedbackContext.push(`Included genres: ${preferencesByType.genre.included.join(', ')}`);
    }

    // Add excluded genres
    if (preferencesByType.genre.excluded.length > 0) {
      feedbackContext.push(`Excluded genres: ${preferencesByType.genre.excluded.join(', ')}`);
    }

    // Add included eras
    if (preferencesByType.era.included.length > 0) {
      feedbackContext.push(`Included eras: ${preferencesByType.era.included.join(', ')}`);
    }

    // Add excluded eras
    if (preferencesByType.era.excluded.length > 0) {
      feedbackContext.push(`Excluded eras: ${preferencesByType.era.excluded.join(', ')}`);
    }

    // Add top liked artists from feedback
    const topArtists = Array.from(artistFeedback.entries())
      .filter(([_, data]) => data.isLiked)
      .sort((a, b) => b[1].totalWeight - a[1].totalWeight)
      .slice(0, 5)
      .map(([artist, data]) => {
        const allSongs = Array.from(data.songs);
        const recentSongs = Array.from(data.recentSongs);
        const songsList = recentSongs.length > 0 
          ? `recent songs: ${recentSongs.join(', ')}`
          : `songs: ${allSongs.join(', ')}`;
        
        return `${artist} (liked ${data.likes.toFixed(1)} times, ${songsList})`;
      });
    
    if (topArtists.length > 0) {
      feedbackContext.push(`Top liked artists from feedback: ${topArtists.join('; ')}`);
    }

    // Add genre preferences from feedback
    const topGenres = Array.from(genreFeedback.entries())
      .sort((a, b) => b[1].totalWeight - a[1].totalWeight)
      .slice(0, 3)
      .map(([genre, data]) => {
        const artists = Array.from(data.artists).slice(0, 3).join(', ');
        return `${genre} (liked ${data.likes.toFixed(1)} times, artists: ${artists})`;
      });
    
    if (topGenres.length > 0) {
      feedbackContext.push(`Top liked genres from feedback: ${topGenres.join('; ')}`);
    }

    // Add era preferences from feedback
    const feedbackEraPreferences = Array.from(eraFeedback.entries())
      .sort((a, b) => b[1].totalWeight - a[1].totalWeight)
      .map(([decade, data]) => `${decade}s (${data.count} songs)`);
    
    if (feedbackEraPreferences.length > 0) {
      feedbackContext.push(`Era preferences from feedback: ${feedbackEraPreferences.join(', ')}`);
    }

    // Add energy level preferences
    const preferredEnergy = Array.from(energyLevels.entries())
      .sort((a, b) => b[1].totalWeight - a[1].totalWeight)
      .slice(0, 2)
      .map(([level, data]) => `energy level ${level} (${data.count} songs)`);
    
    if (preferredEnergy.length > 0) {
      feedbackContext.push(`Preferred energy levels: ${preferredEnergy.join(', ')}`);
    }

    // Add feedback keywords
    if (topKeywords.length > 0) {
      feedbackContext.push(`Common feedback themes: ${topKeywords.join(', ')}`);
    }

    // Add liked songs context
    const likedSongsContext = formatSongsForPrompt(filteredLikedSongs);

    // Create the prompt with feedback context
    const fullPrompt = `
Create a ${songCount}-song playlist for this theme: "${prompt}"

User's music preferences:
${likedSongsContext}

Feedback context:
${feedbackContext.join('\n')}

CRITICAL SONG SELECTION REQUIREMENTS:

1. SONG EXISTENCE:
   - ONLY suggest songs that actually exist and are available on Spotify
   - DO NOT make up songs or suggest non-existent tracks
   - Verify that each song exists before suggesting it
   - Each song must be a real, released track by the artist
   - Do not modify or create variations of existing songs

2. THEME INTERPRETATION:
   - Carefully analyze the theme "${prompt}"
   - Consider the mood, style, and energy level implied by the theme
   - Select music that authentically matches the theme's requirements
   - Let the theme guide the genre and style selection
   - Do not make assumptions about genre - let the theme determine the appropriate style
   - Consider how the theme might relate to different eras of music

3. SONG SELECTION:
   - Consider the user's liked songs when making selections
   - Include some of their liked songs if they match the theme well
   - Feel free to include new songs that better match the theme
   - Focus on creating a cohesive playlist that matches the theme's mood and style
   - ABSOLUTELY DO NOT include any songs by these excluded artists: ${preferencesByType.artist.excluded.join(', ')}
   - ABSOLUTELY DO NOT include songs from excluded eras: ${preferencesByType.era.excluded.join(', ')}
   - ABSOLUTELY DO NOT include excluded songs: ${preferencesByType.song.excluded.join(', ')}
   - ABSOLUTELY DO NOT include songs from excluded genres: ${preferencesByType.genre.excluded.join(', ')}
   - STRONGLY PRIORITIZE songs by included artists, especially if they match the theme well
   - For included artists, try to include at least one song from each if they have music that fits the theme
   - Prioritize songs from included eras: ${preferencesByType.era.included.join(', ')}
   - Prioritize included songs: ${preferencesByType.song.included.join(', ')}
   - Prioritize songs from included genres: ${preferencesByType.genre.included.join(', ')}
   - If the theme suggests a specific era, prioritize that era while respecting user preferences
   - Consider the energy levels that the user typically enjoys

4. DISCOVERY SONGS:
   - Include a mix of familiar and new songs (aim for 30% familiar, 70% new)
   - Choose music that matches the theme's style
   - Consider the mood and energy level of the theme
   - Select pieces that complement the theme
   - Choose music that expands on the theme while maintaining quality
   - Ensure new songs respect all user preferences
   - When selecting new songs, consider the user's preferred artists and genres
   - If an included artist has multiple songs that fit the theme, consider including more than one

5. SONG QUALITY CRITERIA:
   - All pieces must be well-known and high-quality
   - Must match the theme's mood and style
   - Should provide a cohesive listening experience
   - Should maintain the integrity of the theme
   - Must respect all user preferences
   - Consider the user's feedback history when selecting songs
   - Avoid songs that the user has explicitly disliked
   - For included artists, prioritize their most popular or well-known songs that match the theme

6. PLAYLIST STRUCTURE:
   - Start with a strong, attention-grabbing song that sets the theme
   - Build momentum through the middle of the playlist
   - End with a memorable song that leaves a lasting impression
   - Ensure smooth transitions between songs
   - Consider the overall arc and progression of the playlist
   - If an included artist has multiple songs that fit the theme, space them out appropriately

Please format your response in two parts:

1. First, write a brief message describing the playlist theme and vibe, like this:
"Here is a ${songCount}-song playlist for [theme]. This playlist captures the essence of [theme] with a mix of [genres/styles] that will [describe the mood/experience]. The playlist features [mention any notable aspects like era focus, energy levels, or specific artists]."

2. Then list EXACTLY ${songCount} songs, one per line, in this exact format:
ArtistName - TrackName

IMPORTANT:
- DO NOT include any additional text, headers, or formatting
- The description should be on its own line
- The songs should be listed one per line with no extra text
- Ensure all songs are real, existing songs
- ABSOLUTELY DO NOT include any songs by these excluded artists: ${preferencesByType.artist.excluded.join(', ')}
- Double-check that no songs are from excluded eras
- Double-check that no songs are in the excluded songs list
- Double-check that no songs are from excluded genres
- For included artists, ensure at least one song is included if they have music that fits the theme
- Verify that the playlist maintains a good flow and progression
`;

    // Validate the prompt before sending to AI
    const excludedArtistsList = preferencesByType.artist.excluded;
    if (excludedArtistsList.length > 0) {
      console.log('\n=== VALIDATING EXCLUDED ARTISTS ===');
      console.log('Excluded artists list:', excludedArtistsList);
      
      // Check if any excluded artists are in the liked songs context
      const likedSongsWithExcludedArtists = filteredLikedSongs.filter(song => {
        const artist = song.artists;
        return excludedArtistsList.some(excluded => 
          artist.toLowerCase().includes(excluded.toLowerCase())
        );
      });

      if (likedSongsWithExcludedArtists.length > 0) {
        console.error('\n=== EXCLUDED ARTISTS IN LIKED SONGS ===');
        console.error('Problematic liked songs:', likedSongsWithExcludedArtists);
        throw new Error('Cannot generate playlist: Excluded artists found in liked songs context');
      }
    }

    console.log('\n=== SENDING REQUEST TO AI ===');
    console.log('Prompt:', fullPrompt);

    const response = await axios.post('http://127.0.0.1:11434/api/generate', {
      model: 'llama3',
      prompt: fullPrompt,
      stream: false
    });

    console.log('\n=== RAW AI RESPONSE ===');
    console.log(response.data.response);
    console.log('==================');

    // Split the response into lines and clean each line
    const lines = response.data.response
      .replace(/\d+\.\s*/g, '')  // Remove numbers
      .replace(/Artist\s*-\s*/g, '')  // Remove "Artist - " prefix
      .replace(/^\s*ArtistName\s*-\s*TrackName\s*$/gm, '')  // Remove example line
      .replace(/^Here is the playlist:$/gm, '')  // Remove simple header
      .replace(/^\*\*.*\*\*$/gm, '')  // Remove markdown headers
      .replace(/^\*\*Playlist:\*\*$/gm, '')  // Remove playlist header
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.includes('ArtistName - TrackName'));

    console.log('\n=== CLEANED LINES ===');
    console.log(lines);
    console.log('==================');

    // Find the description (should be the first non-song line)
    let description = '';
    let songStartIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes(' - ')) {
        description = lines[i];
        songStartIndex = i + 1;
        break;
      }
    }

    // If no description found, use default
    if (!description) {
      description = 'Here is your generated playlist!';
    }

    const songs = lines.slice(songStartIndex).filter(line => line.includes(' - '));

    // After getting the AI response, validate the songs against excluded artists
    const excludedArtists = preferencesByType.artist.excluded;
    console.log('\n=== VALIDATING EXCLUDED ARTISTS ===');
    console.log('Excluded artists list:', excludedArtists);
    
    const songsWithExcludedArtists = songs.filter(song => {
      const artist = song.split(' - ')[0].trim();
      const isExcluded = excludedArtists.some(excluded => {
        const match = artist.toLowerCase().includes(excluded.toLowerCase());
        if (match) {
          console.log(`Found excluded artist match: "${artist}" contains "${excluded}"`);
        }
        return match;
      });
      return isExcluded;
    });

    if (songsWithExcludedArtists.length > 0) {
      console.error('\n=== EXCLUDED ARTISTS FOUND ===');
      console.error('Problematic songs:', songsWithExcludedArtists);
      console.error('Full playlist:', songs);
      throw new Error(`AI included songs by excluded artists: ${songsWithExcludedArtists.join(', ')}. Please try again.`);
    }

    // Additional validation to ensure no partial matches
    const partialMatches = songs.filter(song => {
      const artist = song.split(' - ')[0].trim();
      return excludedArtists.some(excluded => {
        const excludedWords = excluded.toLowerCase().split(' ');
        return excludedWords.some(word => 
          word.length > 3 && artist.toLowerCase().includes(word)
        );
      });
    });

    if (partialMatches.length > 0) {
      console.error('\n=== PARTIAL MATCHES FOUND ===');
      console.error('Songs with partial matches:', partialMatches);
      throw new Error(`AI included songs that partially match excluded artists: ${partialMatches.join(', ')}. Please try again.`);
    }

    console.log('\n=== FINAL PARSED ===');
    console.log('Description:', description);
    console.log('Songs:', songs);
    console.log('==================');

    // Return the response as a single string with description and playlist
    return `${description}\n${songs.join('\n')}`;
  } catch (error) {
    console.error('Error generating playlist:', error);
    throw error;
  }
}

module.exports = { generatePlaylist };
