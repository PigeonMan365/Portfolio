import React, { useEffect, useState, useCallback, useRef } from 'react';
import { FaCog } from 'react-icons/fa';
import '../styles/SpotifyPlayer.css';

// Keep track of script loading state globally
let scriptLoaded = false;
let scriptLoading = false;
// Add a global initialization lock to prevent loops
let isGlobalInitializing = false;

function loadSpotifyScript() {
  return new Promise((resolve, reject) => {
    if (scriptLoaded) {
      resolve();
      return;
    }

    if (scriptLoading) {
      const checkReady = setInterval(() => {
        if (scriptLoaded) {
          clearInterval(checkReady);
          resolve();
        }
      }, 100);
      return;
    }

    scriptLoading = true;

    // Create a timeout to reject if script takes too long to load
    const timeoutId = setTimeout(() => {
      scriptLoading = false;
      reject(new Error('Spotify SDK script load timeout'));
    }, 30000); // 30 second timeout

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;

    // Wait for both script load and SDK ready
    window.onSpotifyWebPlaybackSDKReady = () => {
      scriptLoaded = true;
      scriptLoading = false;
      clearTimeout(timeoutId);
      resolve();
    };

    script.onerror = (error) => {
      scriptLoading = false;
      clearTimeout(timeoutId);
      reject(error);
    };

    document.body.appendChild(script);
  });
}

