import type { ViewStyle } from 'react-native';

// "Night" look: near-black background, dark cards with hairline borders, neon lime for actions and highlights.
// The colour tokens (lime, pink, …) are dark tinted surfaces so light text reads on them; `neon` holds the bright
// versions for buttons, active chips and small highlights, always with `onNeon` (dark) text.
export const c = {
  bg: '#0E0E10', card: '#18181B', raised: '#222226', ink: '#F4F4F0', muted: '#9C9CA4', line: '#2C2C31',
  primary: '#C8F560', primarySoft: '#2A3A12', accent: '#2A2A1A', danger: '#FF5A4F', onNeon: '#0E0E10',
  lime: '#1C2A10', pink: '#2E1526', blue: '#10202F', orange: '#2F1E10', lilac: '#201A36', mint: '#0F2A22',
};

// Bright counterpart of each tinted surface.
export const neon: Record<string, string> = {
  [c.lime]: '#C8F560', [c.pink]: '#FF7AC3', [c.blue]: '#7CC4FF', [c.orange]: '#FFAA5C',
  [c.lilac]: '#B8A2FF', [c.mint]: '#6EF0C4', [c.accent]: '#FFD84D', [c.primarySoft]: '#C8F560',
};
export const neonOf = (surface?: string) => (surface && neon[surface]) || c.primary;

export const font = {
  regular: 'BricolageGrotesque_400Regular',
  medium: 'BricolageGrotesque_500Medium',
  semi: 'BricolageGrotesque_600SemiBold',
  bold: 'BricolageGrotesque_700Bold',
  black: 'BricolageGrotesque_800ExtraBold',
};

export const border = { borderWidth: 1, borderColor: c.line };
// Flat design: no hard shadows. Kept as functions so existing call sites need no changes.
export const shadow = (_px = 4): ViewStyle => ({});
// Pressed state: a slight shrink.
export const pressedOffset = (_px = 4): ViewStyle => ({ transform: [{ scale: 0.98 }], opacity: 0.9 });

// Per-category colour and copy. Unknown categories (e.g. added later in the database) fall back to `default`.
const CATS: Record<string, { color: string; emoji: string; tagline: string }> = {
  outdoor: { color: c.lime, emoji: '🌳', tagline: 'touch grass, but make it a squad' },
  entertainment: { color: c.pink, emoji: '🎬', tagline: 'gigs, movies and retail therapy, better together' },
  indoor: { color: c.lilac, emoji: '🎲', tagline: 'board games, pool, PS5: pick your battle' },
  default: { color: c.accent, emoji: '✨', tagline: 'find your people nearby' },
};
export const catStyle = (slug?: string) => CATS[slug ?? ''] ?? CATS.default;

const TILE_COLORS = [c.lime, c.accent, c.pink, c.blue, c.orange, c.lilac, c.mint];
export const tileColor = (i: number) => TILE_COLORS[i % TILE_COLORS.length];

export const planTitle = (item: { title?: string | null; activity_name?: string }) => item.title || `${item.activity_name} squad`;

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
