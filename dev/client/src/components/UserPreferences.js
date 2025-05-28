import React, { useState, useEffect } from 'react';
import { FaCog, FaTimes, FaTrash, FaPlus, FaMinus } from 'react-icons/fa';
import '../styles/UserPreferences.css';

function UserPreferences({ isOpen, onClose, userId, accessToken }) {
  const [preferences, setPreferences] = useState({
    artist: [],
    song: [],
    genre: [],
    era: []
  });
  const [newPreference, setNewPreference] = useState({
    type: 'artist',
    value: '',
    isExcluded: false
  });
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({
    artist: false,
    song: false,
    genre: false,
    era: false
  });

  useEffect(() => {
    if (isOpen && userId) {
      fetchPreferences();
    }
  }, [isOpen, userId]);

  const toggleSection = (type) => {
    setCollapsedSections(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  const fetchPreferences = async () => {
    try {
      const [artistsRes, songsRes, genresRes, erasRes] = await Promise.all([
        fetch(`http://localhost:3001/api/user-preferences/artist?userId=${userId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }),
        fetch(`http://localhost:3001/api/user-preferences/song?userId=${userId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }),
        fetch(`http://localhost:3001/api/user-preferences/genre?userId=${userId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }),
        fetch(`http://localhost:3001/api/user-preferences/era?userId=${userId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        })
      ]);

      const [artists, songs, genres, eras] = await Promise.all([
        artistsRes.ok ? artistsRes.json() : [],
        songsRes.ok ? songsRes.json() : [],
        genresRes.ok ? genresRes.json() : [],
        erasRes.ok ? erasRes.json() : []
      ]);

      setPreferences({
        artist: artists || [],
        song: songs || [],
        genre: genres || [],
        era: eras || []
      });
    } catch (error) {
      console.error('Error fetching preferences:', error);
      setPreferences({
        artist: [],
        song: [],
        genre: [],
        era: []
      });
    }
  };

  const addPreference = async (newPreference) => {
    if (!newPreference.value.trim()) return;
    
    try {
      const response = await fetch(`http://localhost:3001/api/user-preferences/${newPreference.type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          value: newPreference.value,
          userId: userId,
          isExcluded: newPreference.isExcluded || false
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to add preference');
      }

      const data = await response.json();
      setPreferences(prev => ({
        ...prev,
        [newPreference.type]: [...(prev[newPreference.type] || []), data]
      }));
      setNewPreference(prev => ({ ...prev, value: '' }));
    } catch (error) {
      console.error('Error adding preference:', error);
      alert(error.message);
    }
  };

  const removePreference = async (type, id) => {
    try {
      const response = await fetch(`http://localhost:3001/api/user-preferences/${type}/${id}?userId=${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove preference');
      }

      setPreferences(prev => ({
        ...prev,
        [type]: prev[type].filter(item => item.id !== id)
      }));
    } catch (error) {
      console.error('Error removing preference:', error);
      alert(error.message);
    }
  };

  const toggleExclusion = async (type, id) => {
    try {
      const response = await fetch(`/api/preferences/${type}s/${id}/exclude`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setPreferences(prev => ({
          ...prev,
          [type + 's']: prev[type + 's'].map(item => 
            item.id === id ? { ...item, is_excluded: data.is_excluded } : item
          )
        }));
      } else {
        const errorData = await response.json();
        console.error('Error toggling exclusion:', errorData.error);
        alert(errorData.error || 'Failed to toggle exclusion');
      }
    } catch (error) {
      console.error('Error toggling exclusion:', error);
      alert('Failed to toggle exclusion. Please try again.');
    }
  };

  const wipePreferences = async () => {
    console.log('Current userId:', userId);
    console.log('Current userId type:', typeof userId);
    if (!userId) {
      alert('User ID is required. Please try logging in again.');
      return;
    }

    try {
      const url = `http://localhost:3001/api/user-preferences/wipe/${userId}`;
      console.log('Making request to:', url);
      console.log('Request headers:', {
        'Authorization': `Bearer ${accessToken}`
      });
      
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (response.ok) {
        setPreferences({
          artist: [],
          song: [],
          genre: [],
          era: []
        });
        setShowWipeConfirm(false);
      } else {
        const errorData = await response.json();
        console.log('Error response:', errorData);
        throw new Error(errorData.error || 'Failed to wipe preferences');
      }
    } catch (error) {
      console.error('Error wiping preferences:', error);
      alert(error.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="preferences-modal">
      <div className="preferences-content">
        <div className="preferences-header">
          <h2>User Preferences</h2>
          <button onClick={onClose} className="close-button">
            <FaTimes />
          </button>
        </div>

        <div className="preferences-form" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '1rem', width: '100%', justifyContent: 'center' }}>
            <select
              value={newPreference.type}
              onChange={(e) => setNewPreference(prev => ({ ...prev, type: e.target.value }))}
              style={{ padding: '0.5rem' }}
            >
              <option value="artist">Artist</option>
              <option value="song">Song</option>
              <option value="genre">Genre</option>
              <option value="era">Era</option>
            </select>

            <input
              type="text"
              value={newPreference.value}
              onChange={(e) => setNewPreference(prev => ({ ...prev, value: e.target.value }))}
              placeholder={`Enter ${newPreference.type} name`}
              style={{ padding: '0.5rem', flex: 1, maxWidth: '300px' }}
            />

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={newPreference.isExcluded}
                onChange={(e) => setNewPreference(prev => ({ ...prev, isExcluded: e.target.checked }))}
              />
              Exclude
            </label>
          </div>

          <button 
            onClick={() => addPreference(newPreference)} 
            style={{ 
              padding: '0.5rem 1rem',
              backgroundColor: 'var(--accent-color)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              width: '200px'
            }}
          >
            Add Preference
          </button>
        </div>

        <div className="preferences-list">
          {Object.entries(preferences).map(([type, items]) => (
            <div key={type} className={`preference-category ${collapsedSections[type] ? 'collapsed' : ''}`}>
              <div 
                className="preference-category-header"
                onClick={() => toggleSection(type)}
              >
                <h3>{type.charAt(0).toUpperCase() + type.slice(1)}s</h3>
                <span className="toggle-icon">▼</span>
              </div>
              <div className="preference-category-content">
                <ul>
                  {items.map((item) => (
                    <li key={item.id} className={item.is_excluded ? 'excluded' : ''}>
                      <div className="preference-item">
                        {item.is_excluded ? (
                          <FaMinus className="exclude-icon" />
                        ) : (
                          <FaPlus className="include-icon" />
                        )}
                        <span>{item.preference_value}</span>
                        <div className="preference-actions">
                          <button onClick={() => removePreference(type, item.id)}>
                            <FaTrash />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>

        <div className="preferences-footer">
          {showWipeConfirm ? (
            <div className="wipe-confirmation">
              <p>Are you sure you want to wipe all preferences?</p>
              <button onClick={wipePreferences} className="confirm-wipe">Yes, Wipe All</button>
              <button onClick={() => setShowWipeConfirm(false)}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setShowWipeConfirm(true)} className="wipe-button">
              Wipe All Preferences
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default UserPreferences; 