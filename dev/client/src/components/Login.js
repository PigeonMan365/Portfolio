import React, { useEffect, useState } from 'react';
import '../styles/shared.css';

function Login() {
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
    }
  }, []);

  const handleLogin = () => {
    setError(''); // Clear any existing errors
    window.location.href = 'http://localhost:3001/api/auth/login';
  };

  return (
    <div className="animated-background">
      <div className="container">
        <img src="/CookieLogo.png" alt="Push-D Logo" className="logo floating-logo" />
        <div className="card">
          <h1 className="title">Push-D Recommendation Application</h1>
          {error && (
            <div className="error-message">
              {error === 'no_code' ? 'Authentication failed: No authorization code received' :
               error === 'invalid_token_response' ? 'Authentication failed: Invalid token response' :
               error === 'invalid_user_response' ? 'Authentication failed: Could not get user information' :
               error === 'database_error' ? 'Authentication failed: Database error' :
               `Authentication failed: ${error}`}
            </div>
          )}
          <button onClick={handleLogin} className="button">
            Login with Spotify
          </button>
          <p style={{ marginTop: '2rem', color: 'var(--text-color)' }}>
            © 2025 Push-D. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
