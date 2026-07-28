import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setToken = useStore((state) => state.setToken);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const response = await fetch('http://localhost:8000/api/v1/login/access-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Invalid credentials');
      }

      const data = await response.json();
      setToken(data.access_token);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-soc-dark flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-soc-card rounded-2xl shadow-2xl border border-gray-800 p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-soc-accent/10 rounded-full flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-soc-accent" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wider">ACE <span className="text-soc-accent">CS</span></h1>
          <p className="text-soc-muted text-sm mt-2">Sign in to ACS Control Plane</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {error && (
            <div className="p-3 bg-soc-alert/10 border border-soc-alert/20 rounded-lg text-soc-alert text-sm text-center">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-soc-muted mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-soc-dark border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-soc-accent transition-colors"
              placeholder="Username"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-soc-muted mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-soc-dark border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-soc-accent transition-colors"
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-soc-accent hover:bg-soc-accent/90 text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
        <div className="mt-8 pt-6 border-t border-gray-800/50 text-center text-xs text-soc-muted/70 flex justify-between">
          <span>Internal Security Monitor</span>
          <span>ACEDA Corp</span>
        </div>
      </div>
    </div>
  );
};
