import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Button, Chip, Empty, ErrorState, Muted, Tag } from '../../components/ui';
import PlanChangeSheet, { ChangeMode } from '../../components/PlanChangeSheet';
import { friendlyError, safe } from '../../lib/errors';
import { c, font, border, pressedOffset, fmtDate, planTitle, tileColor } from '../../lib/theme';

type View_ = 'upcoming' | 'history';
type Who = 'all' | 'host' | 'player';

// A plan moves to History once its day is over (not the moment it starts), so tonight's plan stays up all evening.
const startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0)).getTime();
const isPast = (r: any) => new Date(r.starts_at).getTime() < startOfToday();

export default function Activity() {
  const router = useRouter();
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState<{ plan: any; mode: ChangeMode } | null>(null);
  const [view, setView] = useState<View_>('upcoming');
  const [who, setWho] = useState<Who>('all');
  const load = useCallback(async () => {
    const { data, error } = await safe(supabase.rpc('my_requests'));
    setError(error ? friendlyError(error) : null);
    if (!error) setItems(data ?? []);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!items) return error ? <ErrorState message={error} onRetry={load} /> : <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />;

  const byTime = (a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
  const upcoming = items.filter((r) => !isPast(r)).sort(byTime);          // soonest first
  const history = items.filter(isPast).sort((a, b) => byTime(b, a));      // newest first
  const hosted = history.filter((r) => r.role === 'host').length;
  const shown = view === 'upcoming' ? upcoming : history.filter((r) => who === 'all' || r.role === who);

  // Recap: plans that ended in the last week, had other people, and still need photos or kudos from me.
  const recaps = items.filter((r) => r.ended && r.status !== 'cancelled' && r.slots_filled > 0
    && Date.now() - new Date(r.starts_at).getTime() < 7 * 86400_000 && (!r.kudos_given || r.album_count === 0));

  const header = (
    <View style={{ marginBottom: 8 }}>
      {/* Upcoming / History toggle */}
      <View style={{ flexDirection: 'row', backgroundColor: c.card, borderRadius: 14, padding: 4, marginBottom: 16, ...border }}>
        {([['upcoming', `Upcoming · ${upcoming.length}`], ['history', `🕘 History · ${history.length}`]] as const).map(([k, label]) => {
          const on = view === k;
          return (
            <Pressable key={k} onPress={() => setView(k)} style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: on ? c.primary : 'transparent' }}>
              <Text style={{ fontFamily: font.bold, fontSize: 14, color: on ? c.onNeon : c.muted }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {view === 'upcoming' && recaps.length > 0 && (<>
        <Text style={{ fontFamily: font.black, fontSize: 19, color: c.ink, marginBottom: 10 }}>✨ Recap time</Text>
        {recaps.map((r) => (
          <Pressable key={r.id} onPress={() => router.push(`/request/${r.id}`)}
            style={({ pressed }) => [{ backgroundColor: c.lime, borderRadius: 20, padding: 16, marginBottom: 12, ...border }, pressed && pressedOffset()]}>
            <Text style={{ fontFamily: font.black, fontSize: 16, color: c.ink }}>How was {r.activity_icon} {planTitle(r)}?</Text>
            <Text style={{ fontFamily: font.semi, color: c.ink, marginTop: 4 }}>
              {[r.album_count === 0 && '📸 drop photos in the album', !r.kudos_given && '🙌 give the squad kudos'].filter(Boolean).join(' · ')}
            </Text>
            <Text style={{ fontFamily: font.bold, color: c.primary, marginTop: 6 }}>🔁 or run it back →</Text>
          </Pressable>
        ))}
        <Text style={{ fontFamily: font.black, fontSize: 19, color: c.ink, marginTop: 8, marginBottom: 10 }}>Coming up</Text>
      </>)}

      {view === 'history' && history.length > 0 && (<>
        <Muted style={{ marginBottom: 10 }}>{hosted} organized · {history.length - hosted} joined</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip label="All" active={who === 'all'} onPress={() => setWho('all')} />
          <Chip label="👑 Hosted" active={who === 'host'} onPress={() => setWho('host')} />
          <Chip label="✅ Joined" active={who === 'player'} onPress={() => setWho('player')} />
        </View>
      </>)}
    </View>
  );

  return (<>
    <FlatList data={shown} keyExtractor={(i) => i.id} contentContainerStyle={{ padding: 16 }}
      ListHeaderComponent={header}
      ListEmptyComponent={view === 'upcoming'
        ? <Empty emoji="📭" text={history.length ? 'Nothing coming up. Head to Explore to join a plan or start your own.' : 'No plans yet. Head to Explore to join one or start your own.'} />
        : <Empty emoji="🕘" text={who === 'all' ? 'Plans you hosted or joined show up here once their day is over.' : `No ${who === 'host' ? 'hosted' : 'joined'} plans yet.`} />}
      renderItem={({ item, index }) => {
        const cancelled = item.status === 'cancelled';
        const canChange = view === 'upcoming' && !cancelled && new Date(item.starts_at).getTime() > Date.now();
        const host = item.role === 'host';
        return (
          <Pressable onPress={() => router.push(`/request/${item.id}`)}
            style={({ pressed }) => [{ backgroundColor: c.card, borderRadius: 20, padding: 16, marginBottom: 12, ...border, opacity: cancelled ? 0.6 : 1 }, pressed && pressedOffset()]}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: tileColor(index), alignItems: 'center', justifyContent: 'center', ...border }}>
                <Text style={{ fontSize: 22 }}>{item.activity_icon}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 17, fontFamily: font.black, color: c.ink }} numberOfLines={1}>{planTitle(item)}</Text>
                <Text style={{ color: c.muted, fontFamily: font.medium, marginTop: 2 }}>{fmtDate(item.starts_at)}</Text>
              </View>
              <Tag label={host ? (view === 'history' ? 'hosted 👑' : 'hosting 👑') : 'joined ✅'} color={host ? c.accent : c.mint} />
            </View>
            {item.crew_name ? <Text style={{ color: c.ink, fontFamily: font.bold, marginTop: 8 }}>👯 {item.crew_name}</Text> : null}
            <Text style={{ color: c.muted, fontFamily: font.medium, marginTop: 10 }}>📍 {item.venue_name}</Text>
            <Text style={{ color: cancelled ? c.danger : c.primary, fontFamily: font.bold, marginTop: 4 }}>
              {cancelled ? 'Cancelled 💔' : view === 'history' ? `${item.slots_filled} ${item.slots_filled === 1 ? 'person' : 'people'} joined` : item.open_ended ? `${item.slots_filled} going · open to anyone` : `${item.slots_filled}/${item.slots_total} joined`}
            </Text>
            {cancelled && item.cancel_reason ? <Text style={{ color: c.muted, fontFamily: font.medium, marginTop: 2 }}>Reason: {item.cancel_reason}</Text> : null}
            {canChange && (
              <View style={{ flexDirection: 'row', marginTop: 12 }}>
                <Button small variant="outline" title={host ? '✕ Cancel plan' : "🙃 Can't make it"} onPress={() => setChanging({ plan: item, mode: host ? 'cancel' : 'leave' })} />
              </View>
            )}
          </Pressable>
        );
      }} />
    <PlanChangeSheet plan={changing?.plan ?? null} mode={changing?.mode ?? 'leave'} onClose={() => setChanging(null)} onDone={load} />
  </>);
}
