import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { shareCrew } from '../../lib/engage';
import { Button, Card, Empty, ErrorState, H1, H2, Muted } from '../../components/ui';
import Avatar from '../../components/Avatar';
import Chat from '../../components/Chat';
import { c, font, border, shadow, fmtDate, planTitle } from '../../lib/theme';
import { friendlyError, safe, showError } from '../../lib/errors';

export default function CrewPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const [crew, setCrew] = useState<any | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await safe(supabase.rpc('crew_detail', { p_crew: id }));
    setError(error ? friendlyError(error) : null);
    if (!error) setCrew(data ?? null);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const leave = () => Alert.alert(`Leave ${crew.name}?`, 'You can rejoin later with the code.', [{ text: 'Stay' }, {
    text: 'Leave', style: 'destructive', onPress: async () => {
      const { error } = await safe(supabase.rpc('leave_crew', { p_crew: id }));
      if (error) showError('Could not leave', error); else router.back();
    },
  }]);

  if (crew === undefined) return error ? <ErrorState message={error} onRetry={load} /> : <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />;
  if (crew === null) return <Empty emoji="🫥" text="You're not in this crew." />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: `${crew.emoji} ${crew.name}` }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Card color={c.lilac} style={{ padding: 20 }}>
          <Text style={{ fontSize: 44 }}>{crew.emoji}</Text>
          <H1 style={{ fontSize: 30, marginTop: 6 }}>{crew.name}</H1>
          <Text style={{ fontFamily: font.bold, color: c.ink, marginTop: 4 }}>{crew.activity ? `${crew.activity.icon} ${crew.activity.name}` : '✨ Anything'} · {crew.members?.length ?? 0} members</Text>
          <Pressable onPress={() => shareCrew(crew)} style={{ marginTop: 14, alignSelf: 'flex-start', backgroundColor: c.card, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, ...border, ...shadow(3) }}>
            <Text style={{ fontFamily: font.black, color: c.ink }}>Code: {crew.code}  ·  📤 Invite</Text>
          </Pressable>
        </Card>

        <H2>Members</H2>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {(crew.members ?? []).map((m: any) => (
            <Pressable key={m.id} onPress={() => router.push(`/user/${m.id}`)} style={{ alignItems: 'center', marginRight: 14, width: 64 }}>
              <Avatar url={m.avatar_url} name={m.name} size={52} />
              <Text numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 12, color: c.ink, marginTop: 4 }}>{String(m.name ?? '').split(' ')[0]}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <H2>Crew plans</H2>
        {!crew.plans?.length ? <Muted style={{ marginBottom: 10 }}>No plans yet. Start one and the whole crew gets pinged.</Muted> : crew.plans.map((p: any) => (
          <Pressable key={p.id} onPress={() => router.push(`/request/${p.id}`)} style={{ backgroundColor: c.card, borderRadius: 18, padding: 14, marginBottom: 10, ...border, ...shadow(3) }}>
            <Text style={{ fontFamily: font.black, color: c.ink, fontSize: 16 }}>{p.activity_icon} {planTitle(p)}</Text>
            <Muted>{fmtDate(p.starts_at)} · 📍 {p.venue_name}</Muted>
            <Text style={{ fontFamily: font.bold, color: c.primary, marginTop: 2 }}>{p.open_ended ? `${p.slots_filled} going · open to anyone` : `${p.slots_filled}/${p.slots_total} joined`}</Text>
          </Pressable>
        ))}
        {crew.activity && <Button variant="pop" title="＋ Start a crew plan" onPress={() => router.push({ pathname: '/request/new', params: { slug: crew.activity.slug, crew: id } })} />}

        <H2>Crew chat 💬</H2>
        <Chat crewId={id} meId={session!.user.id} />

        <View style={{ marginTop: 30 }}><Button variant="outline" title="Leave crew" onPress={leave} /></View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
