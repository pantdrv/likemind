import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';
import { friendlyError } from './errors';

// Google sign-in through Supabase OAuth in the system browser (works in Expo Go and in builds).
// The redirect URL (exp://… in Expo Go, playmate://… in builds) must be in Supabase's Redirect URLs allow-list.
// Returns an error message, or null on success or when the user closes the browser.
export async function signInWithGoogle(): Promise<string | null> {
  try {
    return await googleFlow();
  } catch (e) {
    return friendlyError(e);
  }
}

async function googleFlow(): Promise<string | null> {
  const redirectTo = Linking.createURL('auth/callback');
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
  if (error || !data?.url) return error ? friendlyError(error) : 'Could not start Google sign-in.';

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return null;

  // Tokens come back in the URL fragment (implicit flow) or as a ?code= (PKCE flow).
  const [, query = ''] = res.url.split('?');
  const params = new URLSearchParams([query.split('#')[0], res.url.split('#')[1] ?? ''].filter(Boolean).join('&'));
  const failure = params.get('error_description') ?? params.get('error');
  if (failure) return /access_denied/i.test(failure) ? null : failure.replace(/\+/g, ' ');

  const code = params.get('code');
  if (code) { const { error } = await supabase.auth.exchangeCodeForSession(code); return error ? friendlyError(error) : null; }

  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (access_token && refresh_token) { const { error } = await supabase.auth.setSession({ access_token, refresh_token }); return error ? friendlyError(error) : null; }
  return 'Google sign-in did not finish. Please try again.';
}
