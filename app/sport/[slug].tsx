import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, ScrollView, View, Text } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { getCoords, Coords } from '../../lib/location';
import { useAuth } from '../../lib/auth';
import { syncAlertArea } from '../../lib/alerts';
import RequestCard from '../../components/RequestCard';
import { Button, Chip, Empty } from '../../components/ui';
import { c, font, border, catStyle } from '../../lib/theme';

const RADII = [5, 10, 25, 50];

export default function SportScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const [act, setAct] = useState<{ name: string; icon: string; categories: { slug: string } | null } | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [denied, setDenied] = useState(false);
  const [radius, setRadius] = useState(10);
  const [items, setItems] = useState<any[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    supabase.from('activities').select('name, icon, categories(slug)').eq('slug', slug).maybeSingle().then(({ data }) => setAct(data as any));
  }, [slug]);
  const color = catStyle(act?.categories?.slug).color;

  const load = useCallback(async (r = radius) => {
    let pos = coords;
    if (!pos) { pos = await getCoords(); setCoords(pos); }
    if (!pos) { setDenied(true); setItems([]); return; }
    setDenied(false);
    if (session) syncAlertArea(session.user.id, pos);
    const { data, error } = await supabase.rpc('nearby_requests', { p_lat: pos.lat, p_lng: pos.lng, p_radius_km: r, p_slug: slug });
    if (error) Alert.alert('Could not load plans', error.message);
    setItems(data ?? []);
  }, [coords, radius, slug, session]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const accept = async (id: string) => {
    setBusyId(id);
    const { error } = await supabase.rpc('join_request', { p_request: id });
    setBusyId(null);
    if (error) Alert.alert('Could not join', error.message);
    else Alert.alert("You're in! 🎉", 'Open the plan to see the exact spot and chat with the squad.', [{ text: 'Later' }, { text: 'Open', onPress: () => router.push(`/request/${id}`) }]);
    load();
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: act ? `${act.icon} ${act.name}` : 'Nearby', headerStyle: { backgroundColor: color } }} />
      <View style={{ backgroundColor: color, borderBottomWidth: 2, borderColor: c.ink, paddingBottom: 6 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, alignItems: 'center' }}>
          <Text style={{ fontFamily: font.bold, color: c.ink, marginRight: 10, marginBottom: 10 }}>within</Text>
          {RADII.map((r) => <Chip key={r} label={`${r} km`} color={c.accent} active={r === radius} onPress={() => { setRadius(r); load(r); }} />)}
        </ScrollView>
      </View>
      {!items ? <ActivityIndicator style={{ marginTop: 40 }} color={c.primary} /> : (
        <FlatList
          data={items} keyExtractor={(i) => i.id} contentContainerStyle={{ padding: 16, paddingTop: 20, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListHeaderComponent={items.length ? <Text style={{ fontFamily: font.black, fontSize: 15, color: c.muted, marginBottom: 12 }}>{items.length} {items.length === 1 ? 'plan' : 'plans'} near you 🔥</Text> : null}
          ListEmptyComponent={denied
            ? <Empty emoji="📍" text="Location is off. Allow location access in Settings to see plans near you." />
            : <Empty emoji="🦗" text={"It's quiet around here… for now.\nBe the main character and start a plan."} />}
          renderItem={({ item }) => (
            <RequestCard item={item} color={color} busy={busyId === item.id} onPress={() => router.push(`/request/${item.id}`)} onAccept={() => accept(item.id)} />
          )}
        />
      )}
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 28 }}>
        <Button variant="pop" title="＋ Start a plan" onPress={() => router.push({ pathname: '/request/new', params: { slug } })} />
      </View>
    </View>
  );
}
