import { useCallback, useState } from 'react';
import { ScrollView, Text, Pressable, View, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useAlerts } from '../../lib/alerts';
import { getCoords, Coords } from '../../lib/location';
import { Week } from '../../lib/engage';
import { ErrorState, H1, H2, Kicker, Muted } from '../../components/ui';
import { friendlyError, safe, showError } from '../../lib/errors';
import Avatar from '../../components/Avatar';
import FreeSheet from '../../components/FreeSheet';
import RequestCard from '../../components/RequestCard';
import { useCelebrate } from '../../components/Celebrate';
import { c, font, border, pressedOffset, catStyle, neonOf, planTitle, whenLabel, inWindow } from '../../lib/theme';

const WINDOWS = [{ key: 'tonight', label: 'Tonight' }, { key: 'weekend', label: 'Weekend' }, { key: 'all', label: 'All' }] as const;
type Win = typeof WINDOWS[number]['key'];

// Home ("Night" design): what's on near you tonight / this weekend, "I'm free", events and regulars, then start something.
export default function Home() {
  const router = useRouter();
  const { session } = useAuth();
  const { unread } = useAlerts();
  const uid = session!.user.id;
  const [cats, setCats] = useState<any[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [pos, setPos] = useState<Coords | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [feed, setFeed] = useState<any[]>([]);
  const [win, setWin] = useState<Win>('tonight');
  const [events, setEvents] = useState<any[]>([]);
  const [free, setFree] = useState<any[]>([]);
  const [myFree, setMyFree] = useState<string | null>(null);
  const [week, setWeek] = useState<Week | null>(null);
  const [regulars, setRegulars] = useState<any[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [freeOpen, setFreeOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [celebration, celebrate] = useCelebrate((id) => router.push(`/request/${id}`));

  const load = useCallback(async () => {
    const [{ data: cs, error: csErr }, { data: wk }, { data: rg }, { data: av }, { data: us }] = await Promise.all([
      safe(supabase.from('categories').select('id, slug, name, activities(id, slug, name, icon)').order('sort').order('sort', { referencedTable: 'activities' })),
      safe(supabase.rpc('my_week')),
      safe(supabase.rpc('my_regulars')),
      safe(supabase.from('availability').select('until').eq('user_id', uid).gt('until', new Date().toISOString()).maybeSingle()),
      safe(supabase.from('user_sports').select('activities(slug)').eq('user_id', uid)),
    ]);
    // Categories are the one thing home can't work without; the other sections just stay hidden if they fail.
    if (csErr) { setError(friendlyError(csErr)); return; }
    setError(null);
    setCats(cs ?? []);
    setSel((s) => s ?? (cs as any[])?.[0]?.slug ?? null);
    setWeek(wk as Week | null);
    setRegulars((rg as any[]) ?? []);
    setMyFree((av as any)?.until ?? null);
    setInterests(((us as any[]) ?? []).map((r: any) => r.activities?.slug).filter(Boolean));

    const p = pos ?? (await getCoords());
    if (!p) return;
    setPos(p);
    if (!city) Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng })
      .then(([a]) => setCity(a?.city ?? a?.subregion ?? a?.district ?? null)).catch(() => {});
    const [{ data: fd }, { data: ev }, { data: fr }] = await Promise.all([
      safe(supabase.rpc('nearby_requests', { p_lat: p.lat, p_lng: p.lng, p_radius_km: 25, p_interests_only: true })),
      safe(supabase.rpc('nearby_requests', { p_lat: p.lat, p_lng: p.lng, p_radius_km: 50 })),
      safe(supabase.rpc('free_nearby', { p_lat: p.lat, p_lng: p.lng, p_radius_km: 15 })),
    ]);
    setFeed(((fd as any[]) ?? []).filter((r) => !r.is_host));
    setEvents(((ev as any[]) ?? []).filter((r) => r.featured_label));
    setFree((fr as any[]) ?? []);
  }, [uid, pos, city]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const stopFree = async () => {
    const { error } = await safe(supabase.rpc('clear_free'));
    if (error) showError('Could not update', error);
    load();
  };

  const join = async (r: any) => {
    setBusyId(r.id);
    const { error } = await safe(supabase.rpc('join_request', { p_request: r.id }));
    setBusyId(null);
    if (error) return showError('Could not join', error);
    celebrate({ id: r.id, icon: r.activity_icon, title: planTitle(r), starts_at: r.starts_at, venue_name: r.venue_name });
    load();
  };

  const cat = cats?.find((x) => x.slug === sel);
  const allActivities = (cats ?? []).flatMap((x) => x.activities);
  const shown = feed.filter((r) => inWindow(r.starts_at, win)).slice(0, 8);
  const day = new Date().toLocaleDateString([], { weekday: 'short' });

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl tintColor={c.primary} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Kicker>{city ?? 'Near you'} · {day}</Kicker>
          <Pressable onPress={() => router.push('/alerts')} hitSlop={8} accessibilityLabel="Alerts"
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', ...border }}>
            <Ionicons name="notifications-outline" size={20} color={c.ink} />
            {unread > 0 && (
              <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                <Text style={{ fontFamily: font.black, fontSize: 10, color: c.onNeon }}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            )}
          </Pressable>
        </View>
        <H1 style={{ fontSize: 40, lineHeight: 44, marginTop: 10, letterSpacing: -1 }}>Bored?{'\n'}<Text style={{ color: c.primary }}>Don't be.</Text></H1>
        <Muted style={{ marginTop: 8 }}>Small hangouts near you, with people into the same stuff.</Muted>
        {week && week.streak > 0 && <Text style={{ fontFamily: font.bold, color: neonOf(c.orange), marginTop: 6 }}>🔥 {week.streak}-week streak, keep it going</Text>}

        {/* Tonight / Weekend / All */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
          {WINDOWS.map((w) => {
            const on = w.key === win;
            return (
              <Pressable key={w.key} onPress={() => setWin(w.key)}
                style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 10, backgroundColor: on ? c.primary : c.card, ...(on ? {} : border) }}>
                <Text style={{ fontFamily: font.bold, fontSize: 13, color: on ? c.onNeon : c.ink }}>{w.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ marginTop: 14 }}>
          {!pos ? <Muted>Allow location to see plans near you.</Muted>
            : shown.length === 0 ? (
              <View style={{ backgroundColor: c.card, borderRadius: 20, padding: 18, ...border }}>
                <Text style={{ fontFamily: font.black, color: c.ink, fontSize: 16 }}>Nothing {win === 'tonight' ? 'on tonight' : win === 'weekend' ? 'planned this weekend' : 'nearby'} yet 🦗</Text>
                <Muted style={{ marginTop: 4 }}>Be the one who starts it. People into it nearby get an alert.</Muted>
                <Pressable onPress={() => router.push('/start')} style={{ marginTop: 12 }}>
                  <Text style={{ fontFamily: font.black, color: c.primary }}>＋ Start a plan →</Text>
                </Pressable>
              </View>
            )
            : shown.map((r) => (
              <RequestCard key={r.id} item={r} color={catStyle(r.category_slug).color} busy={busyId === r.id}
                onPress={() => router.push(`/request/${r.id}`)} onAccept={() => join(r)} />
            ))}
        </View>

        {/* I'm free */}
        <Pressable onPress={() => (myFree ? stopFree() : setFreeOpen(true))}
          style={({ pressed }) => [{ marginTop: 14, backgroundColor: myFree ? c.mint : c.lilac, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', ...border }, pressed && pressedOffset()]}>
          <Text style={{ fontSize: 28, marginRight: 12 }}>🙋</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.black, fontSize: 16, color: c.ink }}>{myFree ? `You're free until ${new Date(myFree).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : "I'm free right now"}</Text>
            <Text style={{ fontFamily: font.medium, color: c.muted }}>{myFree ? 'Tap to stop showing as free' : 'Let people nearby invite you'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.muted} />
        </Pressable>

        {events.length > 0 && (<>
          <H2>🏆 Events</H2>
          <HScroll>{events.map((r) => <MiniPlan key={r.id} r={r} onPress={() => router.push(`/request/${r.id}`)} />)}</HScroll>
        </>)}

        {free.length > 0 && (<>
          <H2>🙋 Free right now</H2>
          <HScroll>
            {free.map((f) => (
              <Pressable key={f.user_id} onPress={() => router.push(`/user/${f.user_id}`)}
                style={{ width: 150, backgroundColor: c.card, borderRadius: 20, padding: 12, marginRight: 10, alignItems: 'center', ...border }}>
                <Avatar url={f.avatar_url} name={f.name} size={54} color={c.mint} />
                <Text numberOfLines={1} style={{ fontFamily: font.black, color: c.ink, marginTop: 6 }}>{f.name}{f.verified ? ' ☑️' : ''}</Text>
                <Text numberOfLines={1} style={{ fontSize: 16, marginTop: 2 }}>{(f.activities ?? []).map((a: any) => a.icon).join(' ') || '✨'}</Text>
                <Muted style={{ fontSize: 12 }}>~{Number(f.distance_km)} km · till {new Date(f.until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Muted>
                {f.played_together > 0 && <Muted style={{ fontSize: 11, color: c.primary }}>⭐ {f.played_together}× together</Muted>}
              </Pressable>
            ))}
          </HScroll>
        </>)}

        {regulars.length > 0 && (<>
          <H2>⭐ Your regulars</H2>
          <HScroll>
            {regulars.map((p) => (
              <Pressable key={p.user_id} onPress={() => router.push(`/user/${p.user_id}`)} style={{ alignItems: 'center', marginRight: 14, width: 68 }}>
                <Avatar url={p.avatar_url} name={p.name} size={56} color={c.lilac} />
                <Text numberOfLines={1} style={{ fontFamily: font.bold, color: c.ink, fontSize: 12, marginTop: 4 }}>{String(p.name ?? '').split(' ')[0]}</Text>
                <Muted style={{ fontSize: 11 }}>{p.times}× together</Muted>
              </Pressable>
            ))}
          </HScroll>
        </>)}

        <H2 style={{ marginTop: 32 }}>Start something</H2>
        {error && !cats?.length ? <ErrorState message={error} onRetry={load} />
          : !cats ? <ActivityIndicator style={{ marginTop: 20 }} color={c.primary} /> : (
          <>
            <HScroll>
              {cats.map((x) => {
                const on = x.slug === sel;
                const cs = catStyle(x.slug);
                return (
                  <Pressable key={x.id} onPress={() => setSel(x.slug)}
                    style={[{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, marginRight: 8 },
                      on ? { backgroundColor: neonOf(cs.color) } : { backgroundColor: c.card, ...border }]}>
                    <Text style={{ fontSize: 16, marginRight: 6 }}>{cs.emoji}</Text>
                    <Text style={{ fontFamily: on ? font.black : font.semi, fontSize: 15, color: on ? c.onNeon : c.ink }}>{x.name}</Text>
                  </Pressable>
                );
              })}
            </HScroll>

            {cat && (
              <>
                <Muted style={{ marginTop: 10, marginBottom: 14 }}>{catStyle(cat.slug).tagline}</Muted>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                  {cat.activities.map((a: any) => {
                    const cs = catStyle(cat.slug);
                    return (
                      <Pressable key={a.id} onPress={() => router.push(`/sport/${a.slug}`)}
                        style={({ pressed }) => [{ width: '48.5%', backgroundColor: cs.color, borderRadius: 20, padding: 14, marginBottom: 10, ...border }, pressed && pressedOffset()]}>
                        <Text style={{ fontSize: 30 }}>{a.icon}</Text>
                        <Text style={{ marginTop: 10, fontFamily: font.black, color: c.ink, fontSize: 16, lineHeight: 20 }}>{a.name}</Text>
                        <Text style={{ marginTop: 2, fontFamily: font.semi, color: neonOf(cs.color), fontSize: 12 }}>find people →</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
      <FreeSheet open={freeOpen} onClose={() => setFreeOpen(false)} onSaved={load} activities={allActivities} defaults={interests} />
      {celebration}
    </SafeAreaView>
  );
}

const HScroll = ({ children }: { children: React.ReactNode }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4 }}>
    {children}
  </ScrollView>
);

function MiniPlan({ r, onPress }: { r: any; onPress: () => void }) {
  const left = r.slots_total - r.slots_filled;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width: 230, backgroundColor: c.pink, borderRadius: 20, padding: 14, marginRight: 10, ...border }, pressed && pressedOffset()]}>
      <Text style={{ fontFamily: font.black, fontSize: 12, color: neonOf(c.pink) }}>{whenLabel(r.starts_at)} · {Number(r.distance_km)} km</Text>
      {r.featured_label ? <Text style={{ fontFamily: font.black, color: c.ink, marginTop: 6 }}>{r.featured_label}</Text> : null}
      <Text numberOfLines={1} style={{ fontFamily: font.black, fontSize: 16, color: c.ink, marginTop: 4 }}>{r.activity_icon} {planTitle(r)}</Text>
      <Text numberOfLines={1} style={{ fontFamily: font.medium, color: c.muted, fontSize: 13, marginTop: 2 }}>📍 {r.venue_name}</Text>
      <Text style={{ fontFamily: font.bold, color: c.ink, marginTop: 8, fontSize: 13 }}>
        {r.has_joined ? "✅ you're in" : `${left} ${left === 1 ? 'spot' : 'spots'} left`}{r.women_only ? ' · 👩' : ''}
      </Text>
    </Pressable>
  );
}
