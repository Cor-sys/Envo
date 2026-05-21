import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anon);

// Export `null` when env vars are missing so the app shell can render a
// friendly setup screen instead of crashing on import.
export const supabase = isConfigured ? createClient(url, anon) : null;
