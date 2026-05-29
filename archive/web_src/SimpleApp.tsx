import React, { useState } from 'react';
import { useSimpleAuthStore } from './stores/simpleAuthStore';
import MediaBrowser from './pages/MediaBrowser';
import Logo from './components/ui/Logo';

export default function SimpleApp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { user, isAuthenticated, isLoading, error, login, logout, clearError } = useSimpleAuthStore();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  // Login Screen
  if (!isAuthenticated) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '400px',
          padding: '40px',
          borderRadius: '20px',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <Logo variant="full" size="lg" />
            <h1 style={{ color: 'white', fontSize: '24px', margin: '20px 0 10px' }}>
              Simple Login
            </h1>
            <p style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '14px' }}>
              Use these test accounts:
            </p>
            <div style={{
              marginTop: '15px',
              padding: '15px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '10px',
              fontSize: '13px',
              color: 'rgba(255, 255, 255, 0.9)',
              textAlign: 'left',
              fontFamily: 'monospace'
            }}>
              <div>admin@visitdetroit.com / admin123</div>
              <div>test@example.com / test123</div>
              <div>demo@demo.com / demo</div>
            </div>
          </div>

          {error && (
            <div style={{
              marginBottom: '20px',
              padding: '10px',
              borderRadius: '8px',
              background: 'rgba(244, 67, 54, 0.2)',
              border: '1px solid rgba(244, 67, 54, 0.5)',
              color: '#ff6b6b',
              fontSize: '14px',
              textAlign: 'center'
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearError();
              }}
              required
              style={{
                width: '100%',
                padding: '12px',
                marginBottom: '15px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                fontSize: '14px',
                outline: 'none',
              }}
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearError();
              }}
              required
              style={{
                width: '100%',
                padding: '12px',
                marginBottom: '20px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                fontSize: '14px',
                outline: 'none',
              }}
            />

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: 'none',
                background: isLoading
                  ? 'rgba(150, 150, 150, 0.5)'
                  : 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                color: 'white',
                fontSize: '16px',
                fontWeight: '600',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease',
              }}
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Main App
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #0f0f1e 100%)'
    }}>
      {/* Header */}
      <div style={{
        padding: '20px',
        background: 'rgba(0, 0, 0, 0.3)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <Logo variant="icon" size="sm" />
          <h1 style={{ color: 'white', fontSize: '20px', margin: 0 }}>
            Noah Media Platform
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '14px' }}>
            {user?.email}
          </span>
          <button
            onClick={logout}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'transparent',
              color: 'white',
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Media Browser */}
      <MediaBrowser />
    </div>
  );
}