async function verifySpotifyScopes(accessToken) {
  try {
    if (!accessToken) {
      throw new Error('No access token provided');
    }

    // Check user's scopes
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.status === 401) {
      throw new Error('Access token expired or invalid');
    }
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to fetch user data: ${errorData.error?.message || response.status}`);
    }

    const data = await response.json();
    console.log('Spotify user data:', data);
    
    // Verify premium status
    const product = data.product;
    if (product !== 'premium') {
      throw new Error(`Account type '${product}' detected - Premium required`);
    }

    return true;
  } catch (error) {
    console.error('Scope verification failed:', error);
    throw error;
  }
}

function SpotifyPlayer({ accessToken, playlistUrl }) {
  const [player, setPlayer] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [error, setError] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [queue, setQueue] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [lastPlaybackState, setLastPlaybackState] = useState(null);
  const [isTransferringPlayback, setIsTransferringPlayback] = useState(false);
  const [volume, setVolume] = useState(50);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const progressInterval = useRef(null);
  const volumeRef = useRef(50);
  const isDraggingRef = useRef(false);
  const [isRepeating, setIsRepeating] = useState(false);
  const [isAutoplaying, setIsAutoplaying] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isPlayerLoading, setIsPlayerLoading] = useState(false);
  const [isPlayerError, setIsPlayerError] = useState(false);
  const [playerError, setPlayerError] = useState(null);
  const [isPlayerInitialized, setIsPlayerInitialized] = useState(false);
  const [previousVolume, setPreviousVolume] = useState(50);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const [rateLimitRetryAfter, setRateLimitRetryAfter] = useState(0);
  // Add user paused ref at component level
  const userPausedRef = useRef(false);

  // Add state to track last track change time
  const lastTrackChangeTimeRef = useRef(0);
  // Minimum time between track changes (3 seconds)
  const MIN_TRACK_CHANGE_INTERVAL = 3000;

  // Add a state to track global rate limit
  const [globalRateLimit, setGlobalRateLimit] = useState({
    isLimited: false,
    retryAfter: 0,
    limitedUntil: null
  });
  
  // Add a ref to prevent multiple initialization attempts
  const initializingRef = useRef(false);
  
  // Use a ref to break circular dependencies
  const initializePlayerRef = useRef(null);
  const startPlaylistRef = useRef(null);
  // Add a ref to track device ID status
  const deviceIdAttempts = useRef(0);
  const deviceIdCheckInProgress = useRef(false);

  // Add an autoplay state to control initial playback
  const [shouldAutoPlay, setShouldAutoPlay] = useState(false);

  // Add notification state for non-error messages
  const [notification, setNotification] = useState(null);

  // 1. Add a ref to track the previous playlist URL
  const previousPlaylistUrlRef = useRef(null);

  // 1. Add a state to track if we've ever loaded the current playlist
  const [hasLoadedCurrentPlaylist, setHasLoadedCurrentPlaylist] = useState(false);

  // Define constants for rate limiting and retries
  const MAX_RETRY_ATTEMPTS = 2; // Reduced from 3 to 2
  const API_COOLDOWN_PERIOD = 120; // 2 minute cooldown when max retries exceeded
  const retryAttemptsRef = useRef({});

  // 1. Add a flag to track if we've actually made API requests
  const [hasAttemptedApiCalls, setHasAttemptedApiCalls] = useState(false);

  // 1. Add reconnectAttemptsRef at the component level with other refs
  // Add this with the other useRef declarations near the top of the component
  const reconnectAttemptsRef = useRef(0);

  // Add state to track last reconnection time
  const lastReconnectionTimeRef = useRef(0);
  // Minimum time between reconnections (15 seconds)
  const MIN_RECONNECTION_INTERVAL = 15000;

  // Add a state to track if user has dismissed rate limit warning
  const [hasDismissedRateLimit, setHasDismissedRateLimit] = useState(false);

  // Helper for checking rate limit
  const checkRateLimited = () => {
    if (!globalRateLimit.isLimited) return false;
    
    // Check if the rate limit has expired
    if (Date.now() >= globalRateLimit.limitedUntil) {
      console.log('Rate limit has expired, resetting limit state');
      // Reset rate limit state
      setGlobalRateLimit({
        isLimited: false,
        retryAfter: 0,
        limitedUntil: null
      });
      setIsRateLimited(false);
      setRateLimitRetryAfter(0);
      return false;
    }
    return true;
  };

  // Helper for setting rate limit
  const handleRateLimitResponse = (response) => {
    if (response.status === 429) {
      // Get retry-after value with a more conservative default (30s)
      const retryAfter = parseInt(response.headers.get('retry-after') || '30');
      console.log(`Rate limited. Required wait time: ${retryAfter} seconds`);
      
      // Set global rate limit with additional buffer time (+5s)
      const bufferTime = 5; // Add 5 seconds buffer
      const totalWaitTime = retryAfter + bufferTime;
      
      setGlobalRateLimit({
        isLimited: true,
        retryAfter: totalWaitTime,
        limitedUntil: Date.now() + (totalWaitTime * 1000)
      });
      
      setIsRateLimited(true);
      setRateLimitRetryAfter(totalWaitTime);
      return true;
    }
    return false;
  };

  // Safe fetch helper to handle rate limits
  const safeFetch = async (url, options = {}) => {
    // Mark that we've attempted API calls
    setHasAttemptedApiCalls(true);
    
    // Check if we're currently rate limited at the global level
    if (checkRateLimited()) {
      const timeToWait = Math.ceil((globalRateLimit.limitedUntil - Date.now()) / 1000);
      console.log(`Global rate limit active. Waiting ${timeToWait} seconds before trying again...`);
      
      // For non-critical operations, just return null instead of throwing
      if (options.silent) {
        console.log(`Silent mode for ${url}, returning null`);
        return null;
      }
      
      // For critical operations, still throw the error
      throw new Error(`Rate limited. Please wait ${timeToWait} seconds before trying again.`);
    }

    // Check if this URL has been retried too many times
    const urlKey = url.split('?')[0]; // Remove query params for tracking
    if (!retryAttemptsRef.current[urlKey]) {
      retryAttemptsRef.current[urlKey] = 0;
    }
    
    // If we've exceeded max retries, throw an error to prevent more attempts
    if (retryAttemptsRef.current[urlKey] >= MAX_RETRY_ATTEMPTS) {
      console.error(`Maximum retry attempts (${MAX_RETRY_ATTEMPTS}) exceeded for ${urlKey}`);
      
      if (options.silent) {
        console.log(`Silent mode for ${url}, returning null despite max retries`);
        return null;
      }
      
      // Set a longer global rate limit to force a cool-down period
      setGlobalRateLimit({
        isLimited: true,
        retryAfter: API_COOLDOWN_PERIOD, // Use the 1 hour cooldown
        limitedUntil: Date.now() + (API_COOLDOWN_PERIOD * 1000)
      });
      
      setError(`Too many API requests failed. Player features will be limited for ${Math.floor(API_COOLDOWN_PERIOD/60)} minutes.`);
      throw new Error(`Maximum retries exceeded for ${urlKey}. Please try again later.`);
    }

    try {
      // Increment retry count before making request
      retryAttemptsRef.current[urlKey]++;
      console.log(`API request to ${urlKey} (attempt ${retryAttemptsRef.current[urlKey]}/${MAX_RETRY_ATTEMPTS})`);
      
      // Add exponential backoff for retries
      if (retryAttemptsRef.current[urlKey] > 1) {
        const backoffTime = Math.pow(2, retryAttemptsRef.current[urlKey] - 1) * 1000;
        console.log(`Backing off for ${backoffTime/1000} seconds before retry`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
      
      const response = await fetch(url, options);
      
      // Handle rate limiting
      if (response.status === 429) {
        // Get retry-after value (default to 30 seconds if not provided)
        const retryAfter = parseInt(response.headers.get('retry-after') || '30');
        console.log(`Rate limited by Spotify. Required wait time: ${retryAfter} seconds`);
        
        // Add 30 seconds buffer to be safe
        const bufferTime = 30;
        const totalWaitTime = retryAfter + bufferTime;
        
        // Set global rate limit
        setGlobalRateLimit({
          isLimited: true,
          retryAfter: totalWaitTime,
          limitedUntil: Date.now() + (totalWaitTime * 1000)
        });
        
        setIsRateLimited(true);
        setRateLimitRetryAfter(totalWaitTime);
        
        if (options.silent) {
          console.log(`Silent mode for ${url}, returning null on rate limit`);
          return null;
        }
        
        // Throw error to stop execution chain
        throw new Error(`Rate limited. Please wait ${totalWaitTime} seconds before trying again.`);
      }
      
      // Handle 404 errors for playlists specifically
      if (response.status === 404 && url.includes('/playlists/')) {
        console.error(`Playlist not found: ${url}`);
        if (options.silent) {
          return null;
        }
        throw new Error('Playlist not found or inaccessible. Please check the URL.');
      }
      
      // Reset retry count on success
      if (response.ok) {
        retryAttemptsRef.current[urlKey] = 0;
      }
      
      return response;
    } catch (error) {
      console.error(`Error fetching ${url}:`, error);
      
      // Don't retry on rate limit errors - they should be handled separately
      if (error.message.includes('Rate limited')) {
        if (options.silent) {
          return null;
        }
        throw error;
      }
      
      // For other errors, let the caller handle them
      if (options.silent) {
        return null;
      }
      throw error;
    }
  };

  // Extract playlist ID from URL
  const getPlaylistId = (url) => {
    if (!url) return null;
    try {
      // Handle both full URLs and just the ID
      const matches = url.match(/playlist\/([a-zA-Z0-9]+)/) || url.match(/^([a-zA-Z0-9]+)$/);
      if (!matches || !matches[1]) {
        throw new Error('Invalid playlist URL format');
      }
      return matches[1];
    } catch (error) {
      console.error('Error extracting playlist ID:', error);
      return null;
    }
  };

  // Fetch playlist tracks with rate limit handling
  const fetchPlaylistTracks = async (playlistId) => {
    try {
      // Skip if rate limited
      if (checkRateLimited()) {
        console.log('Skipping playlist tracks fetch due to active rate limit');
        return [];
      }
      
      // Use silent mode to prevent errors from being displayed
      const response = await safeFetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        silent: true
      });
      
      if (!response) {
        console.warn('Failed to fetch playlist tracks due to rate limiting or other error');
        return [];
      }
      
      if (!response.ok) {
        console.warn(`Failed to fetch playlist tracks: ${response.status}`);
        return [];
      }
      
      const data = await response.json();
      return data.items.map(item => ({
        ...item.track,
        duration: millisToMinutesAndSeconds(item.track.duration_ms)
      }));
    } catch (error) {
      console.error('Error fetching playlist:', error);
      return [];
    }
  };

  // Convert milliseconds to MM:SS format
  const millisToMinutesAndSeconds = (millis) => {
    const minutes = Math.floor(millis / 60000);
    const seconds = ((millis % 60000) / 1000).toFixed(0);
    return `${minutes}:${seconds.padStart(2, '0')}`;
  };

  // Format time for display
  const formatTime = (millis) => {
    if (!millis) return '0:00';
    const minutes = Math.floor(millis / 60000);
    const seconds = ((millis % 60000) / 1000).toFixed(0);
    return `${minutes}:${(seconds < 10 ? '0' : '')}${seconds}`;
  };

  // Start playing the playlist
  const startPlaylist = async (startIndex = 0) => {
    // Check for rate limiting first
    if (checkRateLimited()) {
      const timeToWait = Math.ceil((globalRateLimit.limitedUntil - Date.now()) / 1000);
      console.log(`Rate limited. Waiting ${timeToWait} seconds before starting playlist...`);
      setNotification(`API rate limit reached. Limited features available for ${Math.floor(timeToWait/60)} minutes. Basic playback controls still work.`);
      return;
    }
    
    if (!playlistUrl) {
      console.error('Missing playlistUrl:', { deviceId, playlistUrl });
      setError('Missing playlist URL. Please try refreshing the page.');
      return;
    }
    
    // Validate that we have the correct playlist loaded
    const requestedPlaylistId = getPlaylistId(playlistUrl);
    if (!hasLoadedCurrentPlaylist || previousPlaylistUrlRef.current !== playlistUrl) {
      console.log('Playlist not fully loaded yet or playlist URL changed');
      console.log('Current playlist URL:', playlistUrl);
      console.log('Previously loaded playlist URL:', previousPlaylistUrlRef.current);
      
      // Force reload the current playlist
      try {
        setIsTransferringPlayback(true);
        setQueue([]);
        const tracks = await fetchPlaylistTracks(requestedPlaylistId);
        if (tracks.length === 0) {
          // First check if the playlist exists
          const playlistCheckResponse = await safeFetch(`https://api.spotify.com/v1/playlists/${requestedPlaylistId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            silent: true
          });
          
          if (!playlistCheckResponse) {
            throw new Error('Unable to verify playlist. You may be rate limited or the playlist does not exist.');
          }
          
          if (playlistCheckResponse.status === 404) {
            throw new Error('Playlist not found. Please check the URL and try again.');
          }
          
          if (!playlistCheckResponse.ok) {
            throw new Error(`Failed to access playlist: ${playlistCheckResponse.status}`);
          }
          
          const playlistData = await playlistCheckResponse.json();
          if (!playlistData.tracks || playlistData.tracks.total === 0) {
            throw new Error('This playlist is empty. Please try a different playlist.');
          }
          
          throw new Error('No tracks found in this playlist or you may not have access to it.');
        }
        
        setQueue(tracks);
        setHasLoadedCurrentPlaylist(true);
        previousPlaylistUrlRef.current = playlistUrl;
        console.log('Playlist validated, proceeding with playback');
        setError(null);
      } catch (error) {
        console.error('Error loading playlist tracks:', error);
        setError(`Failed to load the current playlist: ${error.message}`);
        setIsTransferringPlayback(false);
        return;
      }
    }
    
    // Check for device ID
    if (!deviceId) {
      // Prevent multiple simultaneous checks
      if (deviceIdCheckInProgress.current) {
        console.log('Already waiting for device ID...');
        return;
      }

      deviceIdCheckInProgress.current = true;
      deviceIdAttempts.current++;

      console.log('Waiting for device ID to be available...');
      setError('Waiting for player to initialize. Please wait a moment.');
      
      // Limit the number of attempts to avoid infinite loops
      if (deviceIdAttempts.current > 3) {
        console.log('Too many attempts waiting for device ID, reconnecting player...');
        setError('Player initialization taking too long. Reconnecting...');
        deviceIdCheckInProgress.current = false;
        
        // Force a full reconnect
        if (player) {
          try {
            await player.disconnect();
          } catch (e) {
            console.error('Error disconnecting player:', e);
          }
        }
        
        // Reset state
      setDeviceId(null);
      setPlayer(null);
        setIsPlayerReady(false);
        initializingRef.current = false;
        
        // Wait a moment and retry initialization
        await new Promise(resolve => setTimeout(resolve, 3000));
        await initializePlayerRef.current();
        return;
      }
      
      // Wait for device ID for up to 10 seconds
      let waitTime = 0;
      const maxWaitTime = 10000;
      const interval = 500;
      
      while (!deviceId && waitTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, interval));
        waitTime += interval;
        console.log(`Waiting for device ID... (${waitTime/1000}s)`);
      }
      
      deviceIdCheckInProgress.current = false;
      
      if (!deviceId) {
        setError('Player failed to initialize. Please retry.');
      return;
      }
    }
    
    const playlistId = getPlaylistId(playlistUrl);
    if (!playlistId) {
      console.error('Could not extract playlist ID from URL:', playlistUrl);
      setError('Invalid playlist URL. Please check the URL and try again.');
      return;
    }

    try {
      setIsTransferringPlayback(true);
      setError(null);
      console.log('Starting playlist playback...', { deviceId, playlistId, startIndex });

      // First verify the playlist exists and is accessible
      const playlistResponse = await safeFetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (playlistResponse.status === 404) {
        throw new Error('Playlist not found. Please check the URL and try again.');
      }

      if (!playlistResponse.ok) {
        throw new Error(`Failed to access playlist: ${playlistResponse.status}`);
      }

      const playlistData = await playlistResponse.json();
      if (!playlistData.tracks || playlistData.tracks.total === 0) {
        throw new Error('Playlist is empty. Please add some tracks and try again.');
      }

      // First ensure the device is active by transferring playback to it
      console.log('Setting this device as active before starting playback...');
      const transferResponse = await safeFetch('https://api.spotify.com/v1/me/player', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            device_ids: [deviceId],
            play: false
          })
      });
      
      if (!transferResponse.ok && transferResponse.status !== 204) {
        console.warn(`Warning: Failed to transfer playback: ${transferResponse.status}`);
      }
      
      // Wait for transfer to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get current player state directly from the Web Playback SDK
      let playerReady = false;
      if (player) {
        try {
          const state = await player.getCurrentState();
          playerReady = !!state || await player.activateElement();
          console.log('Player ready state check:', playerReady);
        } catch (e) {
          console.warn('Error checking player state:', e);
        }
      }

      // Activate device using Web Playback SDK first
      if (player) {
        try {
          console.log('Activating element via Web Playback SDK');
          await player.activateElement();
        } catch (e) {
          console.warn('Error activating element:', e);
        }
      }
      
      // Try direct Web API playback with single API call
      console.log('Setting active device and starting playback:', deviceId);
      const playResponse = await safeFetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            context_uri: `spotify:playlist:${playlistId}`,
            offset: { position: startIndex },
            position_ms: 0
          })
      });
      
      if (playResponse.ok) {
      console.log('Successfully started playlist playback');
      setIsPlaying(true);
      setError(null);
      } else if (playResponse.status === 404) {
        // Use Web SDK method instead
        console.log('Web API playback failed with 404, trying Web Playback SDK directly');
        if (player) {
          try {
            console.log('Trying to load context URI directly...');
            await player.activateElement();
            
            // Try a different approach - play first track individually instead of playlist
            const tracks = await fetchPlaylistTracks(playlistId);
            if (tracks.length === 0) {
              throw new Error('No tracks available in this playlist.');
            }
            
            console.log('Playing first track directly instead of playlist context...');
            const trackUri = tracks[startIndex]?.uri;
            if (!trackUri) {
              throw new Error('Track not available at selected index.');
            }
            
            // Play individual track instead of playlist context
            await safeFetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                uris: [trackUri],
                position_ms: 0
              })
            });
            
            // Verify that playback started
            const state = await player.getCurrentState();
            if (!state) {
              console.log('Still no state after direct track load, trying togglePlay...');
              // Just try to play/pause to trigger the player
              await player.togglePlay();
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            setIsPlaying(true);
          } catch (e) {
            console.error('SDK playback attempt failed:', e);
            if (e.message && e.message.includes('no list was loaded')) {
              console.log('Will retry playback in a few seconds...');
              setTimeout(() => {
                if (!isTransferringPlayback) {
                  startPlaylistRef.current(startIndex);
                }
              }, 5000);
            } else {
              throw new Error('Unable to start playback. Please refresh and try again.');
            }
          }
        } else {
          throw new Error('Player device not found. Please refresh and try again.');
        }
      } else if (playResponse.status === 429) {
        // Handle rate limiting more gracefully
        const retryAfter = parseInt(playResponse.headers.get('retry-after') || '60');
        console.log(`Rate limited. Will retry playback after ${retryAfter} seconds.`);
        setError(`Rate limited by Spotify. The player will automatically retry in ${retryAfter} seconds.`);
        
        // Schedule a retry after the recommended wait time
        setTimeout(() => {
          if (!isTransferringPlayback) {
            startPlaylistRef.current(startIndex);
          }
        }, (retryAfter + 1) * 1000);
      } else {
        throw new Error(`Failed to start playback: ${playResponse.status}`);
      }
    } catch (error) {
      console.error('Error starting playlist:', error);
      if (error.message && error.message.includes('no list was loaded')) {
        setError('Player is initializing. Please wait or click retry.');
      } else {
      setError(`Failed to start playlist playback: ${error.message}`);
      }
    } finally {
      setIsTransferringPlayback(false);
    }
  };

  // Save reference to startPlaylist
  startPlaylistRef.current = startPlaylist;

  // Add progress update function
  const startProgressTimer = useCallback(() => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
    }

    progressInterval.current = setInterval(async () => {
      if (player && !isDraggingRef.current) {
        try {
          const state = await player.getCurrentState();
          if (state) {
            setProgress(state.position);
            setDuration(state.duration);
            setIsPlaying(!state.paused);
          }
        } catch (err) {
          console.error('Error updating progress:', err);
        }
      }
    }, 100);
  }, [player]);

  // Handle reconnection with improved rate limiting
  const handleReconnect = useCallback(async () => {
    console.log('Attempting to reconnect...');
    
    // Check if we've reconnected too recently
    const now = Date.now();
    if (now - lastReconnectionTimeRef.current < MIN_RECONNECTION_INTERVAL) {
      console.log(`Reconnection attempted too soon. Waiting ${Math.ceil((MIN_RECONNECTION_INTERVAL - (now - lastReconnectionTimeRef.current)) / 1000)}s before trying again.`);
      return;
    }
    
    // Prevent multiple reconnection attempts
    if (isTransferringPlayback) {
      console.log('Already attempting to reconnect...');
      return;
    }

    // Don't attempt to reconnect if rate limited
    if (checkRateLimited()) {
      console.log('Cannot reconnect while rate limited. Waiting for limit to expire.');
      return;
    }

    // Limit reconnection attempts
    if (reconnectAttemptsRef.current >= 3) {
      console.log('Maximum reconnection attempts reached. Please try refreshing the page.');
      setError('Too many reconnection attempts. Please refresh the page.');
      reconnectAttemptsRef.current = 0; // Reset for next session
      return;
    }
    
    reconnectAttemptsRef.current++;
    lastReconnectionTimeRef.current = now;
    
    try {
      // First check if our device is still valid
      console.log('Checking if device is still valid...');
      let devicesResponse;
      
      try {
        devicesResponse = await safeFetch('https://api.spotify.com/v1/me/player/devices', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
      } catch (error) {
        // If rate limited, don't proceed with reconnection
        if (error.message.includes('Rate limited') || error.message.includes('Maximum retries')) {
          console.log('Device check failed due to rate limiting, aborting reconnection');
          return;
        }
        throw error; // Re-throw other errors
      }
      
      if (!devicesResponse.ok) {
        throw new Error('Failed to get available devices');
      }

      const devicesData = await devicesResponse.json();
      const isDeviceValid = devicesData.devices?.some(device => device.id === deviceId);

      if (isDeviceValid) {
        console.log('✅ Device still valid, no need to reconnect');
        setError(null);
        reconnectAttemptsRef.current = 0; // Reset counter on success
        return;
      }

      // If device is not valid, wait for it to become available
      console.log('Device not found, waiting for it to become available...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check again after waiting
      let newDevicesResponse;
      
      try {
        newDevicesResponse = await safeFetch('https://api.spotify.com/v1/me/player/devices', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
      } catch (error) {
        // If rate limited, don't proceed with reconnection
        if (error.message.includes('Rate limited') || error.message.includes('Maximum retries')) {
          console.log('Second device check failed due to rate limiting, aborting reconnection');
          return;
        }
        throw error; // Re-throw other errors
      }
      
      if (!newDevicesResponse.ok) {
        throw new Error('Failed to get available devices');
      }

      const newDevicesData = await newDevicesResponse.json();
      const isDeviceNowValid = newDevicesData.devices?.some(device => device.id === deviceId);

      if (isDeviceNowValid) {
        console.log('✅ Device is now available, continuing playback');
        setError(null);
        reconnectAttemptsRef.current = 0; // Reset counter on success
        return;
      }

      // If device is still not valid, only then try to reconnect
      if (player) {
        console.log('Disconnecting existing player...');
        try {
        await player.disconnect();
        } catch (e) {
          console.error('Error disconnecting player:', e);
        }
      }
      
      console.log('Initializing new player...');
      const newPlayer = await initializePlayerRef.current();
      if (newPlayer) {
        console.log('New player initialized, waiting for ready state...');
        // Wait for the player to be ready before attempting to play
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        if (lastPlaybackState) {
          const trackIndex = queue.findIndex(track => 
            track.id === lastPlaybackState.track_window.current_track.id);
          if (trackIndex >= 0) {
            console.log(`Resuming playback from track index ${trackIndex}...`);
            await startPlaylistRef.current(trackIndex);
          }
        }
      }
    } catch (error) {
      console.error('Reconnection failed:', error);
      setError(`Failed to reconnect: ${error.message}. Please refresh the page.`);
    }
  }, [player, lastPlaybackState, queue, isTransferringPlayback, deviceId, accessToken]);

  // Handle track ending with improved rate limiting
  const handleTrackEnd = useCallback(async () => {
    if (!deviceId || !lastPlaybackState) return;

    // Check if track changed too recently
    const now = Date.now();
    if (now - lastTrackChangeTimeRef.current < MIN_TRACK_CHANGE_INTERVAL) {
      console.log(`Track change attempted too soon. Waiting before changing tracks.`);
      return;
    }
    
    // Don't proceed if rate limited
    if (checkRateLimited()) {
      console.log('Track end handler skipped due to rate limiting');
      return;
    }

    lastTrackChangeTimeRef.current = now;
    
    try {
      // Get current playback state with rate limit handling
      console.log('Checking playback state after track end...');
      let response;
      
      try {
        response = await safeFetch('https://api.spotify.com/v1/me/player', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      } catch (error) {
        // If rate limited, handle gracefully without further API calls
        if (error.message.includes('Rate limited') || error.message.includes('Maximum retries')) {
          console.log('Playback check skipped due to rate limiting');
          return;
        }
        throw error; // Re-throw other errors
      }

      // Handle no content response (204)
      if (response.status === 204) {
        console.log('No active playback session');
        return;
      }

      // Only try to parse if we have content
      if (!response.ok) {
        throw new Error(`Failed to get playback state: ${response.status}`);
      }

      const data = await response.json();
      
      // If we're not playing, try to resume from the next track
      if (!data.is_playing) {
        const currentTrackId = lastPlaybackState.track_window.current_track.id;
        const nextTrackIndex = queue.findIndex(track => track.id === currentTrackId) + 1;

        // Only continue if there are more tracks in our playlist
        if (nextTrackIndex < queue.length) {
          console.log('Playing next track at index:', nextTrackIndex);
          // Add a delay before starting next track to prevent rate limiting
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          try {
            await startPlaylistRef.current(nextTrackIndex);
          } catch (error) {
            // If starting the next track fails due to rate limiting, handle gracefully
            if (error.message.includes('Rate limited') || error.message.includes('Maximum retries')) {
              console.log('Could not play next track due to rate limiting');
              setNotification(
                <>
                  <span>Ready to play next track when rate limit expires.</span>
                  <button 
                    onClick={() => {
                      clearNotification();
                      handleTrackEnd();
                    }}
                    className="button"
                    style={{
                      marginLeft: '10px',
                      padding: '2px 10px',
                      fontSize: '0.8rem',
                      backgroundColor: '#1DB954',
                      border: 'none',
                      borderRadius: '12px',
                      color: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    Try Now
                  </button>
                </>
              );
              return;
            }
            throw error; // Re-throw other errors
          }
        } else {
          // We've reached the end of our playlist
          console.log('Reached end of playlist');
          if (player) {
            await player.pause();
            setIsPlaying(false);
          }
        }
      }
    } catch (error) {
      console.error('Error handling track end:', error);
      // Don't attempt to reconnect on rate limit errors
      if (error.message.includes('429') || error.message.includes('Rate limited') || error.message.includes('Maximum retries')) {
        console.log('Rate limited while handling track end, will retry when limit expires');
        return;
      }
      
      // For network errors, wait before trying to reconnect
      if (error.message.includes('network') || error.message.includes('Failed to fetch')) {
        console.log('Network error while handling track end, waiting before reconnect');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      // For other errors, we can try to reconnect but with a delay
      setTimeout(() => {
        handleReconnect();
      }, 3000);
    }
  }, [deviceId, lastPlaybackState, queue, accessToken, player, handleReconnect]);

  // Define the trackingTogglePlay function at component level
  const trackingTogglePlay = async () => {
    if (!player) {
      console.log('Player not initialized, attempting to initialize...');
      // Don't initialize if rate limited - that requires API calls
      if (checkRateLimited()) {
        setError('Cannot initialize player while rate limited. Please try again later.');
        return;
      }
      await initializePlayerRef.current();
      return;
    }

    try {
      // Get current state - this doesn't hit the Spotify API, it's local
      const currentState = await player.getCurrentState();
      if (!currentState) {
        console.log('No current state, attempting to start playlist...');
        // Starting playlist requires API calls, so respect rate limits
        if (checkRateLimited()) {
          setError('Cannot start playlist while rate limited. Please try again later.');
          return;
        }
        await startPlaylistRef.current();
        return;
      }

      // Track that this is a user-initiated pause/play
      userPausedRef.current = !currentState.paused;
      console.log('User toggled playback, current pause state:', currentState.paused, 'Setting userPaused:', userPausedRef.current);
      
      // Clear notifications
      clearNotification();

      // Toggle play state - this is a local SDK operation, not an API call
      // This should work even during rate limiting
      await player.togglePlay();
      const newState = await player.getCurrentState();
      if (newState) {
        setIsPlaying(!newState.paused);
        if (!newState.paused) {
          startProgressTimer();
        }
      }
    } catch (err) {
      console.error('Failed to toggle playback:', err);
      if (err.message?.includes('No active device')) {
        console.log('No active device, attempting to transfer playback...');
        // This requires API calls, so respect rate limits
        if (checkRateLimited()) {
          setError('Cannot transfer playback while rate limited. Please try again later.');
          return;
        }
        await transferPlayback();
      } else {
      setError('Failed to toggle playback. Please try again.');
      }
    }
  };

  // Handle toggle play - replace with our tracking version
  const togglePlay = trackingTogglePlay;

  // Define and implement the initializePlayer function in useEffect
  useEffect(() => {
    // Define the initialize player function
    const initializePlayer = async () => {
      // Global guard against multiple initialization attempts
      if (isGlobalInitializing) {
        console.log('Global initialization already in progress, skipping...');
        return player;
      }
      
      // Prevent multiple simultaneous initialization attempts
      if (initializingRef.current) {
        console.log('Player initialization already in progress, skipping...');
        return player;
      }

      // Set the global lock
      isGlobalInitializing = true;
      
      try {
        // Reset device ID attempts counter
        deviceIdAttempts.current = 0;
        
        // Force cleanup of any existing players
    if (player) {
          console.log('Disconnecting existing player before initializing a new one');
          try {
            await player.disconnect();
            setDeviceId(null);
            setPlayer(null);
            setIsPlayerReady(false);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for cleanup
          } catch (e) {
            console.error('Error disconnecting old player:', e);
          }
        }

        // Check if we're rate limited
        if (checkRateLimited()) {
          const timeToWait = Math.ceil((globalRateLimit.limitedUntil - Date.now()) / 1000);
          console.log(`Rate limited. Waiting ${timeToWait} seconds before initializing player...`);
          setError(`API rate limit reached. Please wait ${timeToWait} seconds and try again.`);
          return null;
        }

        initializingRef.current = true;
        setIsInitializing(true);
        setError(null);
        setIsAuthenticated(false);
        setIsPremium(false);

        if (!accessToken) {
          throw new Error('No access token provided');
        }

        // First verify the token is valid and get user info
        try {
          const response = await safeFetch('https://api.spotify.com/v1/me', {
            headers: { 
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          });

          if (response.status === 401) {
            throw new Error('Access token expired or invalid');
          }

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to verify token: ${errorData.error?.message || response.status}`);
          }

          const userData = await response.json();
          console.log('Spotify user data:', userData);
          
          // Verify premium status
          if (userData.product !== 'premium') {
            setIsAuthenticated(true);
            throw new Error('A Spotify Premium account is required to use this player.');
          }

          setIsAuthenticated(true);
          setIsPremium(true);
          console.log('✅ Premium account verified');
        } catch (error) {
          console.error('Token verification failed:', error);
          if (error.message.includes('Access token expired')) {
            throw new Error('Your session has expired. Please refresh the page to reconnect.');
          }
          throw error;
        }

        // Load the Spotify Web Playback SDK
        await loadSpotifyScript();
        console.log('✅ Spotify SDK script loaded');

        if (!window.Spotify || !window.Spotify.Player) {
          throw new Error('Spotify SDK not properly initialized');
        }

        // Create a new player instance
        console.log('Creating Spotify player instance...');
        const spotifyPlayer = new window.Spotify.Player({
          name: 'Push-D Web Player',
          getOAuthToken: cb => { 
            console.log('Getting OAuth token...');
            cb(accessToken); 
          },
          volume: 0.5,
          enableMediaSession: true
        });

        // Check if the player is properly initialized
        if (!spotifyPlayer) {
          throw new Error('Failed to create Spotify player instance');
        }

        // Set up event listeners before connecting
        spotifyPlayer.addListener('ready', async ({ device_id }) => {
          console.log('✅ Player ready with Device ID:', device_id);
          
          // Store device ID and update player state
          setDeviceId(device_id);
          setPlayer(spotifyPlayer);
          setVolume(50);
          spotifyPlayer.setVolume(0.5);
          setError(null);
          setIsInitializing(false);
          setIsPlayerReady(true);

          // Set a delay before attempting to use the new device
          // This avoids rate limits by not immediately making API calls
          const startPlaylistAfterDelay = async () => {
            if (checkRateLimited()) {
              console.log('Rate limited, delaying playlist start...');
              return;
            }
            
            if (playlistUrl) {
              // Add a longer delay to ensure the player is fully ready
              console.log('Waiting for player to be fully ready...');
              await new Promise(resolve => setTimeout(resolve, 8000));
              
              // Force register and verify the device is available
              try {
                // First try to transfer playback to this device to ensure it's registered
                console.log('Registering device with Spotify...');
                await fetch('https://api.spotify.com/v1/me/player', {
                  method: 'PUT',
                  headers: { 
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    device_ids: [device_id],
                    play: false
                  })
                });
                
                // Wait a moment for the device to be fully registered
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Now check if the device is available
                const devicesResponse = await fetch('https://api.spotify.com/v1/me/player/devices', {
                  headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                
                if (devicesResponse.ok) {
                  const data = await devicesResponse.json();
                  console.log('Available devices:', data.devices);
                  const isDeviceAvailable = data.devices.some(d => d.id === device_id);
                  
                  if (!isDeviceAvailable) {
                    console.log('Device not found in available devices list, skipping playback');
                    setNotification('Device registration failed. Please refresh and try again.');
                    return;
                  } else {
                    console.log('Device successfully registered and available');
                    // Set an informative message instead of auto-playing
                    setNotification('Spotify player ready. Click Play to start.');
                  }
                }
              } catch (error) {
                console.error('Error checking devices:', error);
                setNotification('Failed to verify device. Please refresh and try again.');
                return;
              }
              
              // Don't auto-start playback - remove the automatic playlist start
              /*
              // Only start playback if we're not rate limited
              if (!checkRateLimited()) {
                console.log('Starting playback after device verification...');
                try {
                  await startPlaylistRef.current();
                } catch (e) {
                  console.error('Error starting playback:', e);
                  if (e.message?.includes('no list was loaded')) {
                    // Try loading the playlist again after a short delay
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    await startPlaylistRef.current();
                  }
                }
              }
              */
            }
          };
          
          // Schedule the delayed playlist start
          setTimeout(startPlaylistAfterDelay, 2000);
        });

        spotifyPlayer.addListener('not_ready', ({ device_id }) => {
          console.log('❌ Device ID has gone offline:', device_id);
          // Don't reset state immediately, try to reconnect first
          setError('Device offline, attempting to reconnect...');
          handleReconnect();
        });

        spotifyPlayer.addListener('initialization_error', ({ message }) => {
          console.error('Initialization error:', message);
          setError(`Failed to initialize: ${message}`);
          setIsInitializing(false);
          setIsPlaying(false);
          setDeviceId(null);
          setPlayer(null);
          setIsPlayerReady(false);
        });

        spotifyPlayer.addListener('authentication_error', ({ message }) => {
          console.error('Authentication error:', message);
          setError(`Failed to authenticate: ${message}. Please refresh the page to reconnect.`);
          setIsInitializing(false);
          setIsPlaying(false);
          setDeviceId(null);
          setPlayer(null);
          setIsPlayerReady(false);
          setIsAuthenticated(false);
        });

        spotifyPlayer.addListener('playback_error', ({ message }) => {
          console.error('Playback error:', message);
          if (message.includes('no list was loaded')) {
            // This is a common error when the player is still initializing
            console.log('Playlist not loaded yet, will retry playback shortly...');
            setTimeout(async () => {
              if (player && deviceId && !isTransferringPlayback) {
                try {
                  // Try activating element again
                  await player.activateElement();
                  // Attempt to play again
                  await startPlaylistRef.current(0);
    } catch (err) {
                  console.error('Failed to retry playback:', err);
                  setError('Failed to start playback. Please click retry to reconnect.');
                }
              }
            }, 5000);
          } else if (message.includes('CloudPlaybackClientError') && message.includes('404')) {
            console.log('CloudPlaybackClientError detected with 404. This usually means the track or playlist is unavailable.');
            setNotification('Playback error: The track or playlist could not be loaded. It may be unavailable in your region, require premium access, or no longer exist.');
            
            // Start error recovery process
            const playlistId = getPlaylistId(playlistUrl);
            if (playlistId) {
              // Use silent mode to prevent additional errors
              safeFetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                silent: true
              }).then(async response => {
                if (!response || !response.ok) {
                  setError('The playlist could not be accessed. Please check the URL or try a different playlist.');
                  return;
                }
                
                try {
                  const data = await response.json();
                  if (!data.tracks || data.tracks.total === 0) {
                    setError('The playlist is empty. Please try a different playlist.');
                    return;
                  }
                  
                  // Try to recover by playing a different track
                  const tracks = await fetchPlaylistTracks(playlistId);
                  if (tracks.length > 0) {
                    setNotification(
                      <>
                        <span>Found {tracks.length} tracks in this playlist. The current track may be unavailable.</span>
                        <button 
                          onClick={() => {
                            clearNotification();
                            // Try to play the next track instead
                            const currentTrackIndex = queue.findIndex(t => t.id === currentTrack?.id);
                            const nextIndex = currentTrackIndex >= 0 ? (currentTrackIndex + 1) % tracks.length : 0;
                            playTrack(nextIndex);
                          }}
                          className="button"
                          style={{
                            marginLeft: '10px',
                            padding: '2px 10px',
                            fontSize: '0.8rem',
                            backgroundColor: '#1DB954',
                            border: 'none',
                            borderRadius: '12px',
                            color: 'white',
                            cursor: 'pointer'
                          }}
                        >
                          Try Next Track
                        </button>
                      </>
                    );
                  }
                } catch (e) {
                  console.error('Error checking playlist data:', e);
                }
              }).catch(err => {
                console.error('Error verifying playlist:', err);
              });
            }
          } else if (message.includes('CloudPlaybackClientError')) {
            setNotification('Failed to load playback content. Please check your connection and playlist URL.');
            // Try to reconnect after a delay
            setTimeout(() => {
              handleReconnect();
            }, 8000);
          } else {
            setError(`Playback error: ${message}`);
          }
          setIsPlaying(false);
        });

        // Connect to the player
        console.log('Connecting to Spotify player...');
        const connected = await spotifyPlayer.connect();
        if (!connected) {
          throw new Error('Failed to connect to Spotify player');
        }

        console.log('✅ Player connected successfully');
        return spotifyPlayer;
      } catch (error) {
        console.error('Error initializing player:', error);
        setError(`Failed to initialize player: ${error.message}`);
        setIsInitializing(false);
        setIsPlayerReady(false);
        return null;
      } finally {
        initializingRef.current = false;
        // Release the global lock
        isGlobalInitializing = false;
      }
    };

    // Store references to these functions to avoid circular dependencies
    initializePlayerRef.current = initializePlayer;

    let currentPlayer = null;
    let hasInitialized = false;
    
    const setup = async () => {
      // Skip if already initialized in this render cycle
      if (hasInitialized) {
        return;
      }
      
      // Skip if rate limited
      if (checkRateLimited()) {
        console.log('Rate limited, skipping player initialization...');
        return;
      }
      
      hasInitialized = true;
      currentPlayer = await initializePlayer();
    };

    if (accessToken && !player) {
      setup();
    } else if (!accessToken) {
      setError('No access token provided');
      setIsInitializing(false);
    }

    // Cleanup
    return () => {
      if (currentPlayer) {
        // Only disconnect on unmount
        console.log('Component unmounting, disconnecting player');
        currentPlayer.disconnect().catch(e => {
          console.error('Error disconnecting player during cleanup:', e);
        });
      }
    };
  }, [accessToken, playlistUrl]);

  // Auto-start playback when device is ready and we have a playlist URL
  useEffect(() => {
    // Only attempt if we're not already trying to start playback or initialize
    if (isTransferringPlayback || deviceIdCheckInProgress.current || initializingRef.current || isGlobalInitializing) {
      return;
    }
    
    // If we already have a track, don't try to auto-start
    if (currentTrack) {
      return;
    }
    
    const attemptPlayback = async () => {
      // Don't auto-start if we're rate limited
      if (checkRateLimited()) {
        console.log('Rate limited, skipping auto-start playback...');
        return;
      }
      
      // Track if user has manually paused
      if (window.userPausedPlayback) {
        console.log('User has paused playback, skipping auto-start...');
        return;
      }
      
      // Only start playback if shouldAutoPlay is true
      if (deviceId && playlistUrl && !currentTrack && !isTransferringPlayback && shouldAutoPlay) {
        console.log('Auto-starting playlist playback with device ID:', deviceId);
        
        // Add delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Skip if rate limited now
        if (!checkRateLimited()) {
          await startPlaylistRef.current(0);
        }
      }
    };
    
    attemptPlayback();
  }, [deviceId, playlistUrl, currentTrack, isTransferringPlayback, shouldAutoPlay]);

  // Load playlist tracks
  useEffect(() => {
    // Skip if rate limited
    if (checkRateLimited()) {
      console.log('Skipping playlist load due to active rate limit');
      return;
    }
    
    // Reset the loaded flag when playlist URL changes
    if (playlistUrl !== previousPlaylistUrlRef.current) {
      setHasLoadedCurrentPlaylist(false);
      setError(null); // Clear any previous errors
    }
    
    const playlistId = getPlaylistId(playlistUrl);
    if (!playlistId) {
      // Invalid playlist URL - clear the queue and current track
      if (queue.length > 0 || currentTrack) {
        console.log('Invalid playlist URL, clearing queue and current track');
        setQueue([]);
        setCurrentTrack(null);
      }
      return;
    }
    
    // Don't reload if we've already loaded this playlist
    if (hasLoadedCurrentPlaylist && playlistUrl === previousPlaylistUrlRef.current) {
      return;
    }
    
    console.log('Loading tracks for playlist:', playlistId);
    
    // Clear existing queue to prevent showing old tracks
    setQueue([]);
    
    // Show loading state
    setError('Loading playlist...');
    
    fetchPlaylistTracks(playlistId).then(tracks => {
      if (tracks.length > 0) {
        console.log(`Loaded ${tracks.length} tracks from playlist ${playlistId}`);
        setQueue(tracks);
        setHasLoadedCurrentPlaylist(true);
        previousPlaylistUrlRef.current = playlistUrl;
        
        // Clear loading state
        setError(null);
        
        // If this is a brand new player session and we have tracks, show notification
        // Only show the notification if we're not already playing
        if (!isPlaying && !isTransferringPlayback) {
          // Attempt to get playlist name
          safeFetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(async response => {
            if (response.ok) {
              const data = await response.json();
              const playlistName = data.name || 'New Playlist';
              
              setNotification(
                <>
                  <span>Playlist loaded: {playlistName}</span>
                  <button 
                    onClick={() => {
                      clearNotification();
                      startPlaylistRef.current(0);
                    }}
                    className="button"
                    style={{
                      marginLeft: '10px',
                      padding: '2px 10px',
                      fontSize: '0.8rem',
                      backgroundColor: '#1DB954',
                      border: 'none',
                      borderRadius: '12px',
                      color: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    Play Now
                  </button>
                </>
              );
            } else {
              // Fallback if playlist details can't be fetched
              setNotification(
                <>
                  <span>Playlist loaded with {tracks.length} tracks</span>
                  <button 
                    onClick={() => {
                      clearNotification();
                      startPlaylistRef.current(0);
                    }}
                    className="button"
                    style={{
                      marginLeft: '10px',
                      padding: '2px 10px',
                      fontSize: '0.8rem',
                      backgroundColor: '#1DB954',
                      border: 'none',
                      borderRadius: '12px',
                      color: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    Play Now
                  </button>
                </>
              );
            }
          }).catch(err => {
            // Fallback notification without playlist name
            setNotification(
              <>
                <span>Playlist loaded with {tracks.length} tracks</span>
                <button 
                  onClick={() => {
                    clearNotification();
                    startPlaylistRef.current(0);
                  }}
                  className="button"
                  style={{
                    marginLeft: '10px',
                    padding: '2px 10px',
                    fontSize: '0.8rem',
                    backgroundColor: '#1DB954',
                    border: 'none',
                    borderRadius: '12px',
                    color: 'white',
                    cursor: 'pointer'
                  }}
                >
                  Play Now
                </button>
              </>
            );
          });
        }
      } else {
        setError('Could not load tracks from this playlist. Please try again.');
      }
    }).catch(error => {
      console.error('Error loading playlist:', error);
      setError('Error loading playlist. Please try again.');
    });
  }, [playlistUrl, accessToken, currentTrack, isTransferringPlayback, isPlaying, hasLoadedCurrentPlaylist, queue]);

  // Set up periodic connection check
  useEffect(() => {
    let lastCheckTime = 0;
    const MIN_CHECK_INTERVAL = 30000; // Minimum 30 seconds between checks

    const checkConnection = async () => {
      const now = Date.now();
      if (now - lastCheckTime < MIN_CHECK_INTERVAL) {
        return; // Skip if we've checked too recently
      }

      if (player && deviceId) {
        try {
          const response = await fetch('https://api.spotify.com/v1/me/player', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          
          if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get('retry-after') || '60');
            console.log(`Rate limited. Waiting ${retryAfter} seconds before next check...`);
            setIsRateLimited(true);
            setRateLimitRetryAfter(retryAfter);
            lastCheckTime = now + (retryAfter * 1000);
            return;
          }
          
          if (!response.ok) {
            console.log('Connection check failed, attempting reconnect...');
            handleReconnect();
          }
          
          setIsRateLimited(false);
          setRateLimitRetryAfter(0);
          lastCheckTime = now;
        } catch (error) {
          console.error('Error checking connection:', error);
          handleReconnect();
        }
      }
    };

    const intervalId = setInterval(checkConnection, 60000); // Check every 60 seconds

    return () => clearInterval(intervalId);
  }, [player, deviceId, accessToken, handleReconnect]);

  // Handle volume change with debouncing
  const handleVolumeChange = useCallback((e) => {
    const newVolume = parseInt(e.target.value);
    setVolume(newVolume);
    
    if (player) {
      // Immediately update UI
      setVolume(newVolume);
      
      // Update player volume - this is a local SDK operation
      player.setVolume(newVolume / 100).catch(err => {
        console.error('Failed to set volume:', err);
        // Revert to previous volume on error
        setVolume(volumeRef.current);
      });
      
      // Store the last successful volume
      volumeRef.current = newVolume;
    }
  }, [player]);

  const nextTrack = async () => {
    if (!player) return;
    try {
      const currentIndex = queue.findIndex(track => 
        track.id === lastPlaybackState?.track_window.current_track.id);
      
      // Only allow next if we're not at the end of our playlist
      if (currentIndex < queue.length - 1) {
        // This is a local SDK operation, should work during rate limiting
        await player.nextTrack();
      } else {
        console.log('Reached end of playlist');
        await player.pause();
        setIsPlaying(false);
      }
    } catch (err) {
      setError('Failed to skip track. Please try again.');
    }
  };

  const previousTrack = async () => {
    if (!player) return;
    try {
      const currentIndex = queue.findIndex(track => 
        track.id === lastPlaybackState?.track_window.current_track.id);
      
      // Only allow previous if we're not at the start
      if (currentIndex > 0) {
        // This is a local SDK operation, should work during rate limiting
        await player.previousTrack();
      }
    } catch (err) {
      setError('Failed to go to previous track. Please try again.');
    }
  };

  // Transfer playback to our device
  const transferPlayback = async () => {
    if (!deviceId) {
      console.log('No device ID available, waiting for device...');
      return;
    }

    try {
      const response = await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          device_ids: [deviceId],
          play: true
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to transfer playback: ${response.status}`);
      }

      // Wait for transfer to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Try to start playback again
      await startPlaylistRef.current();
    } catch (error) {
      console.error('Error transferring playback:', error);
      setError('Failed to transfer playback. Please try again.');
    }
  };

  // Toggle repeat mode
  const toggleRepeat = async () => {
    if (!player || !deviceId) return;
    try {
      const newRepeatState = isRepeating ? 'off' : 'track';
      await fetch(`https://api.spotify.com/v1/me/player/repeat?state=${newRepeatState}&device_id=${deviceId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      });
      setIsRepeating(!isRepeating);
    } catch (err) {
      console.error('Failed to toggle repeat:', err);
      setError('Failed to toggle repeat mode. Please try again.');
    }
  };

  // Toggle autoplay
  const toggleAutoplay = async () => {
    if (!player || !deviceId) return;
    try {
      const newAutoplayState = !isAutoplaying;
      await fetch(`https://api.spotify.com/v1/me/player/shuffle?state=${newAutoplayState}&device_id=${deviceId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      });
      setIsAutoplaying(newAutoplayState);
    } catch (err) {
      console.error('Failed to toggle autoplay:', err);
      setError('Failed to toggle autoplay. Please try again.');
    }
  };

  // Update the volume button click handler
  const handleVolumeButtonClick = () => {
    if (volume > 0) {
      setPreviousVolume(volume);
      handleVolumeChange({ target: { value: '0' } });
    } else {
      handleVolumeChange({ target: { value: previousVolume.toString() } });
    }
  };

  // Add retry mechanism
  const handleRetry = async () => {
    // First clear all rate limits and errors
    setGlobalRateLimit({
      isLimited: false,
      retryAfter: 0,
      limitedUntil: null
    });
    setIsRateLimited(false);
    setRateLimitRetryAfter(0);
    
    // Reset all retry counts
    retryAttemptsRef.current = {};
    reconnectAttemptsRef.current = 0;
    
    // Clear error and notification states
    setError(null);
    setNotification(null);
    
    // Disconnect existing player if any
    if (player) {
      try {
        await player.disconnect();
      } catch (e) {
        console.error('Error disconnecting player:', e);
      }
    }
    
    // Reset all state
    setPlayer(null);
    setDeviceId(null);
    setIsPlayerReady(false);
    setIsInitializing(true);
    
    // Wait a moment before reinitializing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Initialize a new player
    await initializePlayerRef.current();
  };

  // Add playTrack function
  const playTrack = async (index) => {
    if (!player || !deviceId || !playlistUrl) {
      console.error('Cannot play track: player, device, or playlist not ready');
      return;
    }

    // Check if track changed too recently
    const now = Date.now();
    if (now - lastTrackChangeTimeRef.current < MIN_TRACK_CHANGE_INTERVAL) {
      console.log(`Track change attempted too soon. Please wait a moment before changing tracks.`);
      setNotification('Changing tracks too quickly. Please wait a moment.');
      return;
    }
    
    lastTrackChangeTimeRef.current = now;

    try {
      setIsTransferringPlayback(true);
      console.log(`Playing track at index ${index}...`);

      // First verify the device is still valid
      const deviceResponse = await safeFetch('https://api.spotify.com/v1/me/player/devices', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!deviceResponse.ok) {
        throw new Error(`Failed to get devices: ${deviceResponse.status}`);
      }

      const devicesData = await deviceResponse.json();
      const isDeviceValid = devicesData.devices?.some(device => device.id === deviceId);
      
      if (!isDeviceValid) {
        console.log('Device not found in available devices, attempting to reconnect...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        return;
      }

      // Start playing the playlist from the specified index
      await startPlaylistRef.current(index);

      // Clear notifications
      clearNotification();
    } catch (error) {
      console.error('Error playing track:', error);
      setError(`Failed to play track: ${error.message}`);
    } finally {
      setIsTransferringPlayback(false);
    }
  };

  // Start/stop progress timer based on play state
  useEffect(() => {
    if (isPlaying) {
      startProgressTimer();
    } else if (progressInterval.current) {
      clearInterval(progressInterval.current);
    }
    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, [isPlaying, startProgressTimer]);

  // Update player state changed listener
  useEffect(() => {
    if (player) {
      let lastStateChangeTime = 0;
      const MIN_STATE_CHANGE_INTERVAL = 1000; // Minimum 1 second between state changes
      let lastTrackId = null;
      let lastIsPlaying = null;
      let lastPosition = null;
      let debounceTimeout = null;

      // Make the window reference accessible
      window.togglePlayTracked = trackingTogglePlay;

      player.addListener('player_state_changed', (state) => {
        const now = Date.now();
        if (now - lastStateChangeTime < MIN_STATE_CHANGE_INTERVAL) {
          return; // Skip rapid state changes
        }

        if (!state) {
          return;
        }

        // Clear any existing debounce timeout
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
        }

        // Debounce the state change
        debounceTimeout = setTimeout(async () => {
          const currentTrackId = state.track_window.current_track?.id;
          const isPlaying = !state.paused;
          const currentPosition = Math.floor(state.position / 1000); // Convert to seconds for comparison
          
          // Only log if there's a significant change
          if (currentTrackId !== lastTrackId || 
              isPlaying !== lastIsPlaying || 
              Math.abs(currentPosition - (lastPosition || 0)) > 1) {
            
            console.log('Player state changed:', {
              track: state.track_window.current_track?.name,
              artist: state.track_window.current_track?.artists?.[0]?.name,
              isPlaying,
              position: formatTime(state.position),
              duration: formatTime(state.duration),
              userPaused: userPausedRef.current
            });
            
            lastTrackId = currentTrackId;
            lastIsPlaying = isPlaying;
            lastPosition = currentPosition;
            lastStateChangeTime = now;
          }

          // If user explicitly paused, and we detect playback resumed,
          // we should re-pause
          if (userPausedRef.current && isPlaying) {
            console.log('Auto-resume detected after user pause, re-pausing...');
            await player.pause();
            return;
          }

          // Reset user pause state if track changes
          if (currentTrackId !== lastTrackId) {
            userPausedRef.current = false;
          }
          
          setCurrentTrack(state.track_window.current_track);
          setIsPlaying(!state.paused);
          setLastPlaybackState(state);
          setProgress(state.position);
          setDuration(state.duration);

          // Start or stop progress timer based on state
          if (!state.paused) {
            startProgressTimer();
          }

          // Check if we're at the end of a track
          if (state.paused && state.position === 0) {
            // Add a small delay before handling track end
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Only proceed with auto-play if user hasn't explicitly paused and we're not rate limited
            if (!userPausedRef.current && !checkRateLimited()) {
              await handleTrackEnd();
            } else if (checkRateLimited()) {
              console.log('Skipping automatic track progression due to rate limiting');
              setNotification(
                <>
                  <span>Track ended. Next track will play when rate limit expires.</span>
                  <button 
                    onClick={() => {
                      clearNotification();
                      handleTrackEnd();
                    }}
                    className="button"
                    style={{
                      marginLeft: '10px',
                      padding: '2px 10px',
                      fontSize: '0.8rem',
                      backgroundColor: '#1DB954',
                      border: 'none',
                      borderRadius: '12px',
                      color: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    Try Now
                  </button>
                </>
              );
            }
          }
        }, 100);
      });

      // Add disconnect listener
      player.addListener('playback_error', ({ message }) => {
        console.error('Playback error:', message);
        setError('Playback error occurred. Trying to reconnect...');
        handleReconnect();
      });

      // Cleanup
      return () => {
        if (debounceTimeout) {
          clearTimeout(debounceTimeout);
        }
      };
    }
  }, [player, startProgressTimer, handleTrackEnd, handleReconnect]);

  // Handle progress bar interaction
  const handleProgressChange = async (e) => {
    if (!player || !duration) return;
    
    const progressBar = e.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    const position = Math.floor(percentage * duration);
    
    setProgress(position);
    
    if (!isDraggingRef.current) {
      try {
        await player.seek(position);
      } catch (err) {
        console.error('Failed to seek:', err);
      }
    }
  };

  // Handle mouse move during drag
  const handleMouseMove = useCallback(async (e) => {
    if (!isDraggingRef.current || !player || !duration) return;
    
    const progressBar = document.querySelector('.progress-track');
    if (!progressBar) return;

    const rect = progressBar.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    const position = Math.floor(percentage * duration);
    
    setProgress(position);
  }, [player, duration]);

  // Handle mouse up
  const handleMouseUp = useCallback(async () => {
    if (!isDraggingRef.current || !player) return;
    
    isDraggingRef.current = false;
    try {
      await player.seek(progress);
      // Start progress timer again
      startProgressTimer();
    } catch (err) {
      console.error('Failed to seek:', err);
    }
  }, [player, progress, startProgressTimer]);

  // Add and remove event listeners for dragging
  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Monitor playlist URL changes and update accordingly
  useEffect(() => {
    // Skip if no playlistUrl
    if (!playlistUrl) {
      return;
    }
    
    // Check if this is a new playlist (not just component initialization)
    if (previousPlaylistUrlRef.current && 
        previousPlaylistUrlRef.current !== playlistUrl && 
        isPlayerReady) {
      
      console.log('Playlist URL changed, loading new playlist...');
      console.log('Previous playlist:', previousPlaylistUrlRef.current);
      console.log('New playlist:', playlistUrl);
      
      // Clear current track and state
      setCurrentTrack(null);
      setQueue([]);
      userPausedRef.current = false;
      setIsPlaying(false);
      
      // Get the new playlist ID
      const playlistId = getPlaylistId(playlistUrl);
      if (!playlistId) {
        setError('Invalid playlist URL format');
        return;
      }
      
      // Check if the playlist exists and fetch its tracks
      safeFetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(async (response) => {
        if (!response.ok) {
          if (response.status === 404) {
            setError('Playlist not found. Please check the URL.');
          } else {
            setError(`Failed to access playlist: ${response.status}`);
          }
          return;
        }
        
        const playlistData = await response.json();
        if (!playlistData.tracks || playlistData.tracks.total === 0) {
          setError('Playlist is empty. Please add some tracks and try again.');
          return;
        }
        
        // Fetch the new playlist tracks
        fetchPlaylistTracks(playlistId).then(tracks => {
          if (tracks.length > 0) {
            setQueue(tracks);
            setHasLoadedCurrentPlaylist(true);
            previousPlaylistUrlRef.current = playlistUrl;
            console.log('New playlist loaded with', tracks.length, 'tracks');
            
            // Show play notification with action button
            setNotification(
              <>
                <span>Playlist loaded: {playlistData.name}</span>
                <button 
                  onClick={() => {
                    clearNotification();
                    startPlaylistRef.current(0);
                  }}
                  className="button"
                  style={{
                    marginLeft: '10px',
                    padding: '2px 10px',
                    fontSize: '0.8rem',
                    backgroundColor: '#1DB954',
                    border: 'none',
                    borderRadius: '12px',
                    color: 'white',
                    cursor: 'pointer'
                  }}
                >
                  Play Now
                </button>
              </>
            );
          } else {
            setError('Could not load tracks from this playlist.');
          }
        });
      }).catch(error => {
        console.error('Error checking playlist:', error);
        setError('Error loading playlist. Please try again.');
      });
    }
    
    // Always update the reference to the current playlist URL
    previousPlaylistUrlRef.current = playlistUrl;
  }, [playlistUrl, accessToken, currentTrack, isTransferringPlayback, isPlaying, hasLoadedCurrentPlaylist, queue]);

  // Add a function to clear notification when play is clicked
  const clearNotification = () => {
    setNotification(null);
  };

  // 2. Add a function to dismiss rate limit warnings
  const dismissRateLimit = () => {
    setHasDismissedRateLimit(true);
    // Auto-reset after 5 minutes
    setTimeout(() => {
      setHasDismissedRateLimit(false);
    }, 5 * 60 * 1000);
  };

  // 4. Add a periodic check to auto-clear expired rate limits
  useEffect(() => {
    // Skip if not rate limited
    if (!globalRateLimit.isLimited) {
      return;
    }

    // Check every second if the rate limit has expired
    const intervalId = setInterval(() => {
      if (Date.now() >= globalRateLimit.limitedUntil) {
        console.log('Rate limit expired, auto-clearing');
        dismissRateLimit();
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [globalRateLimit.isLimited, globalRateLimit.limitedUntil]);

  // 2. Reset rate limit state on component load
  // Add this useEffect at the beginning to ensure clean state on load
  useEffect(() => {
    // Clear any rate limit state that might be persisted
    console.log('Initializing player with clean rate limit state');
    setGlobalRateLimit({
      isLimited: false,
      retryAfter: 0,
      limitedUntil: null
    });
    setIsRateLimited(false);
    setRateLimitRetryAfter(0);
    setHasAttemptedApiCalls(false);
    
    // Also clear any stored retry attempts
    retryAttemptsRef.current = {};
  }, []);

  const [userId, setUserId] = useState(null);

  // Add this useEffect to get the user ID
  useEffect(() => {
    const fetchUserId = async () => {
      try {
        const response = await fetch('/api/me');
        if (response.ok) {
          const data = await response.json();
          setUserId(data.id);
        }
      } catch (error) {
        console.error('Error fetching user ID:', error);
      }
    };
    fetchUserId();
  }, []);

  return (
    <div className="spotify-player">
      <h2 className="title" style={{ 
        fontSize: '2rem'
      }}>Spotify Web Player</h2>
      
      {globalRateLimit.isLimited && hasAttemptedApiCalls && !hasDismissedRateLimit && (
        <div className="rate-limit-warning" style={{
          backgroundColor: 'rgba(255, 152, 0, 0.1)',
          padding: '10px',
          borderRadius: '4px',
          marginBottom: '10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>
            ⚠️ Spotify API rate limit reached. 
            {globalRateLimit.limitedUntil > Date.now() 
              ? ` Please wait ${Math.max(0, Math.ceil((globalRateLimit.limitedUntil - Date.now()) / 1000))} seconds before trying again.`
              : ` You can try again now.`
            }
            <span style={{display: 'block', fontSize: '0.8rem', marginTop: '2px'}}>
              Playback controls (play/pause, volume) should still work.
            </span>
          </span>
          <button 
            onClick={dismissRateLimit}
            style={{
              background: 'transparent',
              border: '1px solid #ff9800',
              borderRadius: '4px',
              color: '#ff9800',
              padding: '2px 8px',
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      
      {notification && (
        <div className="notification-message" style={{ 
          color: '#1DB954',
          padding: '0.5rem',
          background: 'rgba(29, 185, 84, 0.1)',
          borderRadius: '8px',
          marginBottom: '1rem',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {notification}
        </div>
      )}
      
      {error ? (
        <div>
          <div className="error-message" style={{ 
            color: '#ff4444',
            padding: '1rem',
            background: 'rgba(255, 68, 68, 0.1)',
            borderRadius: '8px',
            marginBottom: '1rem'
          }}>
            {error}
          </div>
          <button
            onClick={handleRetry}
            className="button"
            disabled={isInitializing || globalRateLimit.isLimited}
          >
            {isInitializing ? 'Retrying...' : globalRateLimit.isLimited ? `Rate Limited (${Math.ceil((globalRateLimit.limitedUntil - Date.now()) / 1000)}s)` : '🔄 Retry'}
          </button>
        </div>
      ) : isInitializing ? (
        <div>
          <div className="loading-spinner" style={{
            marginBottom: '1rem',
            fontSize: '1.2rem',
            color: 'rgba(255, 255, 255, 0.9)'
          }}>
            Loading player...
          </div>
          <div style={{ 
            fontSize: '0.9rem', 
            color: 'rgba(255, 255, 255, 0.7)',
            marginBottom: '1rem'
          }}>
            This may take a few seconds
          </div>
        </div>
      ) : (
        <>
          <div className="dashboard-content">
            {/* Current Track Info */}
            <div style={{ 
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%'
            }}>
              {currentTrack ? (
                <>
                  <div style={{ 
                    width: '300px',
                    height: '300px',
                    marginBottom: '1rem',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    boxShadow: '0 8px 16px rgba(0,0,0,0.3)'
                  }}>
                    <img 
                      src={currentTrack.album?.images[0]?.url} 
                      alt={currentTrack.album?.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }}
                    />
                  </div>
                  <h3 style={{ 
                    fontSize: '1.5rem',
                    marginBottom: '0.5rem',
                    fontWeight: 'bold',
                    color: 'var(--text-color)',
                    textShadow: '2px 2px 4px rgba(0, 0, 0, 0.3)'
                  }}>{currentTrack.name}</h3>
                  <p style={{ 
                    color: 'rgba(255,255,255,0.7)',
                    marginBottom: '1.5rem',
                    fontSize: '1.1rem'
                  }}>{currentTrack.artists.map(artist => artist.name).join(', ')}</p>

                  {/* Progress Bar */}
                  <div style={{
                    width: '100%',
                    maxWidth: '500px',
                    margin: '1rem auto',
                    padding: '0 1rem'
                  }}>
                    {/* Timer Display */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '8px',
                      fontSize: '14px',
                      color: '#fff',
                      opacity: 0.7
                    }}>
                      <span>{formatTime(progress)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>

                    {/* Progress Bar */}
                    <div 
                      className="progress-track"
                      onClick={handleProgressChange}
                      onMouseDown={(e) => {
                        isDraggingRef.current = true;
                        handleProgressChange(e);
                      }}
                      style={{
                        width: '100%',
                        height: '4px',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '2px',
                        cursor: 'pointer',
                        position: 'relative'
                      }}
                    >
                      <div style={{
                        width: `${(progress / duration) * 100 || 0}%`,
                        height: '100%',
                        backgroundColor: '#1DB954',
                        borderRadius: '2px',
                        position: 'relative',
                        transition: isDraggingRef.current ? 'none' : 'width 0.1s linear'
                      }}>
                        <div style={{
                          display: isDraggingRef.current ? 'block' : 'none',
                          width: '12px',
                          height: '12px',
                          backgroundColor: '#fff',
                          borderRadius: '50%',
                          position: 'absolute',
                          right: '-6px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
                        }} />
                      </div>
                    </div>
                  </div>
                </>
              ) : isTransferringPlayback ? (
                <div style={{ 
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: '1.1rem'
                }}>
                  Starting playback...
                </div>
              ) : (
                <div style={{ 
                  color: 'rgba(255, 255, 255, 0.7)',
                  fontSize: '1.1rem'
                }}>
                  Ready to play
                </div>
              )}
            </div>

            {/* Controls */}
            <div style={{ 
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
              width: '100%'
            }}>
              <div style={{ 
                display: 'flex',
                justifyContent: 'center',
                gap: '1rem'
              }}>
                <button 
                  onClick={previousTrack}
                  className="button"
                  disabled={!currentTrack || isTransferringPlayback}
                >
                  ⏮️ Previous
                </button>
                
                <button 
                  onClick={togglePlay}
                  className="button"
                  disabled={!currentTrack || isTransferringPlayback}
                >
                  {isPlaying ? '⏸️ Pause' : '▶️ Play'}
                </button>
                
                <button 
                  onClick={nextTrack}
                  className="button"
                  disabled={!currentTrack || isTransferringPlayback}
                >
                  ⏭️ Next
                </button>
              </div>

              {/* Volume and Playback Settings Row */}
              <div style={{ 
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
                width: '100%',
                maxWidth: '500px',
                marginTop: '0.5rem'
              }}>
                {/* Volume Control */}
                <div className="volume-control">
                  <button 
                    onClick={handleVolumeButtonClick}
                    className="volume-icon-button"
                    aria-label={volume === 0 ? 'Unmute' : 'Mute'}
                  >
                    {volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊'}
                  </button>
                  
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="volume-slider"
                    style={{
                      background: volume === 0 
                        ? 'rgba(255, 255, 255, 0.1)' 
                        : `linear-gradient(to right, var(--primary-color) ${volume}%, rgba(255, 255, 255, 0.1) ${volume}%)`
                    }}
                  />
                  
                  <span className="volume-level">{volume}%</span>
                </div>

                {/* Playback Settings */}
                <button 
                  onClick={toggleRepeat}
                  className="button"
                  disabled={!currentTrack || isTransferringPlayback}
                  title={isRepeating ? 'Repeat: On' : 'Repeat: Off'}
                  style={{
                    filter: isRepeating ? 'none' : 'grayscale(100%) brightness(70%)'
                  }}
                >
                  🔁
                </button>
                <button 
                  onClick={toggleAutoplay}
                  className="button"
                  disabled={!currentTrack || isTransferringPlayback}
                  title={isAutoplaying ? 'Autoplay: On' : 'Autoplay: Off'}
                  style={{
                    filter: isAutoplaying ? 'none' : 'grayscale(100%) brightness(70%)'
                  }}
                >
                  🔄
                </button>
              </div>
            </div>

            {/* Queue/Playlist */}
            {queue.length > 0 && (
              <div className="queue-container">
                {queue.map((track, index) => (
                  <div 
                    key={track.id} 
                    className={`queue-item ${currentTrack?.id === track.id ? 'active' : ''}`}
                    onClick={() => playTrack(index)}
                    style={{ cursor: 'pointer' }}
                  >
                    <img 
                      src={track.album.images[track.album.images.length - 1].url}
                      alt={track.album.name}
                    />
                    <div className="queue-item-info">
                      <p className="queue-item-title">{track.name}</p>
                      <p className="queue-item-artist">
                        {track.artists.map(a => a.name).join(', ')}
                      </p>
                    </div>
                    <span className="queue-item-duration">{track.duration}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default SpotifyPlayer; 