import type { ViewStyle } from 'react-native';

// Neo-brutalist look: cream background, thick ink outlines, hard offset shadows, loud colour blocks.
export const c = {
  bg: '#FFF4E4', card: '#FFFFFF', ink: '#121212', muted: '#5F5A54', line: '#121212',
  primary: '#7C3AED', primarySoft: '#E9DDFF', accent: '#FFD23F', danger: '#FF3B30',
  lime: '#C8F560', pink: '#FF6FB1', blue: '#6EB5FF', orange: '#FF9F45', lilac: '#C9B5FF', mint: '#7DF0C8',
};

export const font = {
  regular: 'BricolageGrotesque_400Regular',
  medium: 'BricolageGrotesque_500Medium',
  semi: 'BricolageGrotesque_600SemiBold',
  bold: 'BricolageGrotesque_700Bold',
  black: 'BricolageGrotesque_800ExtraBold',
};

export const border = { borderWidth: 2, borderColor: c.ink };
export const shadow = (px = 4): ViewStyle => ({ boxShadow: `${px}px ${px}px 0px ${c.ink}` });
// Pressed state: the element slides into its shadow.
export const pressedOffset = (px = 4): ViewStyle => ({ transform: [{ translateX: px }, { translateY: px }] });

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
