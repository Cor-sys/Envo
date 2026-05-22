import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { redeemInvite } from '../lib/auth.jsx';

// Public page (no auth required) that takes a one-time invite code, lets the
// invitee pick a username + password, and creates their account.
//
// The code can be passed in the URL (`/invite/ABCD-EFGH-12`) so the admin
// can share a single tap-to-redeem link, OR typed manually if they only
// have the code itself.

export default function RedeemInvite() {
  const { code: codeFromUrl } = useParams();
  const nav = useNavigate();

  const [code, setCode]         = useState(codeFromUrl ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [error, setError]       = useState(null);
  const [busy, setBusy]         = useState(false);

  useEffect(() => {
    if (codeFromUrl) setCode(codeFromUrl);
  }, [codeFromUrl]);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords don’t match.');
      return;
    }
    setBusy(true);
    try {
      await redeemInvite({ code, username, password });
      // Server signed us in already; bounce to the app root.
      nav('/', { replace: true });
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  const inputCls = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 placeholder-slate-500';

  return (
    <div className="mx-auto max-w-sm p-6 space-y-4">
      <h1 className="wordmark text-2xl">
        <span className="wordmark-dot" />
        stockroom
      </h1>
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Redeem invite</h2>
        <p className="text-slate-400 text-sm mt-1">
          Use the code your admin sent you to create an account.
        </p>
      </div>

      <form className="space-y-3" onSubmit={submit}>
        <label className="block">
          <span className="block text-sm text-slate-300">Invite code</span>
          <input
            className={`${inputCls} font-mono tracking-wider uppercase`}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XXXX-XXXX-XX"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck="false"
            required
          />
        </label>
        <label className="block">
          <span className="block text-sm text-slate-300">Choose a username</span>
          <input
            className={inputCls}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
            placeholder="2–40 characters: letters, numbers, . - _"
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
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>
        <label className="block">
          <span className="block text-sm text-slate-300">Confirm password</span>
          <input
            className={inputCls}
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </label>

        {error && <p className="text-red-300 text-sm">{error}</p>}

        <button className="tap-primary w-full" type="submit" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <div className="border-t border-slate-800 pt-3 text-center">
        <Link to="/" className="text-sm text-slate-400 hover:text-slate-200">
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}
