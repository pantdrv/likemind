import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { userActions } from '../../lib/safety';
import { checkIn, sharePlan } from '../../lib/engage';
import { detailTags } from '../../lib/planCopy';
import { Button, Card, Empty, H1, H2, Muted, Tag } from '../../components/ui';
import Chat from '../../components/Chat';
import RatePeople from '../../components/RatePeople';
import PlanMap from '../../components/PlanMap';
import Avatar from '../../components/Avatar';
import KudosPanel from '../../components/KudosPanel';
import PlanAlbum from '../../components/PlanAlbum';
import { c, font, border, fmtDate, planTitle } from '../../lib/theme';

export default function RequestDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const me = session!.user.id;
  const router = useRouter();
  const [d, setD] = useState<any | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('request_detail', { p_id: id });
    if (error) Alert.alert('Could not load', error.message);
    setD(data ?? null);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = async (fn: string, okMsg?: string) => {
    setBusy(true);
    const { error } = await supabase.rpc(fn, { p_request: id });
    setBusy(false);
    if (error) Alert.alert('Something went wrong', error.message); else if (okMsg) Alert.alert(okMsg);
    load();
  };

  if (d === undefined) return <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />;
  if (d === null) return <Empty emoji="🫥" text="This plan isn't available anymore." />;

  const now = Date.now();
  const start = new Date(d.starts_at).getTime();
  const started = start <= now;
  const checkinOpen = d.is_member && d.checkin_enabled && d.status !== 'cancelled' && now >= start - 30 * 60_000 && now <= start + 3 * 3600_000;
  const left = d.slots_total - d.slots_filled;
  const people = [{ id: d.host.id, name: d.host.name, avatar_url: d.host.avatar_url }, ...d.participants.map((p: any) => ({ id: p.id, name: p.name, avatar_url: p.avatar_url }))];
  const status = d.status === 'cancelled' ? { label: 'cancelled 💔', color: c.danger }
    : d.status === 'full' ? { label: 'squad full 🔒', color: c.lilac }
    : { label: `${left} ${left === 1 ? 'spot' : 'spots'} left`, color: c.lime };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{
        headerRight: () => d.status !== 'cancelled' ? (
          <Pressable hitSlop={10} onPress={() => sharePlan({ ...d, id })}><Text style={{ fontFamily: font.black, fontSize: 15, color: c.primary }}>📤 Share</Text></Pressable>
        ) : null,
      }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Card color={c.accent} style={{ padding: 20 }}>
          <View style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', ...border, transform: [{ rotate: '-6deg' }] }}>
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
          {d.note ? <Text style={{ marginTop: 14, color: c.ink, fontFamily: font.medium, fontSize: 15, lineHeight: 22 }}>“{d.note}”</Text> : null}
        </Card>

        {checkinOpen && (
          <View style={{ marginTop: 18 }}>
            {d.me_checked_in
              ? <Card color={c.mint}><Text style={{ fontFamily: font.black, color: c.ink, fontSize: 16 }}>✅ You're checked in. Have fun!</Text></Card>
              : <Button variant="pop" title="📍 I'm here, check me in" onPress={async () => { await checkIn(id); load(); }} />}
          </View>
        )}

        <H2>The squad</H2>
        <Card>
          <Row name={d.host.name} host avatar={d.host.avatar_url} verified={d.host.verified} checkedIn={d.host.checked_in} rating={d.host.rating}
            onOpen={() => router.push(`/user/${d.host.id}`)} onMore={!d.is_host && d.is_member ? () => userActions({ id: d.host.id, name: d.host.name }, id, () => router.back()) : undefined} />
          {d.is_member
            ? d.participants.map((p: any) => <Row key={p.id} name={p.name} avatar={p.avatar_url} verified={p.verified} checkedIn={p.checked_in} rating={p.rating}
                onOpen={() => router.push(`/user/${p.id}`)} onMore={p.id !== me ? () => userActions({ id: p.id, name: p.name }, id, load) : undefined} />)
            : <Muted style={{ marginTop: 6 }}>{d.slots_filled} joined. Names unlock once you're in 🔓</Muted>}
        </Card>

        {d.status !== 'cancelled' && <><H2>Where 📍</H2><PlanMap d={d} /></>}

        <View style={{ marginTop: 24, gap: 12 }}>
          {d.is_host ? (d.status !== 'cancelled' && !started && <Button variant="danger" title="Cancel this plan" loading={busy} onPress={() => Alert.alert('Cancel plan?', 'Everyone who joined will lose their spot.', [{ text: 'Keep' }, { text: 'Cancel plan', style: 'destructive', onPress: () => act('cancel_request') }])} />)
            : d.is_member ? (!started && <Button variant="outline" title="Leave this plan" loading={busy} onPress={() => act('leave_request')} />)
            : d.status === 'open' && !started && <Button variant="pop" title="I'm in 🙌" loading={busy} onPress={() => act('join_request', "You're in! 🎉")} />}
          {d.is_member && started && d.status !== 'cancelled' && (
            <Button title="🔁 Run it back (same squad, next week)" onPress={() => router.push({ pathname: '/request/new', params: { slug: d.activity_slug, from: id } })} />
          )}
        </View>

        {d.is_member && started && d.status !== 'cancelled' && (<>
          <H2>Plan album 📸</H2>
          <PlanAlbum requestId={id} activityId={d.activity_id} meId={me} />
          <H2>Give kudos 🙌</H2>
          <KudosPanel requestId={id} meId={me} people={people} given={d.my_kudos} />
          <H2>Rate the squad ⭐</H2>
          <RatePeople requestId={id} meId={me} people={people} />
        </>)}
        {d.is_member && d.status !== 'cancelled' && (<><H2>Group chat 💬</H2><Chat requestId={id} meId={me} /></>)}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Row({ name, rating, host, avatar, verified, checkedIn, onOpen, onMore }:
  { name: string; rating: number; host?: boolean; avatar?: string | null; verified?: boolean; checkedIn?: boolean; onOpen: () => void; onMore?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 7 }}>
      <Pressable onPress={onOpen} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
        <Avatar url={avatar} name={name} size={40} color={host ? c.accent : c.lime} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ color: c.ink, fontFamily: font.bold, fontSize: 15 }}>
            {name}{verified ? ' ☑️' : ''}{host ? ' 👑' : ''}{Number(rating) > 0 ? `   ★ ${Number(rating).toFixed(1)}` : ''}
          </Text>
          <Text style={{ color: checkedIn ? c.ink : c.primary, fontFamily: font.semi, fontSize: 12 }}>{checkedIn ? '✅ checked in' : 'view profile →'}</Text>
        </View>
      </Pressable>
      {onMore && <Pressable onPress={onMore} hitSlop={10}><Text style={{ fontSize: 22, color: c.muted }}>⋯</Text></Pressable>}
    </View>
  );
}
