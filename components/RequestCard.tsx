import { Pressable, Text, View } from 'react-native';
import { c, font, border, pressedOffset, planTitle, whenLabel, neonOf, spotsLabel } from '../lib/theme';
import { Button, Tag } from './ui';
import Avatar from './Avatar';
import { planCopy } from '../lib/planCopy';

// Plan card: time · distance, spots left, title, host avatar + how many going, and "Ask to join" (or its status).
// `color` is the category's tinted surface; its neon version colours the time line.
export default function RequestCard({ item, onPress, onAccept, busy, color = c.lime }: any) {
  const going = item.slots_filled;
  // Trips show where to meet instead of how far away the meeting point is.
  const showKm = planCopy(item.activity_slug, item.category_slug).showKm;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s().card, pressed && pressedOffset()]}>
      <View style={[s().row, { justifyContent: 'space-between' }]}>
        <Text style={[s().when, { color: neonOf(color) }]} numberOfLines={1}>
          {whenLabel(item.starts_at)}{showKm ? ` · ${Number(item.distance_km)} km` : ''}
        </Text>
        <Text style={s().spots}>{spotsLabel(item)}</Text>
      </View>
      <Text style={s().title} numberOfLines={2}>{item.activity_icon} {planTitle(item)}</Text>
      <Text style={s().meta} numberOfLines={1}>{showKm ? '📍' : '🚩 meet at'} {item.venue_name}</Text>
      {(item.featured_label || item.women_only || item.crew_name) ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {item.featured_label ? <Tag label={item.featured_label} color={c.pink} /> : null}
          {item.women_only ? <Tag label="👩 women only" color={c.pink} /> : null}
          {item.crew_name ? <Tag label={`👯 ${item.crew_name}`} color={c.lilac} /> : null}
        </View>
      ) : null}
      <View style={[s().row, { marginTop: 14, justifyContent: 'space-between' }]}>
        <View style={[s().row, { flex: 1, marginRight: 10 }]}>
          <Avatar url={item.host_avatar} name={item.host_name} size={30} color={color} />
          {going > 0 && <View style={s().more}><Text style={s().moreTxt}>+{going}</Text></View>}
          <Text style={[s().meta, { marginTop: 0, marginLeft: 8, flex: 1 }]} numberOfLines={1}>
            {item.host_name}
          </Text>
        </View>
        {item.is_host ? <Tag label="your plan 👑" color={c.raised} />
          : item.has_joined ? <Tag label="you're in ✅" color={c.mint} />
          : item.my_request === 'pending' ? <Tag label="requested ⏳" color={c.accent} />
          : item.my_request === 'declined' ? null
          : onAccept ? <Button small title="Ask to join" loading={busy} onPress={onAccept} /> : null}
      </View>
    </Pressable>
  );
}

// Built when drawn (not at load) so it follows the Day/Night switch.
const s = () => ({
  card: { backgroundColor: c.card, borderRadius: 20, padding: 16, marginBottom: 12, ...border },
  row: { flexDirection: 'row', alignItems: 'center' },
  when: { fontFamily: font.black, fontSize: 12, flexShrink: 1 },
  spots: { fontFamily: font.semi, fontSize: 12, color: c.muted, marginLeft: 8 },
  title: { fontSize: 18, fontFamily: font.black, color: c.ink, lineHeight: 23, marginTop: 8 },
  meta: { color: c.muted, marginTop: 4, fontFamily: font.medium, fontSize: 13 },
  more: { width: 30, height: 30, borderRadius: 15, backgroundColor: c.raised, marginLeft: -8, alignItems: 'center', justifyContent: 'center', ...border },
  moreTxt: { fontFamily: font.black, fontSize: 11, color: c.ink },
} as const);
