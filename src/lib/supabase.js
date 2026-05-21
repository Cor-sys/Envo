import { createClient } from '@supabase/supabase-js';
import { demoClient } from './demoClient.js';

const url  = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

// VITE_DEMO_MODE=true swaps in an in-memory mock so a frontend dev can run
// the app with realistic sample data and no Supabase credentials. The real
// production builds never set this flag.
export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

export const isConfigured = isDemoMode || Boolean(url && anon);

// Export `null` when env vars are missing AND not in demo mode, so the app
// shell can render a friendly setup screen instead of crashing on import.
export const supabase = isDemoMode
  ? demoClient
  : isConfigured
    ? createClient(url, anon)
    : null;
