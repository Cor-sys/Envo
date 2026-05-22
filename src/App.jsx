import { useEffect } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { isConfigured, isDemoMode, supabase } from './lib/supabase.js';
import { isAdmin, signOut, useSession, useStaffProfile } from './lib/auth.jsx';
import { installQueueDrainer } from './lib/offlineQueue.js';
import AuthGate from './components/AuthGate.jsx';
import PendingBadge from './components/PendingBadge.jsx';
import SwipeRoutes from './components/SwipeRoutes.jsx';
import Inventory from './pages/Inventory.jsx';
import NewItem from './pages/NewItem.jsx';
import ItemDetail from './pages/ItemDetail.jsx';
import EditItem from './pages/EditItem.jsx';
import Labels from './pages/Labels.jsx';
import Scan from './pages/Scan.jsx';
import Reports from './pages/Reports.jsx';
import Sds from './pages/Sds.jsx';
import RedeemInvite from './pages/RedeemInvite.jsx';
import Admin from './pages/Admin.jsx';

function SetupNeeded() {
  return (
    <div className="mx-auto max-w-md p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Stockroom — setup needed</h1>
      <p className="text-slate-300">
        The app can&rsquo;t talk to Supabase yet. To finish setup:
      </p>
      <ol className="list-decimal list-inside space-y-2 text-slate-300">
        <li>Create a Supabase project (free tier).</li>
        <li>
          Run <code className="rounded bg-slate-800 px-1 text-slate-100">db/schema.sql</code> in
          the SQL editor.
        </li>
        <li>
          Copy <code className="rounded bg-slate-800 px-1 text-slate-100">.env.example</code> to{' '}
          <code className="rounded bg-slate-800 px-1 text-slate-100">.env.local</code> and fill
          in the project URL and anon/publishable key.
        </li>
        <li>Restart <code className="rounded bg-slate-800 px-1 text-slate-100">npm run dev</code>.</li>
      </ol>
    </div>
  );
}

// Labels was a tab previously but is a once-per-new-item action — it now
// lives as a button on the Inventory page, freeing the slot for SDS which
// is checked daily for compliance.
const tabs = [
  { to: '/',        label: 'Inventory' },
  { to: '/scan',    label: 'Scan' },
  { to: '/sds',     label: 'SDS' },
  { to: '/reports', label: 'Reports' },
];
const tabOrder = tabs.map((t) => t.to);

function AppShell() {
  const { session } = useSession();
  const { profile } = useStaffProfile();
  const location = useLocation();
  const me =
    profile?.username ||
    session?.user?.user_metadata?.full_name ||
    session?.user?.user_metadata?.username ||
    session?.user?.email || '';
  const admin = isAdmin(profile);

  // Install the offline-queue drainer once we have a live supabase client.
  // It listens for `online` and ticks every 60s to flush pending movements.
  useEffect(() => {
    installQueueDrainer(supabase);
  }, []);

  // Only attach the swipe gesture on top-level tab routes. Detail pages
  // ({/items/:id}, /items/new, /items/:id/edit, /admin) shouldn't capture
  // horizontal drag — the user is reading details, not navigating tabs.
  const isTabRoute = tabOrder.includes(location.pathname);

  const routes = (
    <Routes>
      <Route path="/"            element={<Inventory />} />
      <Route path="/items/new"   element={<NewItem />} />
      <Route path="/items/:id"        element={<ItemDetail />} />
      <Route path="/items/:id/edit"   element={<EditItem />} />
      <Route path="/scan"        element={<Scan />} />
      <Route path="/labels"      element={<Labels />} />
      <Route path="/sds"         element={<Sds />} />
      <Route path="/reports"     element={<Reports />} />
      <Route path="/admin"       element={<Admin />} />
    </Routes>
  );

  return (
    <div className="flex h-full flex-col">
      {isDemoMode && (
        <div className="bg-amber-500/15 text-amber-800 text-[11px] font-medium text-center py-1 px-3 border-b border-amber-500/30">
          Demo mode — all data is fake and changes don&rsquo;t persist.
        </div>
      )}
      <header className="border-b border-slate-800/80 bg-slate-900/70 backdrop-blur">
        <div className="mx-auto max-w-app w-full px-4 py-3 flex items-center justify-between">
          <h1 className="wordmark">
            <span className="wordmark-dot" />
            stockroom
          </h1>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <PendingBadge />
            {admin && (
              <Link
                to="/admin"
                className="text-honey-500 hover:text-honey-600 transition-colors text-xs uppercase tracking-wide font-medium"
              >
                Admin
              </Link>
            )}
            <span className="hidden sm:inline truncate max-w-[12rem]">{me}</span>
            <button
              onClick={() => signOut()}
              className="text-slate-500 hover:text-slate-200 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        <div className="mx-auto max-w-app w-full">
          {isTabRoute ? (
            <SwipeRoutes tabOrder={tabOrder}>{routes}</SwipeRoutes>
          ) : routes}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-800/80 bg-slate-900/85 backdrop-blur">
        <ul className="mx-auto grid max-w-app grid-cols-4">
          {tabs.map((t) => (
            <li key={t.to} className="relative">
              <NavLink
                to={t.to}
                end={t.to === '/'}
                className={({ isActive }) =>
                  `tap w-full flex-col text-xs transition-colors relative ${
                    isActive ? 'nav-active' : 'text-slate-400'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="nav-active-bar" />}
                    {t.label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export default function App() {
  if (!isConfigured) return <SetupNeeded />;

  // Invite redemption needs to render BEFORE AuthGate decides whether to
  // show the login screen — invitees have no session yet, that's the point.
  // The route still goes through React Router so direct links work.
  return (
    <Routes>
      <Route path="/invite"        element={<RedeemInvite />} />
      <Route path="/invite/:code"  element={<RedeemInvite />} />
      <Route path="/*" element={
        <AuthGate>
          <AppShell />
        </AuthGate>
      } />
    </Routes>
  );
}
