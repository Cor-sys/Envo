import { useEffect } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { BarChart3, FlaskConical, Map as MapIcon, Package, ScanLine } from 'lucide-react';
import { isConfigured, isDemoMode, supabase } from './lib/supabase.js';
import { isAdmin, signOut, useStaffProfile } from './lib/auth.jsx';
import { installQueueDrainer } from './lib/offlineQueue.js';
import AuthGate from './components/AuthGate.jsx';
import PendingBadge from './components/PendingBadge.jsx';
import Inventory from './pages/Inventory.jsx';
import NewItem from './pages/NewItem.jsx';
import ItemDetail from './pages/ItemDetail.jsx';
import EditItem from './pages/EditItem.jsx';
import Labels from './pages/Labels.jsx';
import Scan from './pages/Scan.jsx';
import Reports from './pages/Reports.jsx';
import Sds from './pages/Sds.jsx';
import MapPage from './pages/Map.jsx';
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
  { to: '/',        label: 'Inventory', Icon: Package      },
  { to: '/scan',    label: 'Scan',      Icon: ScanLine     },
  { to: '/sds',     label: 'SDS',       Icon: FlaskConical },
  { to: '/reports', label: 'Reports',   Icon: BarChart3    },
  { to: '/map',     label: 'Map',       Icon: MapIcon      },
];

function AppShell() {
  const { profile } = useStaffProfile();
  const admin = isAdmin(profile);

  // Install the offline-queue drainer once we have a live supabase client.
  // It listens for `online` and ticks every 60s to flush pending movements.
  useEffect(() => {
    installQueueDrainer(supabase);
  }, []);

  // Body-scroll layout. The document itself scrolls — not <main> — so iOS
  // Safari paints a single continuous scrollbar at the viewport edge instead
  // of one segmented by rounded card edges. Header sticky, nav fixed.
  return (
    <div className="min-h-screen">
      {isDemoMode && (
        <div className="bg-amber-500/15 text-amber-200 text-[11px] font-medium text-center py-1 px-3 border-b border-amber-500/30">
          Demo mode — all data is fake and changes don&rsquo;t persist.
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-900/85 backdrop-blur">
        <div className="mx-auto max-w-app w-full px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2">
          <h1 className="wordmark shrink-0">stockroom</h1>
          <div className="flex items-center gap-2 sm:gap-3 text-sm text-slate-400 min-w-0">
            <PendingBadge />
            {admin && (
              <Link
                to="/admin"
                className="text-sage-300 hover:text-sage-200 transition-colors text-xs uppercase tracking-wide font-medium shrink-0"
              >
                Admin
              </Link>
            )}
            <button
              onClick={() => signOut()}
              className="text-xs sm:text-sm text-slate-500 hover:text-slate-200 transition-colors shrink-0"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="pb-28">
        <div className="mx-auto max-w-app w-full">
          <Routes>
            <Route path="/"            element={<Inventory />} />
            <Route path="/items/new"   element={<NewItem />} />
            <Route path="/items/:id"        element={<ItemDetail />} />
            <Route path="/items/:id/edit"   element={<EditItem />} />
            <Route path="/scan"        element={<Scan />} />
            <Route path="/labels"      element={<Labels />} />
            <Route path="/sds"         element={<Sds />} />
            <Route path="/reports"     element={<Reports />} />
            <Route path="/map"         element={<MapPage />} />
            <Route path="/admin"       element={<Admin />} />
          </Routes>
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800/80 bg-slate-900/95 backdrop-blur">
        <ul className="mx-auto grid max-w-app grid-cols-5">
          {tabs.map(({ to, label, Icon }) => (
            <li key={to} className="relative">
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex w-full flex-col items-center justify-center gap-1 min-h-[56px]
                   pt-2 pb-2 text-[11px] font-medium transition-colors select-none relative ${
                    isActive ? 'nav-active' : 'text-slate-400 hover:text-slate-200'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="nav-active-bar" />}
                    <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
                    <span>{label}</span>
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
