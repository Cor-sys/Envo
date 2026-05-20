import { NavLink, Route, Routes } from 'react-router-dom';
import { isConfigured } from './lib/supabase.js';

function SetupNeeded() {
  return (
    <div className="mx-auto max-w-md p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Stockroom — setup needed</h1>
      <p className="text-slate-700">
        The app can&rsquo;t talk to Supabase yet. To finish setup:
      </p>
      <ol className="list-decimal list-inside space-y-2 text-slate-700">
        <li>Create a Supabase project (free tier).</li>
        <li>
          Run <code className="rounded bg-slate-200 px-1">db/schema.sql</code> in
          the SQL editor.
        </li>
        <li>
          Copy <code className="rounded bg-slate-200 px-1">.env.example</code> to{' '}
          <code className="rounded bg-slate-200 px-1">.env.local</code> and fill
          in the project URL and anon key.
        </li>
        <li>Restart <code className="rounded bg-slate-200 px-1">npm run dev</code>.</li>
      </ol>
    </div>
  );
}

function Placeholder({ title }) {
  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-slate-600 text-sm">
        Screen not built yet — see BRIEF.md §13 for build order.
      </p>
    </div>
  );
}

const tabs = [
  { to: '/',        label: 'Inventory' },
  { to: '/scan',    label: 'Scan' },
  { to: '/labels',  label: 'Labels' },
  { to: '/reports', label: 'Reports' },
];

export default function App() {
  if (!isConfigured) return <SetupNeeded />;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold">Stockroom</h1>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        <Routes>
          <Route path="/"        element={<Placeholder title="Inventory" />} />
          <Route path="/scan"    element={<Placeholder title="Scan In / Out" />} />
          <Route path="/labels"  element={<Placeholder title="Labels" />} />
          <Route path="/reports" element={<Placeholder title="Reports" />} />
        </Routes>
      </main>

      {/* Bottom tab bar — thumb-reach on phones. */}
      <nav className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white">
        <ul className="mx-auto grid max-w-screen-sm grid-cols-4">
          {tabs.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end={t.to === '/'}
                className={({ isActive }) =>
                  `tap w-full flex-col text-xs ${
                    isActive ? 'text-slate-900' : 'text-slate-500'
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
