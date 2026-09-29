import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, View, Text } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { getCoords, Coords } from '../../lib/location';
import { useAuth } from '../../lib/auth';
import { syncAlertArea } from '../../lib/alerts';
import RequestCard from '../../components/RequestCard';
import { Button, Chip, Empty, ErrorState } from '../../components/ui';
import { c, font, border, catStyle, planTitle } from '../../lib/theme';
import { useCelebrate } from '../../components/Celebrate';
import { planCopy } from '../../lib/planCopy';
import { askToJoin } from '../../lib/engage';
import { friendlyError, safe, showError } from '../../lib/errors';
import { useLive } from '../../lib/live';

const RADII = [5, 10, 25, 50];

export default function SportScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const [act, setAct] = useState<{ name: string; icon: string; categories: { slug: string } | null } | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [denied, setDenied] = useState(false);
  const [radius, setRadius] = useState<number | null>(null); // set from the activity's default once it's known
  const [actLoaded, setActLoaded] = useState(false);
  const [items, setItems] = useState<any[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    safe(supabase.from('activities').select('name, icon, categories(slug)').eq('slug', slug).maybeSingle())
      .then(({ data }) => { setAct(data as any); setActLoaded(true); });
  }, [slug]);
  const color = catStyle(act?.categories?.slug).color;
  // Default radius per activity: 5 km for walks/study, 10 for sports, 25 for gigs, 50 (and no km) for trips.
  const copy = planCopy(slug, act?.categories?.slug);
  useEffect(() => { if (actLoaded) setRadius((r) => r ?? copy.radius); }, [actLoaded, copy.radius]);

  const load = useCallback(async (r = radius) => {
    if (r == null) return; // waiting for the activity's default radius
    let pos = coords;
    if (!pos) { pos = await getCoords(); setCoords(pos); }
    if (!pos) { setDenied(true); setItems([]); return; }
    setDenied(false);
    if (session) syncAlertArea(session.user.id, pos).catch(() => {});
    const { data, error } = await safe(supabase.rpc('nearby_requests', { p_lat: pos.lat, p_lng: pos.lng, p_radius_km: r, p_slug: slug }));
    setError(error ? friendlyError(error) : null);
    if (!error) setItems(data ?? []); else setItems((cur) => cur ?? []);
  }, [coords, radius, slug, session]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useLive('join_requests', session ? `user_id=eq.${session.user.id}` : null, () => load());

  const [celebration, celebrate] = useCelebrate((id) => router.push(`/request/${id}`));
  const accept = async (item: any) => {
    setBusyId(item.id);
    const res = await askToJoin(item);
    setBusyId(null);
    if (res === 'joined') celebrate({ id: item.id, icon: item.activity_icon, title: planTitle(item), starts_at: item.starts_at, venue_name: item.venue_name });
    if (res) load();
  };


  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: act ? `${act.icon} ${act.name}` : 'Nearby', headerStyle: { backgroundColor: c.bg } }} />
      <View style={{ backgroundColor: c.bg, borderBottomWidth: 1, borderColor: c.line, paddingBottom: 6 }}>
        {copy.showKm ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, alignItems: 'center' }}>
            <Text style={{ fontFamily: font.bold, color: c.ink, marginRight: 10, marginBottom: 10 }}>within</Text>
            {RADII.map((r) => <Chip key={r} label={`${r} km`} color={color} active={r === radius} onPress={() => { setRadius(r); load(r); }} />)}
          </ScrollView>
        ) : (
          <Text style={{ fontFamily: font.semi, color: c.muted, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6 }}>🚩 Trips with a meeting point within {copy.radius} km of you</Text>
        )}
      </View>
      {!items ? <ActivityIndicator style={{ marginTop: 40 }} color={c.primary} /> : (
        <FlatList
          data={items} keyExtractor={(i) => i.id} contentContainerStyle={{ padding: 16, paddingTop: 20, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListHeaderComponent={items.length ? <Text style={{ fontFamily: font.black, fontSize: 15, color: c.muted, marginBottom: 12 }}>{items.length} {items.length === 1 ? (copy.showKm ? 'plan' : 'trip') : (copy.showKm ? 'plans' : 'trips')} {copy.showKm ? 'near you' : 'coming up'} 🔥</Text> : null}
          ListEmptyComponent={error ? <ErrorState message={error} onRetry={() => load()} /> : denied
            ? <Empty emoji="📍" text="Location is off. Allow location access in Settings to see plans near you." />
            : <Empty emoji="🦗" text={"It's quiet around here… for now.\nBe the main character and start a plan."} />}
          renderItem={({ item }) => (
            <RequestCard item={item} color={color} busy={busyId === item.id} onPress={() => router.push(`/request/${item.id}`)} onAccept={() => accept(item)} />
          )}
        />
      )}
      {celebration}
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 28 }}>
        <Button variant="pop" title="＋ Start a plan" onPress={() => router.push({ pathname: '/request/new', params: { slug } })} />
      </View>
    </View>
  );
}
