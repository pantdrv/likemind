import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAlerts } from '../../lib/alerts';
import { Button, Empty, ErrorState } from '../../components/ui';
import { c, font, border, shadow, pressedOffset, fmtDate } from '../../lib/theme';

export default function Alerts() {
  const router = useRouter();
  const { items, error, unread, reload, markRead, markAllRead } = useAlerts();
  const [refreshing, setRefreshing] = useState(false);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  if (!items) return <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />;
  if (error && items.length === 0) return <ErrorState message={error} onRetry={reload} />;
  return (
    <FlatList data={items} keyExtractor={(i) => String(i.id)} contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} />}
      ListHeaderComponent={unread > 0 ? <View style={{ alignItems: 'flex-end', marginBottom: 14 }}><Button small variant="outline" title="Mark all as read" onPress={markAllRead} /></View> : null}
      ListEmptyComponent={<Empty emoji="🔕" text="All quiet. When someone nearby starts a plan for something you're into, it lands here. Pick your interests in Me." />}
      renderItem={({ item }) => (
        <Pressable onPress={() => { markRead(item.id); if (item.request_id) router.push(`/request/${item.request_id}`); }}
          style={({ pressed }) => [{ backgroundColor: item.read_at ? c.card : c.accent, borderRadius: 22, padding: 16, marginBottom: 14, ...border },
            pressed ? pressedOffset(3) : shadow(item.read_at ? 2 : 4)]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {!item.read_at && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.pink, borderWidth: 1.5, borderColor: c.ink, marginRight: 8 }} />}
            <Text style={{ flex: 1, fontSize: 16, fontFamily: font.black, color: c.ink }}>{item.title}</Text>
          </View>
          <Text style={{ color: c.ink, fontFamily: font.medium, marginTop: 4 }}>{item.body}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <Text style={{ color: c.ink, opacity: 0.6, fontFamily: font.semi, fontSize: 12 }}>{fmtDate(item.created_at)}</Text>
            {item.actor_id && (
              <Pressable hitSlop={8} onPress={() => { markRead(item.id); router.push(`/user/${item.actor_id}`); }}
                style={{ backgroundColor: c.card, borderRadius: 999, borderWidth: 1.5, borderColor: c.ink, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontFamily: font.bold, fontSize: 12, color: c.ink }}>👤 view profile</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      )} />
  );
}
