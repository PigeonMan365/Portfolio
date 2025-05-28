const axios = require('axios');

// 🧼 Clean unnecessary tags from track titles before searching
function cleanTrackName(name) {
  return name
    .replace(/\(.*?Remaster.*?\)/gi, '')
    .replace(/\(.*?Live.*?\)/gi, '')
    .replace(/\(.*?Re[- ]?Recorded.*?\)/gi, '')
    .replace(/\(.*?Mono.*?\)/gi, '')
    .replace(/\(.*?Numbered.*?\)/gi, '')
    .replace(/\(.*?Original.*?\)/gi, '')
    .replace(/\(.*?in lyrics.*?\)/gi, '')
    .replace(/\(.*?\)/gi, '') // 🔥 catch-all: remove leftover parentheses
    .trim();
}

// 🎯 Extract artist-track pairs from AI response
function extractTrackInfoFromResponse(response) {
  const lines = response.split('\n');
  const trackInfos = [];
  const skipKeywords = ['vibe', 'genres', 'artists', 'highlights', 'tips', 'suggestions', 'playlist', 'additional'];

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    if (skipKeywords.some(keyword => lowerLine.includes(keyword))) continue;

    // Match: **Artist - Track**
    let match = line.match(/\*{1,2}\s*([^*]+?)\s*-\s*([^*]+?)\*{1,2}/);
    if (match) {
      const artist = match[1].trim().replace(/\*+/g, '');
      const track = match[2].trim();
      
      if (artist && track) {
        trackInfos.push({ artist, title: track });
        continue;
      }
    }

    // Match: "Track by Artist"
    match = line.match(/["""*]*(.+?)["""]*\s+by\s+(.+?)(?:\s*\(|$)/i);
    if (match) {
      const track = match[1].trim();
      const artist = match[2].trim();
      if (artist && track) {
        trackInfos.push({ artist, title: track });
        continue;
      }
    }

    // Match: "Artist - Track" (with optional numbering)
    match = line.match(/^\s*\d*\.?\s*([^-:\n\r]+?)\s*[-:\u2014]\s*(.+)/);
    if (match) {
      const artist = match[1].trim();
      const track = match[2].trim();
      if (artist && track) {
        trackInfos.push({ artist, title: track });
        continue;
      }
    }

    // Match: "Track" by "Artist"
    match = line.match(/["""*]*(.+?)["""]*\s*by\s*["""*](.+?)["""]*/i);
    if (match) {
      const track = match[1].trim();
      const artist = match[2].trim();
      if (artist && track) {
        trackInfos.push({ artist, title: track });
      }
    }
  }

  console.log('Extracted track infos:', trackInfos);
  return trackInfos;
}

// 🔍 Search Spotify for tracks with fuzzy matching and fallback
async function searchSpotifyTracks(trackInfos, accessToken, originalPrompt = '') {
  const trackUris = [];
  const foundSongs = [];
  const notFoundSongs = [];
  const seen = new Set();
  
  console.log('Starting search with track infos:', trackInfos);
  
  // Ensure trackInfos is an array and has the correct format
  const validTrackInfos = trackInfos.filter(info => {
    if (!info || typeof info !== 'object') return false;
    const { artist, title } = info;
    if (!artist || !title) return false;
    
    const key = `${artist.toLowerCase()}-${title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log('Valid track infos:', validTrackInfos);

  // Extract key themes from the original prompt
  const promptThemes = originalPrompt.toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 3 && !['the', 'and', 'with', 'that', 'this', 'for'].includes(word))
    .join(' ');

  for (const { artist, title } of validTrackInfos) {
    const cleanedTrack = cleanTrackName(title);
    const query = `track:${cleanedTrack} artist:${artist}`;
    console.log(`🔍 Searching Spotify for: ${query}`);

    try {
      const res = await axios.get(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`,
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      const items = res.data.tracks.items;
      console.log(`Found ${items.length} potential matches for ${query}`);

      // Try best fuzzy artist match
      let bestMatch = items.find(item =>
        item.artists.some(a => a.name.toLowerCase().includes(artist.toLowerCase()))
      );

      // Fallback to first result
      if (!bestMatch && items.length > 0) {
        console.warn(`⚠️ No perfect match, using first result for: ${title} by ${artist}`);
        bestMatch = items[0];
      }

      if (bestMatch) {
        trackUris.push(bestMatch.uri);
        foundSongs.push({ artist, name: title });
        console.log(`✅ Found: ${bestMatch.name} by ${bestMatch.artists[0].name}`);
      } else {
        // Try to find alternative songs that match the original request's theme
        console.log(`🔄 No exact match found, searching for thematic alternatives...`);
        
        // Combine the original prompt themes with the current track's context
        const themeQuery = `${promptThemes} ${cleanedTrack}`;

        const altRes = await axios.get(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(themeQuery)}&type=track&limit=10`,
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );

        const altItems = altRes.data.tracks.items;
        console.log(`Found ${altItems.length} thematic alternatives for ${themeQuery}`);

        if (altItems.length > 0) {
          // Find the most popular song that matches the theme
          const altMatch = altItems.reduce((best, current) => 
            current.popularity > (best?.popularity || 0) ? current : best
          );

          trackUris.push(altMatch.uri);
          foundSongs.push({ artist: altMatch.artists[0].name, name: altMatch.name });
          console.log(`✅ Found thematic alternative: ${altMatch.name} by ${altMatch.artists[0].name}`);
        } else {
          notFoundSongs.push({ artist, title });
          console.warn(`❌ No match found for: ${title} by ${artist}`);
        }
      }
    } catch (error) {
      console.error(`Error searching for track: ${title} by ${artist}`, error);
      notFoundSongs.push({ artist, title });
    }
  }

  return { trackUris, foundSongs, notFoundSongs };
}

// 🎵 Create the playlist on user's account
async function createSpotifyPlaylist(userId, name, trackUris, accessToken) {
  try {
    // Validate inputs
    if (!userId || !name || !accessToken) {
      throw new Error('Missing required parameters for playlist creation');
    }

    if (!Array.isArray(trackUris) || trackUris.length === 0) {
      throw new Error('No valid tracks to add to playlist');
    }

    // Create the playlist
    const playlistRes = await axios.post(
      `https://api.spotify.com/v1/users/${userId}/playlists`,
      {
        name,
        description: "Generated by Push'd AI 🎶",
        public: false
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    const playlistId = playlistRes.data.id;
    console.log(`Created playlist with ID: ${playlistId}`);

    // Add tracks in batches to avoid rate limiting
    const batchSize = 100;
    for (let i = 0; i < trackUris.length; i += batchSize) {
      const batch = trackUris.slice(i, i + batchSize);
      console.log(`Adding batch of ${batch.length} tracks to playlist...`);
      
      await axios.post(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
        { uris: batch },
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );
    }

    return playlistRes.data.external_urls.spotify;
  } catch (error) {
    console.error('Error creating playlist:', error);
    throw error;
  }
}

module.exports = {
  cleanTrackName,
  extractTrackInfoFromResponse,
  searchSpotifyTracks,
  createSpotifyPlaylist
};
