import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, View, Pressable } from 'react-native';
import { supabase } from '../lib/supabase';
import { Button, H1, Input, Muted } from './ui';
import { c, font, border } from '../lib/theme';
import { friendlyError, safe, showError } from '../lib/errors';

const REACTIONS = ['👍', '🔥', '😂', '❤️', '😮'];

// Group chat for a plan (with reactions and polls) or a crew (plain messages).
export default function Chat({ requestId, crewId, meId }: { requestId?: string; crewId?: string; meId: string }) {
  const rich = !!requestId;
  const table = rich ? 'messages' : 'crew_messages';
  const key = rich ? 'request_id' : 'crew_id';
  const id = (requestId ?? crewId)!;
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [picking, setPicking] = useState<number | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // A plain ScrollView, not a FlatList: this chat sits inside the page's own ScrollView, and nesting a
  // virtualized list there triggers the "VirtualizedLists should never be nested" error. 200 messages max is fine unvirtualized.
  const list = useRef<ScrollView>(null);

  // Newest 200, shown oldest first. A failed refresh keeps the messages already on screen.
  const load = useCallback(async () => {
    const cols = rich
      // "!…_fkey" names the sender link: reactions and poll votes also connect messages to profiles, and without the
      // hint Supabase can't tell which one is meant and the whole chat fails to load.
      ? 'id, body, kind, poll_options, sender_id, created_at, profiles!messages_sender_id_fkey(full_name), message_reactions!message_reactions_message_id_fkey(emoji, user_id), poll_votes!poll_votes_message_id_fkey(option, user_id)'
      : 'id, body, sender_id, created_at, profiles!crew_messages_sender_id_fkey(full_name)';
    const { data, error } = await safe(supabase.from(table).select(cols).eq(key, id).order('created_at', { ascending: false }).limit(200));
    if (error && __DEV__) console.warn('chat load failed', error);
    setLoadError(error ? friendlyError(error) : null);
    if (!error) setMsgs(((data ?? []) as any[]).reverse());
  }, [rich, table, key, id]);

  useEffect(() => {
    load();
    // Several changes in a row (e.g. a few people reacting) cause one reload, not one each.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reload = () => { clearTimeout(timer); timer = setTimeout(load, 300); };
    // Unique name: a plan's chat can be open twice (e.g. opened again from a notification), and Supabase would
    // otherwise hand back the already-subscribed channel, which can't take new listeners.
    let ch = supabase.channel(`chat:${id}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `${key}=eq.${id}` }, reload);
    // Only this plan's reactions and votes (needs 014_performance.sql). Removing a reaction isn't sent live
    // (Supabase can't filter deletes); it shows on the next reload.
    if (rich) ch = ch
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions', filter: `request_id=eq.${id}` }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes', filter: `request_id=eq.${id}` }, reload);
    ch.subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(ch); };
  }, [id, table, key, rich, load]);

  const send = async (raw = text) => {
    const body = raw.trim();
    if (!body || sending) return;
    if (body.length > 1000) return Alert.alert('Message too long', 'Keep it under 1000 characters.');
    if (raw === text) setText('');
    setSending(true);
    const { error } = await safe(supabase.from(table).insert({ [key]: id, sender_id: meId, body }));
    setSending(false);
    if (error) { showError('Could not send', error); if (raw === text) setText(body); } else load();
  };

  const react = async (m: any, emoji: string) => {
    setPicking(null);
    const mineAlready = m.message_reactions?.some((r: any) => r.user_id === meId && r.emoji === emoji);
    const { error } = mineAlready
      ? await safe(supabase.from('message_reactions').delete().match({ message_id: m.id, user_id: meId, emoji }))
      : await safe(supabase.from('message_reactions').insert({ message_id: m.id, user_id: meId, emoji }));
    if (error) showError('Could not react', error);
    load();
  };

  const vote = async (m: any, option: number) => {
    const { error } = await safe(supabase.from('poll_votes').upsert({ message_id: m.id, user_id: meId, option }));
    if (error) showError('Could not vote', error);
    load();
  };

  return (
    <View style={{ backgroundColor: c.card, borderRadius: 18, ...border, padding: 8 }}>
      <ScrollView ref={list} style={{ height: 130 }} nestedScrollEnabled keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}>
        {loadError && (
          <Pressable onPress={load} style={{ backgroundColor: c.pink, borderRadius: 12, borderWidth: 1, borderColor: c.line, padding: 10, marginBottom: 10 }}>
            <Text style={{ fontFamily: font.bold, color: c.ink, fontSize: 13 }}>😵‍💫 {loadError} Tap to retry.</Text>
          </Pressable>
        )}
        {msgs.length === 0 && !loadError && <Text style={{ color: c.muted, fontFamily: font.medium, textAlign: 'center', marginTop: 44 }}>No messages yet. Say hi 👋 and lock in the plan.</Text>}
        {msgs.map((item) => {
          // Notices written by the server, e.g. "👋 Aarav can't make it", "🗓 Plan moved to Sat 7 PM".
          if (item.kind === 'system') return (
            <Text key={item.id} style={{ alignSelf: 'center', textAlign: 'center', color: c.muted, fontFamily: font.semi, fontSize: 12, backgroundColor: c.raised, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10, overflow: 'hidden' }}>{item.body}</Text>
          );
          const mine = item.sender_id === meId;
          const counts: Record<string, { n: number; me: boolean }> = {};
          for (const r of item.message_reactions ?? []) counts[r.emoji] = { n: (counts[r.emoji]?.n ?? 0) + 1, me: counts[r.emoji]?.me || r.user_id === meId };
          return (
            <View key={item.id} style={{ alignSelf: item.kind === 'poll' ? 'stretch' : mine ? 'flex-end' : 'flex-start', maxWidth: item.kind === 'poll' ? '100%' : '80%', marginBottom: 10 }}>
              {!mine && <Text style={{ fontSize: 11, color: c.muted, fontFamily: font.bold, marginBottom: 2 }}>{item.profiles?.full_name}</Text>}
              {item.kind === 'poll' ? <Poll m={item} meId={meId} onVote={(o) => vote(item, o)} /> : (
                <Pressable onLongPress={() => rich && setPicking(item.id)} delayLongPress={250}
                  style={{ backgroundColor: mine ? c.primary : c.raised, borderRadius: 18, borderBottomRightRadius: mine ? 4 : 18, borderBottomLeftRadius: mine ? 18 : 4, borderWidth: 1, borderColor: c.line, paddingVertical: 8, paddingHorizontal: 12 }}>
                  <Text style={{ color: mine ? c.onNeon : c.ink, fontFamily: font.medium, fontSize: 15 }}>{item.body}</Text>
                </Pressable>
              )}
              {picking === item.id && (
                <View style={{ flexDirection: 'row', backgroundColor: c.card, ...border, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4, alignSelf: mine ? 'flex-end' : 'flex-start' }}>
                  {REACTIONS.map((e) => <Pressable key={e} onPress={() => react(item, e)} hitSlop={4}><Text style={{ fontSize: 22, padding: 4 }}>{e}</Text></Pressable>)}
                </View>
              )}
              {Object.keys(counts).length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4, alignSelf: mine ? 'flex-end' : 'flex-start' }}>
                  {Object.entries(counts).map(([e, v]) => (
                    <Pressable key={e} onPress={() => react(item, e)}
                      style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 999, borderWidth: 1, borderColor: c.line, paddingHorizontal: 7, paddingVertical: 1, backgroundColor: v.me ? c.accent : c.card }}>
                      <Text style={{ fontSize: 13 }}>{e}</Text><Text style={{ fontFamily: font.bold, fontSize: 12, marginLeft: 3, color: c.ink }}>{v.n}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
      {/* One box: poll button (plan chats), the message, and send. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 8, backgroundColor: c.bg, borderRadius: 22, ...border, paddingLeft: rich ? 2 : 10, paddingRight: 3, paddingVertical: 3 }}>
        {rich && (
          <Pressable onPress={() => setPollOpen(true)} hitSlop={6} accessibilityLabel="Create a poll"
            style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 16 }}>📊</Text>
          </Pressable>
        )}
        <TextInput value={text} onChangeText={setText} placeholder={rich ? 'Message the squad (long-press to react)' : 'Message the crew…'} placeholderTextColor={c.muted}
          multiline maxLength={1000} keyboardAppearance={c.scheme}
          style={{ flex: 1, maxHeight: 110, paddingHorizontal: 6, paddingTop: 6, paddingBottom: 6, color: c.ink, fontFamily: font.medium, fontSize: 14 }} />
        <Pressable onPress={() => send()} disabled={sending || !text.trim()} accessibilityLabel="Send"
          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', opacity: sending || !text.trim() ? 0.4 : 1 }}>
          <Text style={{ color: c.onNeon, fontFamily: font.black, fontSize: 16 }}>➤</Text>
        </Pressable>
      </View>
      {rich && <PollComposer open={pollOpen} onClose={() => setPollOpen(false)}
        onCreate={async (question, options) => {
          const { error } = await safe(supabase.from('messages').insert({ request_id: requestId, sender_id: meId, body: question, kind: 'poll', poll_options: options }));
          if (error) showError('Could not create poll', error); else { setPollOpen(false); load(); }
        }} />}
    </View>
  );
}

function Poll({ m, meId, onVote }: { m: any; meId: string; onVote: (o: number) => void }) {
  const votes: any[] = m.poll_votes ?? [];
  const mine = votes.find((v) => v.user_id === meId)?.option;
  return (
    <View style={{ backgroundColor: c.accent, borderRadius: 18, borderWidth: 1, borderColor: c.line, padding: 12 }}>
      <Text style={{ fontFamily: font.black, color: c.ink, fontSize: 15, marginBottom: 8 }}>📊 {m.body}</Text>
      {((m.poll_options ?? []) as string[]).map((opt, i) => {
        const n = votes.filter((v) => v.option === i).length;
        const pct = votes.length ? n / votes.length : 0;
        return (
          <Pressable key={i} onPress={() => onVote(i)} style={{ backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.line, marginBottom: 6, overflow: 'hidden' }}>
            <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct * 100}%`, backgroundColor: mine === i ? c.lime : c.primarySoft }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 10 }}>
              <Text style={{ fontFamily: mine === i ? font.black : font.semi, color: c.ink }}>{mine === i ? '✅ ' : ''}{opt}</Text>
              <Text style={{ fontFamily: font.bold, color: c.ink }}>{n}</Text>
            </View>
          </Pressable>
        );
      })}
      <Text style={{ fontFamily: font.semi, fontSize: 12, color: c.ink, opacity: 0.7 }}>{votes.length} {votes.length === 1 ? 'vote' : 'votes'} · tap to vote or change</Text>
    </View>
  );
}

function PollComposer({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (q: string, options: string[]) => void }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const create = () => {
    const options = opts.map((o) => o.trim()).filter(Boolean);
    if (!q.trim() || options.length < 2) return Alert.alert('Add a question and at least 2 options');
    onCreate(q.trim(), options);
    setQ(''); setOpts(['', '']);
  };
  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, backgroundColor: c.bg, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <H1 style={{ fontSize: 28 }}>New poll 📊</H1>
        <Muted style={{ marginBottom: 16 }}>e.g. "What time works?" or "Which court?"</Muted>
        <Input label="Question" value={q} onChangeText={setQ} maxLength={120} />
        {opts.map((o, i) => (
          <Input key={i} label={`Option ${i + 1}`} value={o} maxLength={60} onChangeText={(t) => setOpts(opts.map((x, j) => (j === i ? t : x)))} />
        ))}
        {opts.length < 4 && <View style={{ marginBottom: 16 }}><Button small variant="outline" title="＋ Add option" onPress={() => setOpts([...opts, ''])} /></View>}
        <Button variant="pop" title="Post poll" onPress={create} />
        <View style={{ height: 12 }} />
        <Button variant="outline" title="Cancel" onPress={onClose} />
      </ScrollView>
    </Modal>
  );
}
