import { FormEvent, useState } from 'react';
import { ArrowRight, Eye, EyeOff, Lock, Mail, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Spinner } from './ui/Spinner';

export function Login() {
  const { login, register, error } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const signingIn = mode === 'login';

  async function submit(event: FormEvent) {
    event.preventDefault(); setLocalError(null);
    if (!username.trim() || !password) return setLocalError('Username and password are required.');
    if (!signingIn && password !== confirm) return setLocalError('Passwords do not match.');
    setSubmitting(true);
    try { if (signingIn) await login(username.trim(), password); else await register(username.trim(), password); } catch { /* displayed by context */ } finally { setSubmitting(false); }
  }
  function switchMode(next: 'login' | 'register') { setMode(next); setLocalError(null); setConfirm(''); }

  return <main className="auth-screen">
    <section className="auth-shell">
      <BrandPanel />
      <section className="auth-form-panel">
        <div className="auth-tabs" aria-label="Authentication mode">
          <button className={signingIn ? 'active' : ''} onClick={() => switchMode('login')}>Sign in</button>
          <button className={!signingIn ? 'active' : ''} onClick={() => switchMode('register')}>Create account</button>
        </div>
        <div className="auth-form-wrap">
          <p className="eyebrow">RIADHATRACK PLATFORM</p>
          <h1>{signingIn ? <>Welcome <em>Back</em></> : <>Create Your <em>Account</em></>}</h1>
          <p className="auth-subtitle">{signingIn ? 'Sign in to your RiadhaTrack coaching dashboard.' : 'Create a local account to start tracking athlete performance.'}</p>
          <form onSubmit={submit} className="auth-form">
            <label>Username
              <span className="auth-input"><UserRound size={17}/><input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" placeholder="coach.mwangi" disabled={submitting}/></span>
            </label>
            {!signingIn && <p className="field-help"><Mail size={14}/> This is your account username, not necessarily an email address.</p>}
            <label>Password
              <span className="auth-input"><Lock size={17}/><input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete={signingIn ? 'current-password' : 'new-password'} placeholder={signingIn ? 'Enter your password' : 'At least 6 characters'} disabled={submitting}/><button type="button" onClick={() => setShowPassword(v => !v)} aria-label="Show or hide password">{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span>
            </label>
            {!signingIn && <label>Confirm password
              <span className="auth-input"><Lock size={17}/><input type={showPassword ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" placeholder="Confirm your password" disabled={submitting}/></span>
            </label>}
            {(localError || error) && <div className="auth-error">{localError || error}</div>}
            <button className="auth-submit" disabled={submitting}>{submitting ? <><Spinner className="h-4 w-4"/> Please wait…</> : <>{signingIn ? 'Sign In' : 'Create Account'} <ArrowRight size={19}/></>}</button>
          </form>
          <p className="auth-switch">{signingIn ? "Don’t have an account?" : 'Already have an account?'} <button onClick={() => switchMode(signingIn ? 'register' : 'login')}>{signingIn ? 'Sign up' : 'Sign in'}</button></p>
        </div>
      </section>
    </section>
  </main>;
}

function BrandPanel() { return <aside className="auth-brand-panel">
  <div className="auth-brand"><img src="/riadha-track-logo.png" alt="RiadhaTrack"/><span>ATHLETES <b/> PERFORMANCE <b/> PROGRESS</span></div>
  <div className="runner-glow" aria-hidden="true" />
  <div className="auth-tagline"><h2>Track Talent.<br/><em>Build Champions.</em></h2><p>Real-time athletics tracking<br/>for a stronger tomorrow.</p></div>
  <footer><span>〽</span><strong>RiadhaTrack</strong><i/> Local First <i/> Faster Insights <i/> Greater Potential</footer>
</aside>; }
