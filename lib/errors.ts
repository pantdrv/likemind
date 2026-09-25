import { Alert, Linking } from 'react-native';

// Turns Supabase, network and Postgres errors into a message a person can act on.
// Messages we raise ourselves in SQL (`raise exception '...'`, code P0001) are already written for people, so they pass through.
export function friendlyError(err: unknown): string {
  if (!err) return 'Something went wrong. Please try again.';
  const e = err as { message?: string; code?: string; status?: number; name?: string };
  const msg = String(e.message ?? err);
  const code = String(e.code ?? '');

  if (e.name === 'AbortError' || /timed? ?out|aborted/i.test(msg)) return 'The server is taking too long to answer. Check your internet and try again.';
  if (/network request failed|failed to fetch|network ?error|load failed|fetch failed|internet connection/i.test(msg))
    return "Can't reach the server. Check your internet connection and try again.";

  // Auth
  if (/invalid login credentials/i.test(msg)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(msg)) return 'Confirm your email first. Check your inbox for the link we sent.';
  if (/user already registered|already been registered/i.test(msg)) return 'An account with this email already exists. Try logging in instead.';
  if (/password should be at least|weak password/i.test(msg)) return 'Pick a stronger password (at least 6 characters).';
  if (/unable to validate email|invalid email/i.test(msg)) return "That email address doesn't look right.";
  if (/jwt|refresh token|session (?:not found|expired|missing)/i.test(msg) || code === 'PGRST301' || e.status === 401)
    return 'Your session expired. Please log out and log in again.';
  if (e.status === 429 || /rate limit|too many requests/i.test(msg)) return 'Too many attempts. Wait a minute and try again.';

  // Our own SQL exceptions
  if (code === 'P0001' && msg) return msg;

  // Database / API
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42883' || code === '42P01' || code === '42703'
    || /could not find the (?:function|table)|does not exist/i.test(msg))
    return 'This feature needs a database update. Run the latest SQL files in Supabase, then try again.';
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) return "You don't have permission to do that.";
  if (code === '23505' || /duplicate key/i.test(msg)) return "That's already been done.";
  if (code === '23503') return "That item doesn't exist anymore. Pull down to refresh.";
  if (['22P02', '23502', '23514', '22001', '22003'].includes(code)) return 'Some details look invalid. Check them and try again.';
  if (code === 'PGRST116') return "Couldn't find that. It may have been deleted.";
  if ((e.status ?? 0) >= 500 || /internal server error|bad gateway|service unavailable/i.test(msg))
    return 'The server had a hiccup. Please try again in a moment.';
  if (/object not found|bucket not found/i.test(msg)) return "Couldn't find that file. It may have been deleted.";
  if (/payload too large|exceeded the maximum allowed size/i.test(msg)) return 'That photo is too big. Try a smaller one.';

  // Short, plain messages (permission prompts, our own Errors) are fine to show; technical ones are not.
  if (msg.length <= 160 && !/pgrst|sql|syntax|column|relation|constraint|violates|null value|undefined|typeerror|\bat \w+ \(/i.test(msg)) return msg;
  return 'Something went wrong. Please try again.';
}

export function showError(title: string, err: unknown) {
  if (__DEV__) console.warn(`[${title}]`, err);
  Alert.alert(title, friendlyError(err));
}

// Opens a web/maps link; tells the person instead of failing silently if the phone can't.
export function openUrl(url: string) {
  Linking.openURL(url).catch(() => Alert.alert("Couldn't open the link", url));
}

// Awaits a Supabase query (or any { data, error } promise) and never throws: a thrown network failure becomes `error`.
export async function safe<T = unknown>(q: PromiseLike<{ data?: T; error: any }>): Promise<{ data: T | null; error: any }> {
  try {
    const { data, error } = await q;
    return { data: error ? null : (data ?? null), error };
  } catch (error) {
    return { data: null, error };
  }
}
