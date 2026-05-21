import { useEffect } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { isConfigured, isDemoMode, supabase } from './lib/supabase.js';
import { signOut, useSession } from './lib/auth.jsx';
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

const tabs = [
  { to: '/',        label: 'Inventory' },
  { to: '/scan',    label: 'Scan' },
  { to: '/labels',  label: 'Labels' },
  { to: '/reports', label: 'Reports' },
];

function AppShell() {
  const { session } = useSession();
  const me =
    session?.user?.user_metadata?.full_name || session?.user?.email || '';

  // Install the offline-queue drainer once we have a live supabase client.
  // It listens for `online` and ticks every 60s to flush pending movements.
  useEffect(() => {
    installQueueDrainer(supabase);
  }, []);

  return (
    <div className="flex h-full flex-col bg-slate-950">
      {isDemoMode && (
        <div className="bg-amber-500/15 text-amber-200 text-[11px] font-medium text-center py-1 px-3 border-b border-amber-500/30">
          Demo mode — all data is fake and changes don&rsquo;t persist.
        </div>
      )}
      <header className="border-b border-slate-800 bg-slate-900 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">
          <span className="text-sky-400">Stock</span>room
        </h1>
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <PendingBadge />
          <span className="hidden sm:inline truncate max-w-[12rem]">{me}</span>
          <button
            onClick={() => signOut()}
            className="text-slate-500 hover:text-slate-200 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        <Routes>
          <Route path="/"            element={<Inventory />} />
          <Route path="/items/new"   element={<NewItem />} />
          <Route path="/items/:id"        element={<ItemDetail />} />
          <Route path="/items/:id/edit"   element={<EditItem />} />
          <Route path="/scan"        element={<Scan />} />
          <Route path="/labels"      element={<Labels />} />
          <Route path="/reports"     element={<Reports />} />
        </Routes>
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-800 bg-slate-900/95 backdrop-blur">
        <ul className="mx-auto grid max-w-screen-sm grid-cols-4">
          {tabs.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end={t.to === '/'}
                className={({ isActive }) =>
                  `tap w-full flex-col text-xs transition-colors ${
                    isActive ? 'text-sky-400' : 'text-slate-400'
                  }`
                }
              >
                {t.label}
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
  return (
    <AuthGate>
      <AppShell />
    </AuthGate>
  );
}
