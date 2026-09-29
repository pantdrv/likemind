import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { userActions } from '../../lib/safety';
import { askToJoin, cancelAsk, checkIn, sharePlan } from '../../lib/engage';
import { detailTags } from '../../lib/planCopy';
import { Button, Card, Empty, ErrorState, H1, H2, Muted, Tag } from '../../components/ui';
import Chat from '../../components/Chat';
import PlanChangeSheet, { ChangeMode } from '../../components/PlanChangeSheet';
import PlanMap from '../../components/PlanMap';
import Avatar from '../../components/Avatar';
import KudosPanel from '../../components/KudosPanel';
import PlanAlbum from '../../components/PlanAlbum';
import { useCelebrate } from '../../components/Celebrate';
import { c, font, border, fmtDate, planTitle, spotsLabel } from '../../lib/theme';
import { friendlyError, safe, showError } from '../../lib/errors';
import { useLive } from '../../lib/live';

export default function RequestDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const me = session!.user.id;
  const router = useRouter();
  const [d, setD] = useState<any | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState<ChangeMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A failed refresh keeps the plan that's already on screen.
  const load = useCallback(async () => {
    const { data, error } = await safe(supabase.rpc('request_detail', { p_id: id }));
    setError(error ? friendlyError(error) : null);
    if (!error) setD(data ?? null);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  // Live: someone asks / withdraws (host sees it), or the host accepts / declines (requester sees it).
  useLive('join_requests', `request_id=eq.${id}`, load);

  const [celebration, celebrate] = useCelebrate(() => {});
  const [responding, setResponding] = useState<string | null>(null);
  // Ask to join; invited people and crew members get in straight away (and get the celebration).
  const ask = async () => {
    setBusy(true);
    const res = await askToJoin({ id, host: d?.host });
    setBusy(false);
    if (res === 'joined' && d) celebrate({ id, icon: d.activity_icon, title: planTitle(d), starts_at: d.starts_at, venue_name: d.venue_name });
    load();
  };
  const withdraw = async () => { setBusy(true); await cancelAsk(id); setBusy(false); load(); };
  // Host: accept or decline someone who asked to join.
  const respond = async (userId: string, accept: boolean) => {
    setResponding(userId);
    const { error } = await safe(supabase.rpc('respond_join_request', { p_request: id, p_user: userId, p_accept: accept }));
    setResponding(null);
    if (error) showError(accept ? "Couldn't accept" : "Couldn't decline", error);
    load();
  };

  if (d === undefined) return error ? <ErrorState message={error} onRetry={load} /> : <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />;
  if (d === null) return <Empty emoji="🫥" text="This plan isn't available anymore." />;

  d.participants ??= []; d.my_kudos ??= []; d.pending_requests ??= [];
  const now = Date.now();
  const start = new Date(d.starts_at).getTime();
  const started = start <= now;
  const checkinOpen = d.is_member && d.checkin_enabled && d.status !== 'cancelled' && now >= start - 30 * 60_000 && now <= start + 3 * 3600_000;
  const people = [{ id: d.host.id, name: d.host.name, avatar_url: d.host.avatar_url }, ...d.participants.map((p: any) => ({ id: p.id, name: p.name, avatar_url: p.avatar_url }))];
  const status = d.status === 'cancelled' ? { label: 'cancelled 💔', color: c.danger }
    : d.status === 'full' ? { label: 'squad full 🔒', color: c.lilac }
    : { label: spotsLabel(d), color: c.lime };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{
        headerRight: () => d.status !== 'cancelled' ? (
          <Pressable hitSlop={10} onPress={() => sharePlan({ ...d, id })}><Text style={{ fontFamily: font.black, fontSize: 15, color: c.primary }}>📤 Share</Text></Pressable>
        ) : null,
      }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Card color={c.accent} style={{ padding: 20 }}>
          <View style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', ...border }}>
            <Text style={{ fontSize: 30 }}>{d.activity_icon}</Text>
          </View>
          <H1 style={{ marginTop: 14, fontSize: 28, lineHeight: 32 }}>{planTitle(d)}</H1>
          <Text style={{ fontFamily: font.bold, color: c.ink, marginTop: 8, fontSize: 16 }}>🗓 {fmtDate(d.starts_at)}</Text>
          <Pressable onPress={() => router.push(`/venue/${encodeURIComponent(d.venue_name)}`)}>
            <Text style={{ fontFamily: font.bold, color: c.ink, marginTop: 4, fontSize: 16, textDecorationLine: 'underline' }}>📍 {d.venue_name}</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, gap: 8 }}>
            {d.featured_label ? <Tag label={d.featured_label} color={c.pink} /> : null}
            <Tag label={status.label} color={status.color} />
            {d.skill_level && d.skill_level !== 'Any' ? <Tag label={`${d.skill_level} vibe`} color={c.card} /> : null}
            {detailTags(d.activity_slug, d.category_slug, d.details).map((t) => <Tag key={t} label={t} color={c.card} />)}
            {d.women_only ? <Tag label="👩 women only" color={c.pink} /> : null}
            {d.crew ? <Tag label={`${d.crew.emoji} ${d.crew.name}`} color={c.lilac} /> : null}
          </View>
          {d.status === 'cancelled' && d.cancel_reason ? <Text style={{ marginTop: 12, color: c.ink, fontFamily: font.bold }}>💔 Cancelled: {d.cancel_reason}</Text> : null}
          {d.note ? <Text style={{ marginTop: 14, color: c.ink, fontFamily: font.medium, fontSize: 15, lineHeight: 22 }}>“{d.note}”</Text> : null}
        </Card>

        {checkinOpen && (
          <View style={{ marginTop: 18 }}>
            {d.me_checked_in
              ? <Card color={c.mint}><Text style={{ fontFamily: font.black, color: c.ink, fontSize: 16 }}>✅ You're checked in. Have fun!</Text></Card>
              : <Button variant="pop" title="📍 I'm here, check me in" onPress={async () => { await checkIn(id); load(); }} />}
          </View>
        )}

        {d.is_host && d.pending_requests.length > 0 && d.status !== 'cancelled' && (<>
          <H2>Requests 🙋 ({d.pending_requests.length})</H2>
          <Card>
            {d.status === 'full' && <Muted style={{ marginBottom: 8 }}>The plan is full. Someone has to drop out before you can accept more.</Muted>}
            {d.pending_requests.map((p: any, i: number) => (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
                <Pressable onPress={() => router.push(`/user/${p.id}`)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                  <Avatar url={p.avatar_url} name={p.name} size={40} color={c.accent} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: c.ink, fontFamily: font.bold, fontSize: 15 }} numberOfLines={1}>{p.name}</Text>
                    <Text style={{ color: c.primary, fontFamily: font.semi, fontSize: 12 }}>view profile →</Text>
                  </View>
                </Pressable>
                {responding === p.id ? <ActivityIndicator color={c.primary} /> : (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button small variant="outline" title="Decline" onPress={() => respond(p.id, false)} />
                    <Button small variant="pop" title="Accept" disabled={d.status === 'full'} onPress={() => respond(p.id, true)} />
                  </View>
                )}
              </View>
            ))}
          </Card>
        </>)}

        <H2>The squad</H2>
        <Card>
          <Row name={d.host.name} host avatar={d.host.avatar_url} checkedIn={d.host.checked_in}
            onOpen={() => router.push(`/user/${d.host.id}`)} onMore={!d.is_host && d.is_member ? () => userActions({ id: d.host.id, name: d.host.name }, id, () => router.back()) : undefined} />
          {d.is_member
            ? d.participants.map((p: any) => <Row key={p.id} name={p.name} avatar={p.avatar_url} checkedIn={p.checked_in}
                onOpen={() => router.push(`/user/${p.id}`)} onMore={p.id !== me ? () => userActions({ id: p.id, name: p.name }, id, load) : undefined} />)
            : <Muted style={{ marginTop: 6 }}>{d.slots_filled} joined. Names unlock once you're in 🔓</Muted>}
        </Card>

        {d.is_member && d.status !== 'cancelled' && (<><H2>Group chat 💬</H2><Chat requestId={id} meId={me} /></>)}

        {d.status !== 'cancelled' && <><H2>Where 📍</H2><PlanMap d={d} /></>}

        {d.is_member && started && d.status !== 'cancelled' && (<>
          <H2>Plan album 📸</H2>
          <PlanAlbum requestId={id} activityId={d.activity_id} meId={me} />
          <H2>Give kudos 🙌</H2>
          <KudosPanel requestId={id} meId={me} people={people} given={d.my_kudos} />
        </>)}

        {/* Actions last: cancel / can't make it / ask to join / run it back. */}
        <View style={{ marginTop: 28, gap: 12 }}>
          {d.is_host ? (d.status !== 'cancelled' && !started && <Button variant="outline" title="✕ Cancel or move this plan" onPress={() => setChanging('cancel')} />)
            : d.is_member ? (!started && d.status !== 'cancelled' && <Button variant="outline" title="🙃 Can't make it?" onPress={() => setChanging('leave')} />)
            : d.my_request === 'pending' && !started && d.status !== 'cancelled' ? (<>
                <Card color={c.accent}><Text style={{ fontFamily: font.bold, color: c.ink }}>⏳ Requested. {d.host.name} will let you know.</Text></Card>
                <Button variant="outline" title="Cancel my request" loading={busy} onPress={withdraw} />
              </>)
            : d.my_request === 'declined' ? <Muted>The host couldn't fit you in this time. Plenty more plans nearby!</Muted>
            : d.status === 'open' && !started && <Button variant="pop" title="Ask to join 🙋" loading={busy} onPress={ask} />}
          {d.is_member && started && d.status !== 'cancelled' && (
            <Button title="🔁 Run it back (same squad, next week)" onPress={() => router.push({ pathname: '/request/new', params: { slug: d.activity_slug, from: id } })} />
          )}
        </View>
      </ScrollView>
      {celebration}
      <PlanChangeSheet plan={changing ? d : null} mode={changing ?? 'leave'} onClose={() => setChanging(null)} onDone={load} />
    </KeyboardAvoidingView>
  );
}

function Row({ name, host, avatar, checkedIn, onOpen, onMore }:
  { name: string; host?: boolean; avatar?: string | null; checkedIn?: boolean; onOpen: () => void; onMore?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7 }}>
      <Pressable onPress={onOpen} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
        <Avatar url={avatar} name={name} size={40} color={host ? c.accent : c.lime} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ color: c.ink, fontFamily: font.bold, fontSize: 15 }}>
            {name}{host ? ' 👑' : ''}
          </Text>
          <Text style={{ color: checkedIn ? c.ink : c.primary, fontFamily: font.semi, fontSize: 12 }}>{checkedIn ? '✅ checked in' : 'view profile →'}</Text>
        </View>
      </Pressable>
      {onMore && <Pressable onPress={onMore} hitSlop={10}><Text style={{ fontSize: 22, color: c.muted }}>⋯</Text></Pressable>}
    </View>
  );
}
