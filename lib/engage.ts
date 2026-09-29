import { Alert, Share } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';
import { getCoords } from './location';
import { fmtDate, planTitle, spotsLabel } from './theme';
import { safe, showError } from './errors';

export const KUDOS = [
  { tag: 'mvp', label: '🏆 MVP' },
  { tag: 'good_vibes', label: '✨ Good vibes' },
  { tag: 'on_time', label: '⏰ On time' },
  { tag: 'carried', label: '💪 Carried' },
  { tag: 'friendly', label: '🤝 Friendly' },
] as const;
export const kudosLabel = (tag: string) => KUDOS.find((k) => k.tag === tag)?.label ?? tag;

// Deep link into the app (exp://… in Expo Go, playmate://… in builds), wrapped in an https link via the `open`
// edge function so WhatsApp makes it tappable. Falls back to the raw app link if the function isn't deployed.
export function shareLink(path: string) {
  const app = Linking.createURL(path);
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  return base ? `${base}/functions/v1/open?to=${encodeURIComponent(app)}` : app;
}

export async function sharePlan(d: { id: string; title?: string | null; activity_name: string; activity_icon: string; starts_at: string;
  venue_name: string; slots_total: number; slots_filled: number; open_ended?: boolean }) {
  const left = d.slots_total - d.slots_filled;
  const lines = [`${d.activity_icon} ${planTitle(d)}`, `🗓 ${fmtDate(d.starts_at)}`, `📍 ${d.venue_name}`];
  if (left > 0) lines.push(`🙋 ${spotsLabel(d)}`);
  lines.push('', `Join on Playmate 👉 ${shareLink(`/request/${d.id}`)}`);
  await Share.share({ message: lines.join('\n') }).catch(() => {});
}

export async function shareCrew(c: { name: string; emoji: string; code: string }) {
  await Share.share({ message: `${c.emoji} Join my crew "${c.name}" on Playmate!\nCode: ${c.code}\n👉 ${shareLink(`/crews?code=${c.code}`)}` }).catch(() => {});
}

// "Ask to join": the host accepts or declines. People the host invited, and crew members on crew plans, get in straight away.
// Returns 'joined', 'pending', or null if it failed (the error has been shown).
export async function askToJoin(plan: { id: string; host_name?: string; host?: { name?: string } }): Promise<'joined' | 'pending' | null> {
  const { data, error } = await safe(supabase.rpc('join_request', { p_request: plan.id }));
  if (error) { showError("Couldn't send your request", error); return null; }
  const host = plan.host_name ?? plan.host?.name ?? 'The host';
  if (data === 'pending') Alert.alert('Request sent 🙋', `${host} will get a ping. You'll get an alert when they accept.`);
  return data === 'joined' ? 'joined' : 'pending';
}

export async function cancelAsk(requestId: string) {
  const { error } = await safe(supabase.rpc('cancel_join_request', { p_request: requestId }));
  if (error) showError("Couldn't cancel your request", error);
  return !error;
}

export async function checkIn(requestId: string) {
  const pos = await getCoords();
  if (!pos) return Alert.alert('Location needed', 'Allow location access so we can check you in at the spot.');
  const { error } = await safe(supabase.rpc('check_in', { p_request: requestId, p_lat: pos.lat, p_lng: pos.lng }));
  if (error) showError("Couldn't check in", error);
  else Alert.alert('Checked in ✅', 'Nice, you showed up. That counts towards your show-up score.');
}

// Weekly stats from my_week() (the home screen uses the streak).
export type Week = { plans: number; hosted: number; new_activity: boolean; moments: number; streak: number };
