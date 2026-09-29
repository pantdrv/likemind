import type { ViewStyle } from 'react-native';

// Two looks with the same colour names; `c` always holds the active one (lib/themeMode.tsx switches it).
// Night: near-black, dark cards, neon lime. Day: warm cream, white cards, terracotta, dark brown text.
// The tokens lime, pink, … are tinted *surfaces* (dark in Night, pastel in Day) that body text reads on;
// neonOf() gives their strong version for active chips, highlights and small text, always with `onNeon` text on top.
type Palette = {
  scheme: 'dark' | 'light';
  bg: string; card: string; raised: string; ink: string; muted: string; line: string;
  primary: string; primarySoft: string; accent: string; danger: string; onNeon: string;
  lime: string; pink: string; blue: string; orange: string; lilac: string; mint: string;
};
type Surface = 'lime' | 'pink' | 'blue' | 'orange' | 'lilac' | 'mint' | 'accent' | 'primarySoft';

const NIGHT: Palette = {
  scheme: 'dark',
  bg: '#0E0E10', card: '#18181B', raised: '#222226', ink: '#F4F4F0', muted: '#9C9CA4', line: '#2C2C31',
  primary: '#C8F560', primarySoft: '#2A3A12', accent: '#2A2A1A', danger: '#FF5A4F', onNeon: '#0E0E10',
  lime: '#1C2A10', pink: '#2E1526', blue: '#10202F', orange: '#2F1E10', lilac: '#201A36', mint: '#0F2A22',
};
const DAY: Palette = {
  scheme: 'light',
  bg: '#FBEFE9', card: '#FFFFFF', raised: '#F4E4DC', ink: '#2A1B17', muted: '#8A7069', line: '#EEDDD4',
  primary: '#D9634A', primarySoft: '#F7D9CF', accent: '#FBEBC4', danger: '#C9362B', onNeon: '#FFFFFF',
  lime: '#E4F2D9', pink: '#FBE0E8', blue: '#DDEBFA', orange: '#FDE3CF', lilac: '#ECE3FA', mint: '#D6F0E6',
};
const NEON: Record<'night' | 'day', Record<Surface, string>> = {
  night: { lime: '#C8F560', pink: '#FF7AC3', blue: '#7CC4FF', orange: '#FFAA5C', lilac: '#B8A2FF', mint: '#6EF0C4', accent: '#FFD84D', primarySoft: '#C8F560' },
  day: { lime: '#4E8A3A', pink: '#C2477D', blue: '#3A72B8', orange: '#D9634A', lilac: '#7456BF', mint: '#2A8F70', accent: '#B07D12', primarySoft: '#D9634A' },
};
const SURFACES = Object.keys(NEON.night) as Surface[];

export type ThemeMode = 'night' | 'day';
export let themeMode: ThemeMode = 'night';
export const c: Palette = { ...NIGHT };
export function applyTheme(m: ThemeMode) {
  themeMode = m;
  Object.assign(c, m === 'day' ? DAY : NIGHT);
}

// Strong version of a tinted surface (e.g. c.lime -> lime green), for active chips and highlights.
export const neonOf = (surface?: string) => {
  const name = SURFACES.find((k) => c[k] === surface);
  return name ? NEON[themeMode][name] : c.primary;
};

export const font = {
  regular: 'BricolageGrotesque_400Regular',
  medium: 'BricolageGrotesque_500Medium',
  semi: 'BricolageGrotesque_600SemiBold',
  bold: 'BricolageGrotesque_700Bold',
  black: 'BricolageGrotesque_800ExtraBold',
};

// Getter, so `...border` picks up the current theme's line colour.
export const border = { borderWidth: 1, get borderColor() { return c.line; } };
// Flat design: no hard shadows. Kept as functions so existing call sites need no changes.
export const shadow = (_px = 4): ViewStyle => ({});
// Pressed state: a slight shrink.
export const pressedOffset = (_px = 4): ViewStyle => ({ transform: [{ scale: 0.98 }], opacity: 0.9 });

// Per-category colour and copy. Unknown categories (e.g. added later in the database) fall back to `default`.
const CATS: Record<string, { surface: Surface; emoji: string; tagline: string }> = {
  outdoor: { surface: 'lime', emoji: '⚽', tagline: 'grab a squad, hit the court' },   // shown as "Sports"
  entertainment: { surface: 'pink', emoji: '🎬', tagline: 'gigs, movies and retail therapy, better together' },
  indoor: { surface: 'lilac', emoji: '🎲', tagline: 'board games, pool, PS5: pick your battle' },
  food: { surface: 'orange', emoji: '🍜', tagline: 'good food tastes better with company' },
  fitness: { surface: 'mint', emoji: '💪', tagline: 'show up more when someone is waiting' },
  study: { surface: 'blue', emoji: '📚', tagline: 'focus together, then grab a chai' },
  explore: { surface: 'accent', emoji: '🏕', tagline: 'weekend plans that end up in the group chat forever' },
  default: { surface: 'accent', emoji: '✨', tagline: 'find your people nearby' },
};
export const catStyle = (slug?: string) => {
  const cat = CATS[slug ?? ''] ?? CATS.default;
  return { color: c[cat.surface], emoji: cat.emoji, tagline: cat.tagline };
};

const TILE_COLORS: Surface[] = ['lime', 'accent', 'pink', 'blue', 'orange', 'lilac', 'mint'];
export const tileColor = (i: number) => c[TILE_COLORS[i % TILE_COLORS.length]];

// "3 spots left" for plans with a limit; "4 going" for open plans ("open to anyone" before anyone joins).
export function spotsLabel(r: { slots_total: number; slots_filled: number; open_ended?: boolean }) {
  if (r.open_ended) return r.slots_filled > 0 ? `${r.slots_filled} going` : 'open to anyone';
  const left = r.slots_total - r.slots_filled;
  return `${left} ${left === 1 ? 'spot' : 'spots'} left`;
}

export const planTitle =(item: { title?: string | null; activity_name?: string }) => item.title || `${item.activity_name} squad`;

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// "7:30 PM", "Sat 6:30 AM" or "12 Oct, 7:30 PM", like the plan cards in the design.
export function whenLabel(iso: string) {
  const d = new Date(iso), now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400_000);
  if (days === 0) return time;
  if (days === 1) return `Tmrw ${time}`;
  if (days > 1 && days < 7) return `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}

// Tonight = before 4am tomorrow; Weekend = the coming Sat/Sun (or today if it's the weekend).
export function inWindow(iso: string, win: 'tonight' | 'weekend' | 'all') {
  if (win === 'all') return true;
  const d = new Date(iso), now = new Date();
  if (win === 'tonight') {
    const end = new Date(now); end.setDate(end.getDate() + 1); end.setHours(4, 0, 0, 0);
    return d <= end;
  }
  const sat = new Date(now); sat.setHours(0, 0, 0, 0);
  sat.setDate(sat.getDate() + (now.getDay() === 0 ? -1 : 6 - now.getDay())); // Sunday belongs to the weekend that started yesterday
  const mon = new Date(sat); mon.setDate(mon.getDate() + 2);
  return d >= sat && d < mon;
}
