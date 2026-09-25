import { useCallback, useState } from 'react';
import { ScrollView, Text, Pressable, View, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { getCoords, Coords } from '../../lib/location';
import { Week } from '../../lib/engage';
import { Button, H1, H2, Muted } from '../../components/ui';
import Avatar from '../../components/Avatar';
import FreeSheet from '../../components/FreeSheet';
import { c, font, border, shadow, pressedOffset, catStyle, tileColor, fmtDate, planTitle } from '../../lib/theme';

// Home: live feed, "I'm free", events and regulars on top of the category tiles.
export default function Home() {
  const router = useRouter();
  const { session } = useAuth();
  const uid = session!.user.id;
  const [cats, setCats] = useState<any[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [pos, setPos] = useState<Coords | null>(null);
  const [feed, setFeed] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [free, setFree] = useState<any[]>([]);
  const [myFree, setMyFree] = useState<string | null>(null);
  const [week, setWeek] = useState<Week | null>(null);
  const [regulars, setRegulars] = useState<any[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [freeOpen, setFreeOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [{ data: cs }, { data: wk }, { data: rg }, { data: av }, { data: us }] = await Promise.all([
      supabase.from('categories').select('id, slug, name, activities(id, slug, name, icon)').order('sort').order('sort', { referencedTable: 'activities' }),
      supabase.rpc('my_week'),
      supabase.rpc('my_regulars'),
      supabase.from('availability').select('until').eq('user_id', uid).gt('until', new Date().toISOString()).maybeSingle(),
      supabase.from('user_sports').select('activities(slug)').eq('user_id', uid),
    ]);
    setCats(cs ?? []);
    setSel((s) => s ?? cs?.[0]?.slug ?? null);
    setWeek(wk);
    setRegulars(rg ?? []);
    setMyFree(av?.until ?? null);
    setInterests((us ?? []).map((r: any) => r.activities?.slug).filter(Boolean));

    const p = pos ?? (await getCoords());
    if (!p) return;
    setPos(p);
    const [{ data: fd }, { data: ev }, { data: fr }] = await Promise.all([
      supabase.rpc('nearby_requests', { p_lat: p.lat, p_lng: p.lng, p_radius_km: 25, p_interests_only: true }),
      supabase.rpc('nearby_requests', { p_lat: p.lat, p_lng: p.lng, p_radius_km: 50 }),
      supabase.rpc('free_nearby', { p_lat: p.lat, p_lng: p.lng, p_radius_km: 15 }),
    ]);
    setFeed((fd ?? []).filter((r: any) => !r.is_host).slice(0, 12));
    setEvents((ev ?? []).filter((r: any) => r.featured_label));
    setFree(fr ?? []);
  }, [uid, pos]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const stopFree = async () => { await supabase.rpc('clear_free'); load(); };

  const first = String(session?.user.user_metadata?.full_name ?? '').split(' ')[0];
  const cat = cats?.find((x) => x.slug === sel);
  const style = catStyle(cat?.slug);
  const allActivities = (cats ?? []).flatMap((x) => x.activities);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Muted style={{ fontFamily: font.bold, fontSize: 16 }}>hey {first || 'there'} ✌️</Muted>
          {week && week.streak > 0 && (
            <View style={{ backgroundColor: c.orange, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, ...border, transform: [{ rotate: '3deg' }] }}>
              <Text style={{ fontFamily: font.black, color: c.ink }}>🔥 {week.streak}-week streak</Text>
            </View>
          )}
        </View>
        <H1 style={{ fontSize: 40, lineHeight: 44, marginTop: 4 }}>what's the{'\n'}plan today?</H1>

        {/* I'm free */}
        <Pressable onPress={() => (myFree ? stopFree() : setFreeOpen(true))}
          style={({ pressed }) => [{ marginTop: 18, backgroundColor: myFree ? c.mint : c.lilac, borderRadius: 22, padding: 16, flexDirection: 'row', alignItems: 'center', ...border },
            pressed ? pressedOffset(4) : shadow(4)]}>
          <Text style={{ fontSize: 30, marginRight: 12 }}>🙋</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: font.black, fontSize: 17, color: c.ink }}>{myFree ? `You're free until ${new Date(myFree).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : "I'm free right now"}</Text>
            <Text style={{ fontFamily: font.medium, color: c.ink, opacity: 0.75 }}>{myFree ? 'Tap to stop showing as free' : 'Let nearby people know, they can invite you'}</Text>
          </View>
        </Pressable>

        {/* Happening near you */}
        <Section title="🔥 Happening near you" empty={pos ? 'Nothing nearby for your interests yet. Start something below 👇' : 'Allow location to see plans near you.'} show>
          {feed.length > 0 && <HScroll>{feed.map((r) => <MiniPlan key={r.id} r={r} onPress={() => router.push(`/request/${r.id}`)} />)}</HScroll>}
        </Section>

        {events.length > 0 && (
          <Section title="🏆 Events" show>
            <HScroll>{events.map((r) => <MiniPlan key={r.id} r={r} color={c.pink} onPress={() => router.push(`/request/${r.id}`)} />)}</HScroll>
          </Section>
        )}

        {free.length > 0 && (
          <Section title="🙋 Free right now" show>
            <HScroll>
              {free.map((f) => (
                <Pressable key={f.user_id} onPress={() => router.push(`/user/${f.user_id}`)}
                  style={{ width: 150, backgroundColor: c.card, borderRadius: 20, padding: 12, marginRight: 12, alignItems: 'center', ...border, ...shadow(3) }}>
                  <Avatar url={f.avatar_url} name={f.name} size={54} />
                  <Text numberOfLines={1} style={{ fontFamily: font.black, color: c.ink, marginTop: 6 }}>{f.name}{f.verified ? ' ☑️' : ''}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 16, marginTop: 2 }}>{f.activities.map((a: any) => a.icon).join(' ') || '✨'}</Text>
                  <Muted style={{ fontSize: 12 }}>~{Number(f.distance_km)} km · till {new Date(f.until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Muted>
                  {f.played_together > 0 && <Muted style={{ fontSize: 11, color: c.primary }}>⭐ {f.played_together}× together</Muted>}
                </Pressable>
              ))}
            </HScroll>
          </Section>
        )}

        {regulars.length > 0 && (
          <Section title="⭐ Your regulars" show>
            <HScroll>
              {regulars.map((p) => (
                <Pressable key={p.user_id} onPress={() => router.push(`/user/${p.user_id}`)} style={{ alignItems: 'center', marginRight: 14, width: 68 }}>
                  <Avatar url={p.avatar_url} name={p.name} size={56} color={c.accent} />
                  <Text numberOfLines={1} style={{ fontFamily: font.bold, color: c.ink, fontSize: 12, marginTop: 4 }}>{p.name.split(' ')[0]}</Text>
                  <Muted style={{ fontSize: 11 }}>{p.times}× together</Muted>
                </Pressable>
              ))}
            </HScroll>
          </Section>
        )}

        <H2>Start something</H2>
        {!cats ? <ActivityIndicator style={{ marginTop: 20 }} color={c.primary} /> : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 6 }}>
              {cats.map((x) => {
                const on = x.slug === sel;
                const cs = catStyle(x.slug);
                return (
                  <Pressable key={x.id} onPress={() => setSel(x.slug)}
                    style={[{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 999, marginRight: 10, ...border },
                      on ? { backgroundColor: cs.color, ...shadow(3) } : { backgroundColor: c.card }]}>
                    <Text style={{ fontSize: 18, marginRight: 6 }}>{cs.emoji}</Text>
                    <Text style={{ fontFamily: on ? font.black : font.semi, fontSize: 16, color: c.ink }}>{x.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {cat && (
              <>
                <View style={{ marginTop: 16, marginBottom: 18, alignSelf: 'flex-start', backgroundColor: c.ink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, transform: [{ rotate: '-1.5deg' }] }}>
                  <Text style={{ color: style.color, fontFamily: font.bold, fontSize: 14 }}>{style.tagline}</Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                  {cat.activities.map((a: any, i: number) => (
                    <Pressable key={a.id} onPress={() => router.push(`/sport/${a.slug}`)}
                      style={({ pressed }) => [{ width: '47.5%', backgroundColor: tileColor(i), borderRadius: 24, paddingVertical: 22, paddingHorizontal: 14, marginBottom: 16, ...border },
                        pressed ? pressedOffset(4) : shadow(4)]}>
                      <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', ...border, transform: [{ rotate: i % 2 ? '6deg' : '-6deg' }] }}>
                        <Text style={{ fontSize: 32 }}>{a.icon}</Text>
                      </View>
                      <Text style={{ marginTop: 14, fontFamily: font.black, color: c.ink, fontSize: 18, lineHeight: 21 }}>{a.name}</Text>
                      <Text style={{ marginTop: 2, fontFamily: font.semi, color: c.ink, opacity: 0.7, fontSize: 13 }}>find people →</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
      <FreeSheet open={freeOpen} onClose={() => setFreeOpen(false)} onSaved={load} activities={allActivities} defaults={interests} />
    </SafeAreaView>
  );
}

function Section({ title, empty, show, children }: { title: string; empty?: string; show: boolean; children?: React.ReactNode }) {
  if (!show) return null;
  const hasContent = Array.isArray(children) ? children.some(Boolean) : !!children;
  return (
    <View>
      <H2>{title}</H2>
      {hasContent ? children : empty ? <Muted>{empty}</Muted> : null}
    </View>
  );
}

const HScroll = ({ children }: { children: React.ReactNode }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}>
    {children}
  </ScrollView>
);

function MiniPlan({ r, onPress, color }: { r: any; onPress: () => void; color?: string }) {
  const left = r.slots_total - r.slots_filled;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width: 220, backgroundColor: color ?? catStyle(r.category_slug).color, borderRadius: 22, padding: 14, marginRight: 12, ...border },
      pressed ? pressedOffset(3) : shadow(4)]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 26 }}>{r.activity_icon}</Text>
        <View style={{ backgroundColor: c.card, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1.5, borderColor: c.ink }}>
          <Text style={{ fontFamily: font.black, fontSize: 12, color: c.ink }}>~{Number(r.distance_km)} km</Text>
        </View>
      </View>
      {r.featured_label ? <Text style={{ fontFamily: font.black, color: c.ink, marginTop: 6 }}>{r.featured_label}</Text> : null}
      <Text numberOfLines={1} style={{ fontFamily: font.black, fontSize: 16, color: c.ink, marginTop: 6 }}>{planTitle(r)}</Text>
      <Text numberOfLines={1} style={{ fontFamily: font.semi, color: c.ink, opacity: 0.8, fontSize: 13 }}>{fmtDate(r.starts_at)}</Text>
      <Text numberOfLines={1} style={{ fontFamily: font.semi, color: c.ink, opacity: 0.8, fontSize: 13 }}>📍 {r.venue_name}</Text>
      <Text style={{ fontFamily: font.black, color: c.ink, marginTop: 6 }}>
        {r.has_joined ? "✅ you're in" : `${left} ${left === 1 ? 'spot' : 'spots'} left`}{r.women_only ? ' · 👩' : ''}{r.crew_name ? ` · 👯 ${r.crew_name}` : ''}
      </Text>
    </Pressable>
  );
}
