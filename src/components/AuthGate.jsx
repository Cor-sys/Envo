import { useSession } from '../lib/auth.jsx';
import Login from './Login.jsx';

export default function AuthGate({ children }) {
  const { session, loading } = useSession();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }
  if (!session) return <Login />;
  return children;
}
