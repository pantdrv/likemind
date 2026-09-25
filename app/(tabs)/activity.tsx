import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Empty, ErrorState, Tag } from '../../components/ui';
import { friendlyError, safe } from '../../lib/errors';
import { c, font, border, shadow, pressedOffset, fmtDate, planTitle, tileColor } from '../../lib/theme';

export default function Activity() {
  const router = useRouter();
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await safe(supabase.rpc('my_requests'));
    setError(error ? friendlyError(error) : null);
    if (!error) setItems(data ?? []);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!items) return error ? <ErrorState message={error} onRetry={load} /> : <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />;
  // Recap: plans that ended in the last week, had other people, and still need photos or kudos from me.
  const recaps = items.filter((r) => r.ended && r.status !== 'cancelled' && r.slots_filled > 0
    && Date.now() - new Date(r.starts_at).getTime() < 7 * 86400_000 && (!r.kudos_given || r.album_count === 0));
  return (
    <FlatList data={items} keyExtractor={(i) => i.id} contentContainerStyle={{ padding: 16 }}
      ListHeaderComponent={recaps.length ? (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontFamily: font.black, fontSize: 19, color: c.ink, marginBottom: 10 }}>✨ Recap time</Text>
          {recaps.map((r) => (
            <Pressable key={r.id} onPress={() => router.push(`/request/${r.id}`)}
              style={({ pressed }) => [{ backgroundColor: c.lime, borderRadius: 22, padding: 16, marginBottom: 12, ...border }, pressed ? pressedOffset(3) : shadow(4)]}>
              <Text style={{ fontFamily: font.black, fontSize: 16, color: c.ink }}>How was {r.activity_icon} {planTitle(r)}?</Text>
              <Text style={{ fontFamily: font.semi, color: c.ink, marginTop: 4 }}>
                {[r.album_count === 0 && '📸 drop photos in the album', !r.kudos_given && '🙌 give the squad kudos'].filter(Boolean).join(' · ')}
              </Text>
              <Text style={{ fontFamily: font.bold, color: c.primary, marginTop: 6 }}>🔁 or run it back →</Text>
            </Pressable>
          ))}
          <Text style={{ fontFamily: font.black, fontSize: 19, color: c.ink, marginTop: 8, marginBottom: 10 }}>All plans</Text>
        </View>
      ) : null}
      ListEmptyComponent={<Empty emoji="📭" text="No plans yet. Head to Explore to join one or start your own." />}
      renderItem={({ item, index }) => {
        const cancelled = item.status === 'cancelled';
        return (
          <Pressable onPress={() => router.push(`/request/${item.id}`)}
            style={({ pressed }) => [{ backgroundColor: c.card, borderRadius: 22, padding: 16, marginBottom: 16, ...border, opacity: cancelled ? 0.6 : 1 }, pressed ? pressedOffset(3) : shadow(4)]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: tileColor(index), alignItems: 'center', justifyContent: 'center', ...border }}>
                <Text style={{ fontSize: 22 }}>{item.activity_icon}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 17, fontFamily: font.black, color: c.ink }} numberOfLines={1}>{planTitle(item)}</Text>
                <Text style={{ color: c.muted, fontFamily: font.medium, marginTop: 2 }}>{fmtDate(item.starts_at)}</Text>
              </View>
              <Tag label={item.role === 'host' ? 'hosting 👑' : 'joined ✅'} color={item.role === 'host' ? c.accent : c.mint} />
            </View>
            {item.crew_name ? <Text style={{ color: c.ink, fontFamily: font.bold, marginTop: 8 }}>👯 {item.crew_name}</Text> : null}
            <Text style={{ color: c.muted, fontFamily: font.medium, marginTop: 10 }}>📍 {item.venue_name}</Text>
            <Text style={{ color: cancelled ? c.danger : c.primary, fontFamily: font.bold, marginTop: 4 }}>
              {cancelled ? 'Cancelled 💔' : `${item.slots_filled}/${item.slots_total} joined`}
            </Text>
          </Pressable>
        );
      }} />
  );
}
