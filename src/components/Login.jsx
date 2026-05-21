import { useState } from 'react';
import { signIn, signUp } from '../lib/auth.jsx';

export default function Login() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        const r = await signUp(email, password, name);
        if (r.session) {
          // confirmation disabled → signed in immediately
        } else {
          setInfo('Account created. Check your email for the confirmation link, then sign in.');
          setMode('signin');
        }
      }
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  const inputCls = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2';

  return (
    <div className="mx-auto max-w-sm p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Stockroom</h1>
      <p className="text-slate-600 text-sm">
        {mode === 'signin' ? 'Sign in to continue.' : 'Create your staff account.'}
      </p>

      <form className="space-y-3" onSubmit={submit}>
        {mode === 'signup' && (
          <label className="block">
            <span className="block text-sm text-slate-700">Name</span>
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </label>
        )}
        <label className="block">
          <span className="block text-sm text-slate-700">Email</span>
          <input
            className={inputCls}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="block">
          <span className="block text-sm text-slate-700">Password</span>
          <input
            className={inputCls}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={6}
          />
        </label>

        {error && <p className="text-red-700 text-sm">{error}</p>}
        {info && <p className="text-emerald-700 text-sm">{info}</p>}

        <button className="tap-primary w-full" type="submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <button
        type="button"
        className="tap-secondary w-full"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setError(null);
          setInfo(null);
        }}
      >
        {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
      </button>
    </div>
  );
}
