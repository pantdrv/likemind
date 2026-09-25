import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Button, Chip, Empty, ErrorState, H1, Input, Label, Muted } from '../../components/ui';
import { c, font, border, shadow, pressedOffset, tileColor, fmtDate } from '../../lib/theme';
import { friendlyError, safe, showError } from '../../lib/errors';

const EMOJIS = ['👯', '🏸', '⚽', '🏏', '🎮', '🛍️', '🔥', '🦈', '🐐', '🌙'];

// Crews: lasting groups with their own chat and crew plans. Join with a 6-letter code.
export default function Crews() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const [crews, setCrews] = useState<any[] | null>(null);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await safe(supabase.rpc('my_crews'));
    setError(error ? friendlyError(error) : null);
    if (!error) setCrews(data ?? []);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { if (params.code) setCode(String(params.code)); }, [params.code]);

  const join = async () => {
    if (code.trim().length < 4) return Alert.alert('Enter the crew code', 'Ask a crew member to share it with you.');
    setJoining(true);
    const { data, error } = await safe(supabase.rpc('join_crew', { p_code: code.trim() }));
    setJoining(false);
    if (error) return showError('Could not join', error);
    setCode('');
    router.push(`/crew/${data}`);
  };

  if (!crews) return error ? <ErrorState message={error} onRetry={load} /> : <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />;
  return (
    <>
      <FlatList data={crews} keyExtractor={(x) => x.id} contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Button variant="pop" title="＋ Start a crew" onPress={() => setCreating(true)} />
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 14 }}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Input label="Got a code?" value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" maxLength={6} placeholder="ABC123" />
              </View>
              <View style={{ marginBottom: 16 }}><Button title="Join" onPress={join} loading={joining} /></View>
            </View>
          </View>
        }
        ListEmptyComponent={<Empty emoji="👯" text="No crews yet. Start one for your regular squad (Sunday football, FIFA nights…) or join with a code." />}
        renderItem={({ item, index }) => (
          <Pressable onPress={() => router.push(`/crew/${item.id}`)}
            style={({ pressed }) => [{ backgroundColor: tileColor(index + 1), borderRadius: 22, padding: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center', ...border },
              pressed ? pressedOffset(3) : shadow(4)]}>
            <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', ...border }}>
              <Text style={{ fontSize: 28 }}>{item.emoji}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontFamily: font.black, fontSize: 18, color: c.ink }}>{item.name}</Text>
              <Text style={{ fontFamily: font.semi, color: c.ink, opacity: 0.8 }}>{item.activity_icon ?? '✨'} {item.activity_name ?? 'Anything'} · {item.members} {item.members === 1 ? 'member' : 'members'}</Text>
              <Text style={{ fontFamily: font.semi, color: c.ink, opacity: 0.8, fontSize: 12 }}>{item.next_plan ? `Next: ${fmtDate(item.next_plan)}` : 'No plan yet'}</Text>
            </View>
          </Pressable>
        )} />
      <NewCrew open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); router.push(`/crew/${id}`); }} />
    </>
  );
}

function NewCrew({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('👯');
  const [slug, setSlug] = useState<string | null>(null);
  const [acts, setActs] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [actsError, setActsError] = useState<string | null>(null);
  const loadActs = useCallback(async () => {
    const { data, error } = await safe(supabase.from('activities').select('slug, name, icon, categories(sort)').order('sort'));
    setActsError(error ? friendlyError(error) : null);
    if (!error) setActs((data ?? []).sort((x: any, y: any) => (x.categories?.sort ?? 0) - (y.categories?.sort ?? 0)));
  }, []);
  useEffect(() => { if (open) loadActs(); }, [open, loadActs]);

  const create = async () => {
    if (name.trim().length < 2) return Alert.alert('Give your crew a name');
    if (!slug) return Alert.alert('Pick what the crew does', 'Crew plans use this activity.');
    setBusy(true);
    const { data, error } = await safe(supabase.rpc('create_crew', { p_name: name.trim(), p_emoji: emoji, p_slug: slug }));
    setBusy(false);
    if (error) return showError('Could not create crew', error);
    setName(''); setSlug(null);
    onCreated(data);
  };

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, backgroundColor: c.bg, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <H1 style={{ fontSize: 30 }}>New crew 👯</H1>
        <Muted style={{ marginBottom: 18 }}>Your regular squad, in one place. Share the code to bring people in.</Muted>
        <Input label="Crew name" value={name} onChangeText={setName} maxLength={40} placeholder="e.g. Sunday Smashers" />
        <Label>Vibe</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
          {EMOJIS.map((e) => <Chip key={e} label={e} color={c.accent} active={e === emoji} onPress={() => setEmoji(e)} />)}
        </View>
        <Label>What do you do?</Label>
        {actsError && <View style={{ marginBottom: 12 }}><Muted style={{ marginBottom: 8 }}>Couldn't load activities. {actsError}</Muted><Button small variant="outline" title="↻ Try again" onPress={loadActs} /></View>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
          {acts.map((a) => <Chip key={a.slug} label={`${a.icon} ${a.name}`} active={a.slug === slug} onPress={() => setSlug(a.slug)} />)}
        </View>
        <Button variant="pop" title="Create crew ✨" onPress={create} loading={busy} />
        <View style={{ height: 12 }} />
        <Button variant="outline" title="Cancel" onPress={onClose} />
      </ScrollView>
    </Modal>
  );
}
