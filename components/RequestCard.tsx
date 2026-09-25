import { Pressable, Text, View, StyleSheet } from 'react-native';
import { c, font, border, shadow, pressedOffset, fmtDate, planTitle } from '../lib/theme';
import { Button, Tag } from './ui';

export default function RequestCard({ item, onPress, onAccept, busy, color = c.lime }: any) {
  const left = item.slots_total - item.slots_filled;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed ? pressedOffset(3) : shadow(4)]}>
      <View style={s.row}>
        <View style={[s.icon, { backgroundColor: color }]}><Text style={{ fontSize: 24 }}>{item.activity_icon}</Text></View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.title} numberOfLines={2}>{planTitle(item)}</Text>
          <Text style={s.meta}>{fmtDate(item.starts_at)}</Text>
        </View>
        <View style={s.dist}><Text style={{ fontFamily: font.black, fontSize: 13, color: c.ink }}>~{Number(item.distance_km)} km</Text></View>
      </View>
      <Text style={[s.meta, { marginTop: 10 }]}>📍 {item.venue_name}</Text>
      {(item.featured_label || item.women_only || item.crew_name) ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {item.featured_label ? <Tag label={item.featured_label} color={c.pink} /> : null}
          {item.women_only ? <Tag label="👩 women only" color={c.pink} /> : null}
          {item.crew_name ? <Tag label={`👯 ${item.crew_name}`} color={c.lilac} /> : null}
        </View>
      ) : null}
      <Text style={s.meta}>🙋 {item.host_name}{item.host_verified ? ' ☑️' : ''}{Number(item.host_rating) > 0 ? `  ★ ${Number(item.host_rating).toFixed(1)}` : ''}  ·  {item.skill_level} vibe</Text>
      <View style={[s.row, { marginTop: 14, justifyContent: 'space-between' }]}>
        <Text style={{ fontFamily: font.black, fontSize: 15, color: c.primary }}>{left} {left === 1 ? 'spot' : 'spots'} left</Text>
        {item.is_host ? <Tag label="your plan 👑" color={c.accent} />
          : item.has_joined ? <Tag label="you're in ✅" color={c.mint} />
          : <Button small title="I'm in 🙌" loading={busy} onPress={onAccept} />}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: c.card, borderRadius: 22, padding: 16, marginBottom: 16, ...border },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', ...border },
  title: { fontSize: 18, fontFamily: font.black, color: c.ink, lineHeight: 22 },
  dist: { backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginLeft: 8, ...border, transform: [{ rotate: '4deg' }] },
  meta: { color: c.muted, marginTop: 3, fontFamily: font.medium, fontSize: 14 },
});
