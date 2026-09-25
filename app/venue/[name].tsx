import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { photoUrl } from '../../lib/photos';
import { Button, Card, Empty, H1, H2, Muted, Tag } from '../../components/ui';
import PhotoViewer, { photoTile } from '../../components/PhotoViewer';
import { c, font, border, shadow, fmtDate, planTitle, tileColor } from '../../lib/theme';

// A venue (grouped by name): how busy it is, what people do there, open plans and photos from past plans.
export default function Venue() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const [v, setV] = useState<any | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('venue_info', { p_name: decodeURIComponent(name) });
    setV(data);
  }, [name]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!v) return <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />;
  if (!v.plans_total) return <Empty emoji="📍" text="No plans at this spot yet." />;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Stack.Screen options={{ title: 'Spot' }} />
      <Card color={c.orange} style={{ padding: 20 }}>
        <Text style={{ fontSize: 40 }}>📍</Text>
        <H1 style={{ fontSize: 28, marginTop: 6 }}>{v.name}</H1>
        <Text style={{ fontFamily: font.bold, color: c.ink, marginTop: 6 }}>{v.plans_30d} plans this month · {v.plans_total} all time</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {v.activities.map((a: any) => <Tag key={a.name} label={`${a.icon} ${a.name} ×${a.count}`} color={c.card} />)}
        </View>
      </Card>
      <View style={{ marginTop: 14 }}>
        <Button variant="outline" title="🔎 Find it in Google Maps" onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.name)}`)} />
      </View>

      <H2>Open plans here</H2>
      {v.upcoming.length === 0 ? <Muted>Nothing open right now. Start one from Explore.</Muted> : v.upcoming.map((p: any, i: number) => (
        <Pressable key={p.id} onPress={() => router.push(`/request/${p.id}`)}
          style={{ backgroundColor: tileColor(i), borderRadius: 18, padding: 14, marginBottom: 10, ...border, ...shadow(3) }}>
          <Text style={{ fontFamily: font.black, color: c.ink, fontSize: 16 }}>{p.activity_icon} {planTitle(p)}</Text>
          <Text style={{ fontFamily: font.semi, color: c.ink }}>{fmtDate(p.starts_at)} · {p.slots_total - p.slots_filled} spots left</Text>
        </Pressable>
      ))}

      <H2>From past plans 📸</H2>
      {v.photos.length === 0 ? <Muted>No photos yet.</Muted> : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {v.photos.map((p: any) => (
            <Pressable key={p.id} onPress={() => setViewing(p)} style={[photoTile, { width: '31.5%', aspectRatio: 1 }]}>
              <Image source={{ uri: photoUrl(p.path) }} style={{ flex: 1 }} />
            </Pressable>
          ))}
        </View>
      )}
      <PhotoViewer uri={viewing ? photoUrl(viewing.path) : null} caption={viewing?.caption} onClose={() => setViewing(null)} />
    </ScrollView>
  );
}
