import React from 'react';

function PlaylistDisplay({ playlist }) {
  return (
    <div>
      <h2>{playlist.name}</h2>
      <ul>
        {playlist.songs.map((song, index) => (
          <li key={index}>
            {song.title} by {song.artist}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PlaylistDisplay;
