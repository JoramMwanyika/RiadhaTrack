import { FormEvent, useState } from 'react';
import { Lock, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './ui/Spinner';

export function Login() {
  const { login, error } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!username.trim() || !password) {
      setLocalError('Username and password are required');
      return;
    }
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch {
      // error already set in context
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface-950 via-surface-900 to-brand-950/40 p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <img
            src="/logo.jpeg"
            alt="RiadhaTrack"
            className="mx-auto h-28 w-auto object-contain mb-3 drop-shadow-lg rounded-lg"
          />
          <p className="mt-1 text-sm text-slate-400">
            Local coaching dashboard
          </p>
        </div>

        <div className="card p-8">
          <h2 className="text-lg font-semibold text-white mb-6">Sign in</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="label">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  className="input pl-10"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={submitting}
                  placeholder="coach@school"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  className="input pl-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  placeholder="••••••••"
                />
              </div>
            </div>

            {(localError || error) && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-300">
                {localError || error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full py-2.5"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Spinner className="h-4 w-4" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            Credentials are stored only in this browser session.
            <br />
            Never share your login on public networks.
          </p>
        </div>
      </div>
    </div>
  );
}