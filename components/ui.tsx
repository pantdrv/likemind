import { ReactNode, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, TextInputProps, TextProps, View, ViewStyle, StyleSheet, StyleProp } from 'react-native';
import { c, font, border, shadow, pressedOffset } from '../lib/theme';

export function Button({ title, onPress, loading, disabled, variant = 'primary', small }:
  { title: string; onPress: () => void; loading?: boolean; disabled?: boolean; variant?: 'primary' | 'outline' | 'danger' | 'pop'; small?: boolean }) {
  const bg = { primary: c.primary, danger: c.danger, pop: c.accent, outline: c.card }[variant];
  const color = variant === 'primary' || variant === 'danger' ? '#fff' : c.ink;
  const off = small ? 2 : 4;
  return (
    <Pressable onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : 1, paddingVertical: small ? 7 : 15 },
        pressed ? pressedOffset(off) : shadow(off)]}>
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
      <TextInput placeholderTextColor="#9A948C" {...rest}
        onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }} onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
        style={[s.input, focused && { ...shadow(3), borderColor: c.primary }, style]} />
    </View>
  );
}

export function Chip({ label, active, onPress, color = c.lime }: { label: string; active?: boolean; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && { backgroundColor: color, ...shadow(2) }]}>
      <Text style={{ color: c.ink, fontFamily: active ? font.bold : font.medium, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, color = c.card, style }: { children: ReactNode; color?: string; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, { backgroundColor: color }, style]}>{children}</View>;
}

export const H1 = ({ style, ...p }: TextProps) => <Text {...p} style={[{ fontFamily: font.black, fontSize: 34, lineHeight: 38, color: c.ink, letterSpacing: -0.8 }, style]} />;
export const H2 = ({ style, ...p }: TextProps) => <Text {...p} style={[{ fontFamily: font.black, fontSize: 19, color: c.ink, marginTop: 28, marginBottom: 10 }, style]} />;
export const Label = ({ style, ...p }: TextProps) => <Text {...p} style={[{ fontFamily: font.bold, fontSize: 13, color: c.ink, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }, style]} />;
export const Body = ({ style, ...p }: TextProps) => <Text {...p} style={[{ fontFamily: font.regular, fontSize: 15, color: c.ink, lineHeight: 21 }, style]} />;
export const Muted = ({ style, ...p }: TextProps) => <Text {...p} style={[{ fontFamily: font.medium, fontSize: 14, color: c.muted, lineHeight: 20 }, style]} />;

export const Empty = ({ text, emoji = '👀' }: { text: string; emoji?: string }) => (
  <View style={{ alignItems: 'center', marginTop: 48, paddingHorizontal: 28 }}>
    <Text style={{ fontSize: 52 }}>{emoji}</Text>
    <Muted style={{ textAlign: 'center', marginTop: 10, fontSize: 15, lineHeight: 22 }}>{text}</Muted>
  </View>
);

export const Tag = ({ label, color = c.accent }: { label: string; color?: string }) => (
  <View style={[s.tag, { backgroundColor: color }]}><Text style={{ fontFamily: font.bold, fontSize: 12, color: c.ink }}>{label}</Text></View>
);

const s = StyleSheet.create({
  btn: { borderRadius: 16, alignItems: 'center', paddingHorizontal: 18, ...border },
  input: { backgroundColor: c.card, ...border, borderRadius: 16, padding: 14, fontSize: 16, color: c.ink, fontFamily: font.medium },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, ...border, backgroundColor: c.card, marginRight: 8, marginBottom: 10 },
  card: { borderRadius: 22, padding: 16, ...border, ...shadow(4) },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, ...border, alignSelf: 'flex-start' },
});
