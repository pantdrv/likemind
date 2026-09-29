import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Button, Chip, Empty, ErrorState, Muted, Tag } from '../../components/ui';
import PlanChangeSheet, { ChangeMode } from '../../components/PlanChangeSheet';
import { friendlyError, safe } from '../../lib/errors';
import { cancelAsk } from '../../lib/engage';
import { c, font, border, pressedOffset, fmtDate, planTitle, tileColor } from '../../lib/theme';
import { useLive } from '../../lib/live';

type View_ = 'upcoming' | 'history';
type Who = 'all' | 'host' | 'player';

// A plan moves to History once its day is over (not the moment it starts), so tonight's plan stays up all evening.
const startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0));
const PAGE = 10;

export default function Activity() {
  const router = useRouter();
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState<{ plan: any; mode: ChangeMode } | null>(null);
  const [view, setView] = useState<View_>('upcoming');
  const [who, setWho] = useState<Who>('all');

  // "Coming up": only today onwards.
  const load = useCallback(async () => {
    const { data, error } = await safe(supabase.rpc('my_requests', { p_from: startOfToday().toISOString() }));
    setError(error ? friendlyError(error) : null);
    if (!error) setItems(data ?? []);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  // Live: my requests accepted / declined, and people asking to join or withdrawing on my plans.
  useLive('join_requests', null, load);

  // History: nothing is loaded until the tab is opened, then 10 at a time as you scroll.
  const [hist, setHist] = useState<any[]>([]);
  const [histMore, setHistMore] = useState(true);
  const [histBusy, setHistBusy] = useState(false);
  const [histStats, setHistStats] = useState<{ total: number; hosted: number } | null>(null);
  const [histRefreshing, setHistRefreshing] = useState(false);
  const histLoading = useRef(false);
  const loadHistory = useCallback(async (reset: boolean) => {
    if (histLoading.current) return;
    histLoading.current = true; setHistBusy(true);
    const before = startOfToday().toISOString();
    const last = reset ? null : hist[hist.length - 1];
    const [{ data, error }, stats] = await Promise.all([
      safe(supabase.rpc('my_history', { p_before: before, p_role: who === 'all' ? null : who,
        p_cursor_at: last?.starts_at ?? null, p_cursor_id: last?.id ?? null, p_limit: PAGE })),
      reset ? safe(supabase.rpc('my_history_stats', { p_before: before })) : Promise.resolve(null),
    ]);
    histLoading.current = false; setHistBusy(false);
    if (error) { setError(friendlyError(error)); return; }
    const rows = (data ?? []) as any[];
    setHist((cur) => (reset ? rows : [...cur, ...rows]));
    setHistMore(rows.length === PAGE);
    if (stats?.data) setHistStats(stats.data as any);
  }, [hist, who]);
  // First page when History opens, and again when the Hosted / Joined filter changes.
  useEffect(() => { if (view === 'history') { setHist([]); setHistMore(true); loadHistory(true); } }, [view, who]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (!items) return error ? <ErrorState message={error} onRetry={load} /> : <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />;

  const byTime = (a: any, b: any) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
  const upcoming = items.filter((r) => !(r.role === 'requested' && r.status === 'cancelled')).sort(byTime);  // soonest first
  const shown = view === 'upcoming' ? upcoming : hist;

  const header = (
    <View style={{ marginBottom: 8 }}>
      {/* Upcoming / History toggle */}
      <View style={{ flexDirection: 'row', backgroundColor: c.card, borderRadius: 14, padding: 4, marginBottom: 16, ...border }}>
        {([['upcoming', `Coming up · ${upcoming.length}`], ['history', histStats ? `🕘 History · ${histStats.total}` : '🕘 History']] as const).map(([k, label]) => {
          const on = view === k;
          return (
            <Pressable key={k} onPress={() => setView(k)} style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: on ? c.primary : 'transparent' }}>
              <Text style={{ fontFamily: font.bold, fontSize: 14, color: on ? c.onNeon : c.muted }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>


      {view === 'history' && (histStats?.total ?? 0) > 0 && (<>
        <Muted style={{ marginBottom: 10 }}>{histStats!.hosted} organized · {histStats!.total - histStats!.hosted} joined</Muted>
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
      // History: next 10 when you get near the bottom.
      onEndReachedThreshold={0.4}
      onEndReached={() => { if (view === 'history' && histMore && !histLoading.current && hist.length) loadHistory(false); }}
      ListFooterComponent={view === 'history' && histBusy ? <ActivityIndicator style={{ marginVertical: 16 }} color={c.primary} /> : null}
      refreshControl={view === 'history'
        ? <RefreshControl tintColor={c.primary} refreshing={histRefreshing} onRefresh={async () => { setHistRefreshing(true); await loadHistory(true); setHistRefreshing(false); }} />
        : undefined}
      ListEmptyComponent={view === 'upcoming'
        ? <Empty emoji="📭" text="Nothing coming up. Head to Explore to join a plan or start your own." />
        : histBusy ? null
        : <Empty emoji="🕘" text={who === 'all' ? 'Plans you hosted or joined show up here once their day is over.' : `No ${who === 'host' ? 'hosted' : 'joined'} plans yet.`} />}
      renderItem={({ item, index }) => {
        const cancelled = item.status === 'cancelled';
        const canChange = view === 'upcoming' && !cancelled && new Date(item.starts_at).getTime() > Date.now();
        const host = item.role === 'host';
        const requested = item.role === 'requested';
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
              <Tag label={host ? (view === 'history' ? 'hosted 👑' : 'hosting 👑') : requested ? 'requested ⏳' : 'joined ✅'} color={host ? c.accent : requested ? c.lilac : c.mint} />
            </View>
            {item.crew_name ? <Text style={{ color: c.ink, fontFamily: font.bold, marginTop: 8 }}>👯 {item.crew_name}</Text> : null}
            <Text style={{ color: c.muted, fontFamily: font.medium, marginTop: 10 }}>📍 {item.venue_name}</Text>
            <Text style={{ color: cancelled ? c.danger : c.primary, fontFamily: font.bold, marginTop: 4 }}>
              {cancelled ? 'Cancelled 💔' : view === 'history' ? `${item.slots_filled} ${item.slots_filled === 1 ? 'person' : 'people'} joined` : item.open_ended ? `${item.slots_filled} going · open to anyone` : `${item.slots_filled}/${item.slots_total} joined`}
            </Text>
            {cancelled && item.cancel_reason ? <Text style={{ color: c.muted, fontFamily: font.medium, marginTop: 2 }}>Reason: {item.cancel_reason}</Text> : null}
            {host && item.pending_requests > 0 && !cancelled ? (
              <Text style={{ color: c.primary, fontFamily: font.black, marginTop: 6 }}>🙋 {item.pending_requests} {item.pending_requests === 1 ? 'request' : 'requests'} waiting · tap to review</Text>
            ) : null}
            {canChange && (
              <View style={{ flexDirection: 'row', marginTop: 12 }}>
                {requested
                  ? <Button small variant="outline" title="Cancel request" onPress={async () => { if (await cancelAsk(item.id)) load(); }} />
                  : <Button small variant="outline" title={host ? '✕ Cancel plan' : "🙃 Can't make it"} onPress={() => setChanging({ plan: item, mode: host ? 'cancel' : 'leave' })} />}
              </View>
            )}
          </Pressable>
        );
      }} />
    <PlanChangeSheet plan={changing?.plan ?? null} mode={changing?.mode ?? 'leave'} onClose={() => setChanging(null)} onDone={load} />
  </>);
}
