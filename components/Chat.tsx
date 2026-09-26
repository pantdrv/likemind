import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, View, Pressable } from 'react-native';
import { supabase } from '../lib/supabase';
import { quickReplies } from '../lib/planCopy';
import { Button, H1, Input, Muted } from './ui';
import { c, font, border, shadow } from '../lib/theme';
import { friendlyError, safe, showError } from '../lib/errors';

const REACTIONS = ['👍', '🔥', '😂', '❤️', '😮'];
const QUICK = ['On my way 🏃', 'Running 10 min late ⏰', "I'm here 👋", "Can't make it 😔"];

// Group chat for a plan (with quick replies, reactions and polls) or a crew (plain messages).
export default function Chat({ requestId, crewId, meId, activitySlug, categorySlug }:
  { requestId?: string; crewId?: string; meId: string; activitySlug?: string; categorySlug?: string }) {
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
      ? 'id, body, kind, poll_options, sender_id, created_at, profiles(full_name), message_reactions(emoji, user_id), poll_votes(option, user_id)'
      : 'id, body, sender_id, created_at, profiles(full_name)';
    const { data, error } = await safe(supabase.from(table).select(cols).eq(key, id).order('created_at', { ascending: false }).limit(200));
    setLoadError(error ? friendlyError(error) : null);
    if (!error) setMsgs(((data ?? []) as any[]).reverse());
  }, [rich, table, key, id]);

  useEffect(() => {
    load();
    let ch = supabase.channel(`chat:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `${key}=eq.${id}` }, load);
    // Reactions and votes have no plan column to filter on; row-level security limits them to this user's plans.
    if (rich) ch = ch
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, load);
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
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
    <View style={{ backgroundColor: c.card, borderRadius: 20, ...border, padding: 12 }}>
      <ScrollView ref={list} style={{ height: 280 }} nestedScrollEnabled keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}>
        {loadError && (
          <Pressable onPress={load} style={{ backgroundColor: c.pink, borderRadius: 12, borderWidth: 1, borderColor: c.line, padding: 10, marginBottom: 10 }}>
            <Text style={{ fontFamily: font.bold, color: c.ink, fontSize: 13 }}>😵‍💫 {loadError} Tap to retry.</Text>
          </Pressable>
        )}
        {msgs.length === 0 && !loadError && <Text style={{ color: c.muted, fontFamily: font.medium, textAlign: 'center', marginTop: 110 }}>No messages yet. Say hi 👋 and lock in the plan.</Text>}
        {msgs.map((item) => {
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
      {rich && (<>
        {/* Suggestions fit the activity, e.g. "Booked seats?" for a movie. */}
        <Text style={{ fontFamily: font.bold, fontSize: 11, color: c.muted, marginTop: 8 }}>Not sure what to say? Tap one</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginTop: 6 }}>
          <Pressable onPress={() => setPollOpen(true)} style={quick}><Text style={quickTxt}>📊 Poll</Text></Pressable>
          {[...quickReplies(activitySlug, categorySlug), ...QUICK].map((q) => <Pressable key={q} onPress={() => send(q)} style={quick}><Text style={quickTxt}>{q}</Text></Pressable>)}
        </ScrollView>
      </>)}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        <TextInput value={text} onChangeText={setText} placeholder={rich ? 'Message the squad (long-press to react)' : 'Message the crew'} placeholderTextColor={c.muted}
          style={{ flex: 1, ...border, backgroundColor: c.bg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, color: c.ink, fontFamily: font.medium }} keyboardAppearance="dark" />
        <Pressable onPress={() => send()} disabled={sending} style={{ opacity: sending ? 0.5 : 1, marginLeft: 8, backgroundColor: c.primary, borderRadius: 20, ...border, paddingHorizontal: 16, paddingVertical: 10 }}>
          <Text style={{ color: c.onNeon, fontFamily: font.black }}>Send ➤</Text>
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

const quick = { borderRadius: 999, borderWidth: 1, borderColor: c.line, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, backgroundColor: c.bg };
const quickTxt = { fontFamily: font.semi, fontSize: 13, color: c.ink };
