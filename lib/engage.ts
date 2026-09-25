import { Alert, Share } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';
import { getCoords } from './location';
import { fmtDate, planTitle } from './theme';

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
  venue_name: string; slots_total: number; slots_filled: number }) {
  const left = d.slots_total - d.slots_filled;
  const lines = [`${d.activity_icon} ${planTitle(d)}`, `🗓 ${fmtDate(d.starts_at)}`, `📍 ${d.venue_name}`];
  if (left > 0) lines.push(`🙋 ${left} ${left === 1 ? 'spot' : 'spots'} left`);
  lines.push('', `Join on Playmate 👉 ${shareLink(`/request/${d.id}`)}`);
  await Share.share({ message: lines.join('\n') });
}

export async function shareCrew(c: { name: string; emoji: string; code: string }) {
  await Share.share({ message: `${c.emoji} Join my crew "${c.name}" on Playmate!\nCode: ${c.code}\n👉 ${shareLink(`/crews?code=${c.code}`)}` });
}

export async function checkIn(requestId: string) {
  const pos = await getCoords();
  if (!pos) return Alert.alert('Location needed', 'Allow location access so we can check you in at the spot.');
  const { error } = await supabase.rpc('check_in', { p_request: requestId, p_lat: pos.lat, p_lng: pos.lng });
  if (error) Alert.alert("Couldn't check in", error.message);
  else Alert.alert('Checked in ✅', 'Nice, you showed up. That counts towards your show-up score.');
}

// Weekly stats from my_week() (the home screen uses the streak).
export type Week = { plans: number; hosted: number; new_activity: boolean; moments: number; streak: number };
