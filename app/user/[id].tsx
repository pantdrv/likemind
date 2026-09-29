import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { userActions } from '../../lib/safety';
import { photoUrl } from '../../lib/photos';
import { Button, Card, Empty, ErrorState, H1, H2, Muted, Tag } from '../../components/ui';
import { friendlyError, safe, showError } from '../../lib/errors';
import { kudosLabel } from '../../lib/engage';
import Avatar from '../../components/Avatar';
import PhotoViewer from '../../components/PhotoViewer';
import { c, font, border, shadow, catStyle, fmtDate, planTitle } from '../../lib/theme';
import { Image as CachedImage } from 'expo-image';

// Someone's public profile: photos, bio, badges, kudos and interests. Opened from plans and alerts.
export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [p, setP] = useState<any | null | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [viewing, setViewing] = useState<{ uri: string; caption?: string } | null>(null);
  const [myPlans, setMyPlans] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Invite them to one of my upcoming open plans.
  const openInvite = async () => {
    const { data, error } = await safe(supabase.rpc('my_requests'));
    if (error) return showError('Could not load your plans', error);
    setMyPlans((data ?? []).filter((r: any) => r.status === 'open' && new Date(r.starts_at) > new Date()));
  };
  const invite = async (planId: string) => {
    setMyPlans(null);
    const { error } = await safe(supabase.rpc('invite_to_plan', { p_request: planId, p_user: id }));
    if (error) showError('Could not invite', error); else Alert.alert('Invite sent 🙌', `${p.name} will get an alert.`);
  };

  const load = useCallback(async () => {
    const { data, error } = await safe(supabase.rpc('public_profile', { p_user: id }));
    setError(error ? friendlyError(error) : null);
    if (!error) setP(data ?? null);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (p === undefined) return error ? <ErrorState message={error} onRetry={load} /> : <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />;
  if (p === null) return <Empty emoji="🫥" text="This profile isn't available." />;

  const isMe = id === session?.user.id;
  const slide = width - 40 - 4; // screen padding and the carousel border
  p.photos ??= []; p.interests ??= [];
  const since = new Date(p.member_since).toLocaleDateString([], { month: 'short', year: 'numeric' });
  const stats = { streak: 0, badges: [], kudos: {}, ...p.stats, show_up: p.stats?.show_up ?? { checked: 0, due: 0 } };
  // Streaks are hidden for now (MVP): the "On fire" badge is still earned on the server but not shown.
  stats.badges = (stats.badges as any[]).filter((b) => b.id !== 'on_fire');
  const showUp = stats.show_up.due > 0;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Stack.Screen options={{
        title: isMe ? 'Your profile' : p.name,
        headerRight: isMe ? undefined : () => (
          <Pressable hitSlop={10} onPress={() => userActions({ id: p.id, name: p.name }, null, () => router.back())}>
            <Text style={{ fontSize: 24, color: c.ink }}>⋯</Text>
          </Pressable>
        ),
      }} />

      {p.photos.length > 0 ? (
        <View style={{ borderRadius: 24, overflow: 'hidden', ...border, ...shadow(4), marginBottom: 16 }}>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / slide))}>
            {p.photos.map((ph: any) => (
              <Pressable key={ph.id} onPress={() => setViewing({ uri: photoUrl(ph.path) })}>
                <CachedImage source={{ uri: photoUrl(ph.path) }} style={{ width: slide, aspectRatio: 4 / 5 }} contentFit="cover" cachePolicy="disk" />
              </Pressable>
            ))}
          </ScrollView>
          {p.photos.length > 1 && (
            <View style={{ position: 'absolute', top: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
              {p.photos.map((ph: any, i: number) => (
                <View key={ph.id} style={{ width: i === page ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i === page ? c.accent : 'rgba(255,255,255,0.75)', borderWidth: 1, borderColor: c.line }} />
              ))}
            </View>
          )}
        </View>
      ) : (
        <View style={{ alignItems: 'center', marginBottom: 12 }}><Avatar name={p.name} size={110} color={c.pink} /></View>
      )}

      <H1 style={{ fontSize: 32 }}>{p.name}</H1>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {p.plans_done === 0 && <Tag label="new here ✨" color={c.accent} />}
        <Tag label={`${p.plans_done} ${p.plans_done === 1 ? 'plan' : 'plans'} done`} color={c.lime} />
        {showUp && <Tag label={`✅ showed up ${stats.show_up.checked}/${stats.show_up.due}`} color={c.mint} />}
        {p.played_together > 0 && <Tag label={`⭐ ${p.played_together} plans with you`} color={c.lilac} />}
        <Tag label={`since ${since}`} color={c.card} />
      </View>
      {p.free_until && (
        // What they're free for right now, and their note (from "I'm free").
        <Card color={c.mint} style={{ marginTop: 12, padding: 14 }}>
          <Text style={{ fontFamily: font.black, color: c.ink, fontSize: 15 }}>
            🙋 Free till {new Date(p.free_until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </Text>
          <Text style={{ fontFamily: font.bold, color: c.ink, marginTop: 4 }}>
            {(p.free_for ?? []).length ? p.free_for.map((a: any) => `${a.icon} ${a.name}`).join(' · ') : '✨ Up for anything'}
          </Text>
          {p.free_note ? <Text style={{ fontFamily: font.medium, color: c.ink, opacity: 0.8, fontStyle: 'italic', marginTop: 4 }}>“{p.free_note}”</Text> : null}
        </Card>
      )}
      {!isMe && <View style={{ marginTop: 14 }}><Button variant="pop" title="🙌 Invite to a plan" onPress={openInvite} /></View>}
      {p.bio ? (
        <Card color={c.card} style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: font.medium, fontSize: 16, color: c.ink, lineHeight: 23 }}>“{p.bio}”</Text>
        </Card>
      ) : null}

      {stats.badges.length > 0 && (<>
        <H2>Badges</H2>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {stats.badges.map((b: any) => (
            <View key={b.id} style={{ alignItems: 'center', width: 78 }}>
              <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', ...border, ...shadow(3) }}>
                <Text style={{ fontSize: 28 }}>{b.emoji}</Text>
              </View>
              <Text style={{ fontFamily: font.bold, fontSize: 11, color: c.ink, textAlign: 'center', marginTop: 4 }}>{b.label}</Text>
            </View>
          ))}
        </View>
      </>)}

      {Object.keys(stats.kudos).length > 0 && (<>
        <H2>Kudos from the squad</H2>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {Object.entries(stats.kudos).map(([tag, n]) => <Tag key={tag} label={`${kudosLabel(tag)} ×${n}`} color={c.lime} />)}
        </View>
      </>)}

      <H2>Into</H2>
      {p.interests.length === 0 ? <Muted>Nothing picked yet.</Muted> : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {p.interests.map((a: any) => <Tag key={a.slug} label={`${a.icon} ${a.name}`} color={catStyle(a.category).color} />)}
        </View>
      )}

      <PhotoViewer uri={viewing?.uri ?? null} caption={viewing?.caption} onClose={() => setViewing(null)} />
      <Modal visible={!!myPlans} transparent animationType="fade" onRequestClose={() => setMyPlans(null)}>
        <Pressable onPress={() => setMyPlans(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <Pressable style={{ backgroundColor: c.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 40, borderWidth: 1, borderColor: c.line }}>
            <H2 style={{ marginTop: 0 }}>Invite {String(p.name ?? '').split(' ')[0]} to…</H2>
            {myPlans?.length === 0 && <Muted style={{ marginBottom: 12 }}>You have no open plans. Start one first, then invite them.</Muted>}
            {myPlans?.map((r) => (
              <Pressable key={r.id} onPress={() => invite(r.id)} style={{ backgroundColor: c.card, borderRadius: 16, padding: 12, marginBottom: 8, ...border }}>
                <Text style={{ fontFamily: font.black, color: c.ink }}>{r.activity_icon} {planTitle(r)}</Text>
                <Muted>{fmtDate(r.starts_at)} · {r.venue_name}</Muted>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}
