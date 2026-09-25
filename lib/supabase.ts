import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env and restart Expo.');

// Gives up on a request after 30s, so a dead connection shows an error instead of spinning forever.
const TIMEOUT_MS = 30_000;
const fetchWithTimeout: typeof fetch = (input, init: RequestInit = {}) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  init.signal?.addEventListener?.('abort', () => ctrl.abort());
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
};

export const supabase = createClient(url ?? 'https://missing.supabase.co', key ?? 'missing', {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  global: { fetch: fetchWithTimeout },
});
