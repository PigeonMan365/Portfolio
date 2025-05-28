import React, { useState } from 'react';
import axios from 'axios';

function Chatbot({ user, setPlaylist, chat, setChat }) {
  const [input, setInput] = useState('');

  const sendPrompt = async () => {
    try {
      const res = await axios.post(
        'http://localhost:3001/api/playlists/generate',
        { prompt: input },
        { headers: { Authorization: user.token } }
      );
      setPlaylist(res.data.playlist);
      setChat([
        ...chat,
        { sender: 'user', message: input },
        { sender: 'bot', message: 'Playlist generated!' }
      ]);
      setInput('');
    } catch (error) {
      console.error('Error generating playlist', error);
    }
  };

  return (
    <div>
      <h2>Chat with AI</h2>
      <div className="chat-window" style={{ border: '1px solid #ccc', padding: '1rem', height: '300px', overflowY: 'scroll' }}>
        {chat.map((msg, index) => (
          <div key={index}>
            <strong>{msg.sender}:</strong> {msg.message}
          </div>
        ))}
      </div>
      <input
        type="text"
        placeholder="Enter your prompt"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <button onClick={sendPrompt}>Send</button>
    </div>
  );
}

export default Chatbot;
