import { ReactNode, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, TextInputProps, TextProps, View, ViewStyle, StyleSheet, StyleProp } from 'react-native';
import { c, font, border, pressedOffset, neonOf } from '../lib/theme';

export function Button({ title, onPress, loading, disabled, variant = 'primary', small }:
  { title: string; onPress: () => void; loading?: boolean; disabled?: boolean; variant?: 'primary' | 'outline' | 'danger' | 'pop'; small?: boolean }) {
  // primary = light pill (like "I'm in"), pop = neon lime (the main call to action), outline = dark with a hairline.
  const bg = { primary: c.ink, danger: c.danger, pop: c.primary, outline: c.card }[variant];
  const color = variant === 'outline' ? c.ink : variant === 'danger' ? '#fff' : c.onNeon;
  return (
    <Pressable onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.45 : 1, paddingVertical: small ? 8 : 15 },
        variant === 'outline' ? border : { borderWidth: 1, borderColor: bg }, pressed && pressedOffset()]}>
      {loading ? <ActivityIndicator color={color} /> : <Text style={{ color, fontFamily: font.black, fontSize: small ? 14 : 17 }}>{title}</Text>}
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 16 }}>
      {label ? <Label>{label}</Label> : null}
      <TextInput placeholderTextColor={c.muted} selectionColor={c.primary} keyboardAppearance="dark" {...rest}
        onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }} onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
        style={[s.input, focused && { borderColor: c.primary }, style]} />
    </View>
  );
}

// `color` is a tinted surface token (c.lime, c.pink…); the active chip lights up in its neon version.
export function Chip({ label, active, onPress, color = c.lime }: { label: string; active?: boolean; onPress: () => void; color?: string }) {
  const lit = neonOf(color);
  return (
    <Pressable onPress={onPress} style={[s.chip, active && { backgroundColor: lit, borderColor: lit }]}>
      <Text style={{ color: active ? c.onNeon : c.ink, fontFamily: active ? font.bold : font.medium, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, color = c.card, style }: { children: ReactNode; color?: string; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, { backgroundColor: color }, style]}>{children}</View>;
}

export const H1 = ({ style, ...p }: TextProps) => <Text {...p} style={[{ fontFamily: font.black, fontSize: 34, lineHeight: 38, color: c.ink, letterSpacing: -0.8 }, style]} />;
export const H2 = ({ style, ...p }: TextProps) => <Text {...p} style={[{ fontFamily: font.black, fontSize: 19, color: c.ink, marginTop: 28, marginBottom: 10 }, style]} />;
export const Label = ({ style, ...p }: TextProps) => <Text {...p} style={[{ fontFamily: font.bold, fontSize: 12, color: c.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }, style]} />;
// Small all-caps line above a heading, e.g. "BENGALURU · FRI".
export const Kicker = ({ style, ...p }: TextProps) => <Text {...p} style={[{ fontFamily: font.bold, fontSize: 11, color: c.muted, textTransform: 'uppercase', letterSpacing: 1.4 }, style]} />;
export const Body = ({ style, ...p }: TextProps) => <Text {...p} style={[{ fontFamily: font.regular, fontSize: 15, color: c.ink, lineHeight: 21 }, style]} />;
export const Muted = ({ style, ...p }: TextProps) => <Text {...p} style={[{ fontFamily: font.medium, fontSize: 14, color: c.muted, lineHeight: 20 }, style]} />;

export const Empty = ({ text, emoji = '👀' }: { text: string; emoji?: string }) => (
  <View style={{ alignItems: 'center', marginTop: 48, paddingHorizontal: 28 }}>
    <Text style={{ fontSize: 52 }}>{emoji}</Text>
    <Muted style={{ textAlign: 'center', marginTop: 10, fontSize: 15, lineHeight: 22 }}>{text}</Muted>
  </View>
);

// Shown when a screen couldn't load. `message` should come from friendlyError().
export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <View style={{ alignItems: 'center', marginTop: 48, paddingHorizontal: 28 }}>
    <Text style={{ fontSize: 52 }}>😵‍💫</Text>
    <Text style={{ fontFamily: font.black, fontSize: 18, color: c.ink, marginTop: 10 }}>Couldn't load this</Text>
    <Muted style={{ textAlign: 'center', marginTop: 6, fontSize: 15, lineHeight: 22 }}>{message}</Muted>
    {onRetry && <View style={{ marginTop: 18, alignSelf: 'stretch' }}><Button variant="outline" title="↻ Try again" onPress={onRetry} /></View>}
  </View>
);

export const Tag =({ label, color = c.accent }: { label: string; color?: string }) => (
  <View style={[s.tag, { backgroundColor: color }]}><Text style={{ fontFamily: font.bold, fontSize: 12, color: c.ink }}>{label}</Text></View>
);

const s = StyleSheet.create({
  btn: { borderRadius: 999, alignItems: 'center', paddingHorizontal: 18 },
  input: { backgroundColor: c.card, ...border, borderRadius: 14, padding: 14, fontSize: 16, color: c.ink, fontFamily: font.medium },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, ...border, backgroundColor: c.card, marginRight: 8, marginBottom: 10 },
  card: { borderRadius: 20, padding: 16, ...border },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, ...border, alignSelf: 'flex-start' },
});
