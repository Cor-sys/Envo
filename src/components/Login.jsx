import { useState } from 'react';
import { Link } from 'react-router-dom';
import { signInWithUsername } from '../lib/auth.jsx';

// Sign-in only. There's no sign-up path here on purpose — new accounts can
// only be created through /invite/:code, which an admin distributes
// out-of-band. The "Have an invite code?" link below routes new users
// straight into that flow.
export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signInWithUsername(identifier, password);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  const inputCls = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 placeholder-slate-500';

  return (
    <div className="mx-auto max-w-sm p-6 space-y-4">
      <h1 className="wordmark text-2xl">
        <span className="wordmark-dot" />
        stockroom
      </h1>
      <p className="text-slate-400 text-sm">Sign in to continue.</p>

      <form className="space-y-3" onSubmit={submit}>
        <label className="block">
          <span className="block text-sm text-slate-300">Username</span>
          <input
            className={inputCls}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            required
          />
        </label>
        <label className="block">
          <span className="block text-sm text-slate-300">Password</span>
          <input
            className={inputCls}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="text-red-300 text-sm">{error}</p>}

        <button className="tap-primary w-full" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="border-t border-slate-800 pt-3 text-center">
        <p className="text-xs text-slate-500 mb-1">First time here?</p>
        <Link to="/invite" className="text-sm text-honey-400 hover:text-honey-400">
          I have an invite code →
        </Link>
      </div>
    </div>
  );
}
