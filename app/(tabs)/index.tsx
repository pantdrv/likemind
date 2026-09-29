import { useCallback, useState } from 'react';
import { ScrollView, Text, Pressable, View, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { AREA_KMS, DEFAULT_AREA_KM, setMyAreaKm, useAlerts } from '../../lib/alerts';
import { useThemeMode } from '../../lib/themeMode';
import { getCoords, Coords } from '../../lib/location';
import { askToJoin } from '../../lib/engage';
import { Chip, ErrorState, H2, Muted } from '../../components/ui';
import { friendlyError, safe, showError } from '../../lib/errors';
import Avatar from '../../components/Avatar';
import FreeSheet from '../../components/FreeSheet';
import RequestCard from '../../components/RequestCard';
import { useCelebrate } from '../../components/Celebrate';
import { planCopy } from '../../lib/planCopy';
import { c, font, border, pressedOffset, catStyle, neonOf, planTitle, whenLabel, inWindow, spotsLabel } from '../../lib/theme';
import { useLive } from '../../lib/live';
import { announceFreeChanged, useFreeNowUpdates } from '../../lib/freeNow';

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
  const [feed, setFeed] = useState<any[]>([]);
  const [win, setWin] = useState<Win>('tonight');
  // "My area": the same distance as alerts (Me → My area). Changing it here changes it there too.
  const [areaKm, setAreaKm] = useState(DEFAULT_AREA_KM);
  const [areaOpen, setAreaOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { mode, toggle } = useThemeMode();
  const isDay = mode === 'day';
  const [me, setMe] = useState<{ full_name: string; avatar_url: string | null } | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [free, setFree] = useState<any[]>([]);
  const [myFree, setMyFree] = useState<string | null>(null);
  const [regulars, setRegulars] = useState<any[]>([]);
  const [freeOpen, setFreeOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [celebration, celebrate] = useCelebrate((id) => router.push(`/request/${id}`));

  const load = useCallback(async () => {
    const [{ data: cs, error: csErr }, { data: rg }, { data: av }, { data: ar }, { data: prof }] = await Promise.all([
      safe(supabase.from('categories').select('id, slug, name, activities(id, slug, name, icon)').order('sort').order('sort', { referencedTable: 'activities' })),
      safe(supabase.rpc('my_regulars')),
      safe(supabase.from('availability').select('until').eq('user_id', uid).gt('until', new Date().toISOString()).maybeSingle()),
      safe(supabase.from('alert_areas').select('radius_km').eq('user_id', uid).maybeSingle()),
      safe(supabase.from('profiles').select('full_name, avatar_url').eq('id', uid).maybeSingle()),
    ]);
    // Categories are the one thing home can't work without; the other sections just stay hidden if they fail.
    if (csErr) { setError(friendlyError(csErr)); return; }
    setError(null);
    setCats(cs ?? []);
    setSel((s) => s ?? (cs as any[])?.[0]?.slug ?? null);
    if ((ar as any)?.radius_km) setAreaKm((ar as any).radius_km);
    if (prof) setMe(prof as any);
    setRegulars((rg as any[]) ?? []);
    setMyFree((av as any)?.until ?? null);

    const p = pos ?? (await getCoords());
    if (!p) return;
    setPos(p);
    const [{ data: fd }, { data: ev }, { data: fr }] = await Promise.all([
      safe(supabase.rpc('nearby_requests', { p_lat: p.lat, p_lng: p.lng, p_radius_km: 50, p_interests_only: true })),
      safe(supabase.rpc('nearby_requests', { p_lat: p.lat, p_lng: p.lng, p_radius_km: 50 })),
      safe(supabase.rpc('free_nearby', { p_lat: p.lat, p_lng: p.lng, p_radius_km: 15 })),
    ]);
    // Fetched up to 50 km once; "my area" is applied on the phone so changing the distance is instant.
    setFeed(((fd as any[]) ?? []).filter((r) => !r.is_host));
    setEvents(((ev as any[]) ?? []).filter((r) => r.featured_label));
    setFree((fr as any[]) ?? []);
  }, [uid, pos]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  // Live: my requests accepted / declined -> cards update.
  useLive('join_requests', `user_id=eq.${uid}`, load);
  // Live: someone nearby turns "I'm free" on or off -> refresh just that list.
  useFreeNowUpdates(async () => {
    if (!pos) return;
    const { data } = await safe(supabase.rpc('free_nearby', { p_lat: pos.lat, p_lng: pos.lng, p_radius_km: 15 }));
    if (data) setFree(data as any[]);
  });

  const stopFree = async () => {
    const { error } = await safe(supabase.rpc('clear_free'));
    if (error) showError('Could not update', error); else announceFreeChanged();
    load();
  };

  const join = async (r: any) => {
    setBusyId(r.id);
    const res = await askToJoin(r);
    setBusyId(null);
    if (res === 'joined') celebrate({ id: r.id, icon: r.activity_icon, title: planTitle(r), starts_at: r.starts_at, venue_name: r.venue_name });
    if (res) load();
  };


  const cat = cats?.find((x) => x.slug === sel);
  const allActivities = (cats ?? []).flatMap((x) => x.activities);
  // Within my area; trips (no km shown) count up to 50 km because people travel for those anyway.
  const inArea = (r: any) => Number(r.distance_km) <= (planCopy(r.activity_slug, r.category_slug).showKm ? areaKm : Math.max(areaKm, 50));
  const shown = feed.filter((r) => inArea(r) && inWindow(r.starts_at, win)).slice(0, 8);
  const changeArea = async (km: number) => {
    const prev = areaKm;
    setAreaKm(km); setAreaOpen(false);
    const { error } = await setMyAreaKm(km);
    if (error) { setAreaKm(prev); showError('Could not change your area', error); }
  };
  const firstName = String(me?.full_name ?? session?.user.user_metadata?.full_name ?? '').split(' ')[0];


  const themeBtn = (
    <Pressable onPress={toggle} hitSlop={8} accessibilityLabel={isDay ? 'Switch to night look' : 'Switch to day look'}
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', marginRight: 8, ...border }}>
      <Ionicons name={isDay ? 'moon-outline' : 'sunny-outline'} size={19} color={c.ink} />
    </Pressable>
  );
  const bellBtn = (
    <Pressable onPress={() => router.push('/alerts')} hitSlop={8} accessibilityLabel="Alerts"
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', ...border }}>
      <Ionicons name="notifications-outline" size={20} color={c.ink} />
      {unread > 0 && (
        <View style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Text style={{ fontFamily: font.black, fontSize: 10, color: c.onNeon }}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      )}
    </Pressable>
  );
  const areaPicker = areaOpen && (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {AREA_KMS.map((km) => <Chip key={km} label={`${km} km`} active={km === areaKm} onPress={() => changeArea(km)} />)}
      </View>
      <Muted style={{ fontSize: 12 }}>Also used for your alerts about new plans.</Muted>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      {/* Sticky header: stays at the top while the rest scrolls; a hairline shows once content is underneath. */}
      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, backgroundColor: c.bg,
        borderBottomWidth: 1, borderBottomColor: scrolled ? c.line : 'transparent' }}>
        {/* Same header in Day and Night: greeting, look switch, alerts, me, then distance. */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={{ fontFamily: font.medium, color: c.muted, fontSize: 15 }}>Hi {firstName || 'there'}</Text>
            <Text style={{ fontFamily: font.black, color: c.ink, fontSize: 24, marginTop: 2 }}>What's the plan today?</Text>
          </View>
          {themeBtn}{bellBtn}
          <Pressable onPress={() => router.push('/profile')} style={{ marginLeft: 8 }} accessibilityLabel="My profile">
            <Avatar url={me?.avatar_url ?? null} name={firstName} size={44} color={c.primarySoft} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
          <Pressable onPress={() => setAreaOpen(!areaOpen)} accessibilityLabel="Change distance">
            <Text style={{ fontFamily: font.bold, color: c.muted, fontSize: 13 }}>📍 Within {areaKm} km {areaOpen ? '▴' : '▾'}</Text>
          </Pressable>
        </View>
        {areaPicker}
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 40 }} scrollEventThrottle={32}
        onScroll={(e) => { const y = e.nativeEvent.contentOffset.y > 4; if (y !== scrolled) setScrolled(y); }}
        refreshControl={<RefreshControl tintColor={c.primary} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>

        {/* Tonight / Weekend / All: same in both looks */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' }}>
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

        {/* Plan cards: the same in Day and Night; only the colours differ. */}
        <View style={{ marginTop: 14 }}>
          {!pos ? <Muted>Allow location to see plans near you.</Muted>
            : shown.length === 0 ? (
              <View style={{ backgroundColor: c.card, borderRadius: 20, padding: 18, ...border }}>
                <Text style={{ fontFamily: font.black, color: c.ink, fontSize: 16 }}>Nothing {win === 'tonight' ? 'on tonight' : win === 'weekend' ? 'planned this weekend' : 'coming up'} within {areaKm} km 🦗</Text>
                <Muted style={{ marginTop: 4 }}>Be the one who starts it. People into it nearby get an alert.</Muted>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 12 }}>
                  <Pressable onPress={() => router.push('/start')}>
                    <Text style={{ fontFamily: font.black, color: c.primary }}>＋ Start a plan →</Text>
                  </Pressable>
                </View>
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
                style={{ width: 190, backgroundColor: c.card, borderRadius: 20, padding: 12, marginRight: 10, alignItems: 'center', ...border }}>
                <Avatar url={f.avatar_url} name={f.name} size={54} color={c.mint} />
                <Text numberOfLines={1} style={{ fontFamily: font.black, color: c.ink, marginTop: 6 }}>{f.name}</Text>
                {/* What they're free for, in words, and their note. */}
                <Text numberOfLines={2} style={{ fontFamily: font.bold, color: c.ink, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
                  {(f.activities ?? []).length ? f.activities.map((a: any) => `${a.icon} ${a.name}`).join(' · ') : '✨ Up for anything'}
                </Text>
                {f.note ? <Text numberOfLines={2} style={{ fontFamily: font.medium, color: c.muted, fontSize: 12, fontStyle: 'italic', textAlign: 'center', marginTop: 4 }}>“{f.note}”</Text> : null}
                <Muted style={{ fontSize: 12, marginTop: 4 }}>~{Number(f.distance_km)} km · till {new Date(f.until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Muted>
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
      <FreeSheet open={freeOpen} onClose={() => setFreeOpen(false)} onSaved={load} activities={allActivities} />
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
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width: 230, backgroundColor: c.pink, borderRadius: 20, padding: 14, marginRight: 10, ...border }, pressed && pressedOffset()]}>
      <Text style={{ fontFamily: font.black, fontSize: 12, color: neonOf(c.pink) }}>{whenLabel(r.starts_at)}{planCopy(r.activity_slug, r.category_slug).showKm ? ` · ${Number(r.distance_km)} km` : ''}</Text>
      {r.featured_label ? <Text style={{ fontFamily: font.black, color: c.ink, marginTop: 6 }}>{r.featured_label}</Text> : null}
      <Text numberOfLines={1} style={{ fontFamily: font.black, fontSize: 16, color: c.ink, marginTop: 4 }}>{r.activity_icon} {planTitle(r)}</Text>
      <Text numberOfLines={1} style={{ fontFamily: font.medium, color: c.muted, fontSize: 13, marginTop: 2 }}>📍 {r.venue_name}</Text>
      <Text style={{ fontFamily: font.bold, color: c.ink, marginTop: 8, fontSize: 13 }}>
        {r.has_joined ? "✅ you're in" : r.my_request === 'pending' ? 'requested ⏳' : spotsLabel(r)}{r.women_only ? ' · 👩' : ''}
      </Text>
    </Pressable>
  );
}
