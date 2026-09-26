import { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { supabase } from '../lib/supabase';
import { safe, showError } from '../lib/errors';
import { Button, Chip, H1, Input, Label, Muted } from './ui';
import { c, font, border, fmtDate, planTitle } from '../lib/theme';

export type ChangeMode = 'cancel' | 'leave';
type Plan = { id: string; title?: string | null; activity_name?: string; activity_icon?: string; starts_at: string };

const CANCEL_REASONS = ['🌧 Weather', '🏟 Venue not available', '👥 Not enough people', '🤒 Not feeling well', '🙃 Something came up'];
const LEAVE_REASONS = ['🙃 Something came up', '🤒 Not feeling well', '📅 Clashing plan', "🚗 Can't get there"];
const LATE = [10, 20, 30];
const OTHER = '✏️ Other';

// Bottom sheet for changing plans. Host: cancel with a reason, or move the time instead.
// Joiner: drop out with a reason, or just tell the squad you're running late. No penalties either way.
export default function PlanChangeSheet({ plan, mode, onClose, onDone }:
  { plan: Plan | null; mode: ChangeMode; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [moving, setMoving] = useState(false);
  const [when, setWhen] = useState(new Date());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!plan) return;
    setReason(null); setOther(''); setMoving(false); setBusy(false);
    // Default the new time to the old one (or an hour from now if that has passed).
    setWhen(new Date(Math.max(new Date(plan.starts_at).getTime(), Date.now() + 3600_000)));
  }, [plan]);

  if (!plan) return null;
  const host = mode === 'cancel';
  const reasons = host ? CANCEL_REASONS : LEAVE_REASONS;
  // Stored without the emoji, e.g. "Venue not available".
  const finalReason = reason === OTHER ? other.trim() : reason ? reason.replace(/^\S+\s/, '') : '';

  const confirm = async () => {
    if (reason === OTHER && !other.trim()) return Alert.alert('Add a reason', 'Type a quick reason, or pick one of the options.');
    setBusy(true);
    const { error } = await safe(supabase.rpc(host ? 'cancel_request' : 'leave_request', { p_request: plan.id, p_reason: finalReason || null }));
    setBusy(false);
    if (error) return showError(host ? 'Could not cancel' : 'Could not drop out', error);
    onClose();
    onDone();
  };

  const move = async () => {
    if (when.getTime() <= Date.now()) return Alert.alert('Pick a time in the future');
    setBusy(true);
    const { error } = await safe(supabase.rpc('reschedule_request', { p_request: plan.id, p_starts: when.toISOString() }));
    setBusy(false);
    if (error) return showError('Could not move the plan', error);
    onClose();
    onDone();
    Alert.alert('Plan moved 🗓', `Everyone who joined got an alert about the new time: ${fmtDate(when.toISOString())}.`);
  };

  const late = async (min: number) => {
    setBusy(true);
    const { data: auth } = await supabase.auth.getSession();
    const { error } = await safe(supabase.from('messages').insert({ request_id: plan.id, sender_id: auth.session?.user.id, body: `⏰ Running about ${min} min late, still coming!` }));
    setBusy(false);
    if (error) return showError('Could not tell the squad', error);
    onClose();
    Alert.alert('Squad told ⏰', "We posted it in the group chat. See you there!");
  };

  const pickAndroid = (m: 'date' | 'time') =>
    DateTimePickerAndroid.open({
      value: when, mode: m, minimumDate: new Date(),
      onChange: (_, d) => {
        if (!d) return;
        const n = new Date(when);
        if (m === 'date') n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); else n.setHours(d.getHours(), d.getMinutes());
        setWhen(n);
      },
    });

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, paddingBottom: 48, backgroundColor: c.bg, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontFamily: font.bold, color: c.muted, fontSize: 13 }}>{plan.activity_icon} {planTitle(plan)} · {fmtDate(plan.starts_at)}</Text>
        <H1 style={{ fontSize: 30, lineHeight: 34, marginTop: 6 }}>{host ? 'Cancel this plan?' : "Can't make it?"}</H1>
        <Muted style={{ marginTop: 6, marginBottom: 18 }}>
          {host ? 'Everyone who joined gets an alert with your reason.' : 'No worries, it happens. The host gets a heads-up and your spot opens up for someone else.'}
        </Muted>

        {/* The softer option first */}
        {host ? (
          <View style={{ backgroundColor: c.card, borderRadius: 18, padding: 14, marginBottom: 20, ...border }}>
            <Pressable onPress={() => setMoving(!moving)} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 22, marginRight: 10 }}>🗓</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.black, color: c.ink, fontSize: 16 }}>Move the time instead?</Text>
                <Muted style={{ fontSize: 13 }}>Keeps the squad together. Everyone gets the new time.</Muted>
              </View>
              <Text style={{ color: c.primary, fontFamily: font.black }}>{moving ? '▲' : '▼'}</Text>
            </Pressable>
            {moving && (
              <View style={{ marginTop: 14 }}>
                {Platform.OS === 'ios' ? (
                  <View style={{ alignItems: 'flex-start', marginBottom: 12 }}>
                    <DateTimePicker value={when} mode="datetime" minimumDate={new Date()} themeVariant="dark" onChange={(_, d) => d && setWhen(d)} />
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                    <Button small variant="outline" title="Change date" onPress={() => pickAndroid('date')} />
                    <Button small variant="outline" title="Change time" onPress={() => pickAndroid('time')} />
                    <Text style={{ color: c.ink, fontFamily: font.bold }}>{fmtDate(when.toISOString())}</Text>
                  </View>
                )}
                <Button variant="pop" title="Move plan" onPress={move} loading={busy} />
              </View>
            )}
          </View>
        ) : (
          <View style={{ backgroundColor: c.card, borderRadius: 18, padding: 14, marginBottom: 20, ...border }}>
            <Text style={{ fontFamily: font.black, color: c.ink, fontSize: 16 }}>⏰ Just running late?</Text>
            <Muted style={{ fontSize: 13, marginBottom: 10 }}>Let the squad know in the chat. You stay in the plan.</Muted>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {LATE.map((m) => <Chip key={m} label={`~${m} min`} color={c.orange} onPress={() => late(m)} />)}
            </View>
          </View>
        )}

        <Label>{host ? 'Why are you cancelling?' : "What's up?"} (optional)</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
          {[...reasons, OTHER].map((r) => <Chip key={r} label={r} color={c.pink} active={reason === r} onPress={() => setReason(reason === r ? null : r)} />)}
        </View>
        {reason === OTHER && <Input value={other} onChangeText={setOther} maxLength={200} placeholder="Type a quick reason" autoFocus />}

        <View style={{ marginTop: 8, gap: 12 }}>
          <Button variant="danger" title={host ? 'Cancel plan' : 'Drop out'} onPress={confirm} loading={busy && !moving} />
          <Button variant="outline" title={host ? 'Keep the plan' : "I'll still come"} onPress={onClose} disabled={busy} />
        </View>
      </ScrollView>
    </Modal>
  );
}
