import { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { getCoords } from '../lib/location';
import { Button, Chip, H1, Input, Label, Muted } from './ui';
import { c } from '../lib/theme';
import { safe, showError } from '../lib/errors';

const HOURS = [1, 2, 3, 4];

// "I'm free": tell nearby people you're up for something for the next few hours.
export default function FreeSheet({ open, onClose, onSaved, activities, defaults }:
  { open: boolean; onClose: () => void; onSaved: () => void; activities: { slug: string; name: string; icon: string }[]; defaults: string[] }) {
  const [hours, setHours] = useState(2);
  const [picked, setPicked] = useState<string[]>(defaults);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setPicked(defaults); }, [open, defaults]);

  const save = async () => {
    setBusy(true);
    const pos = await getCoords();
    if (!pos) { setBusy(false); return Alert.alert('Location needed', 'Allow location access so nearby people can see you are free.'); }
    const { error } = await safe(supabase.rpc('set_free', { p_hours: hours, p_slugs: picked, p_note: note, p_lat: pos.lat, p_lng: pos.lng }));
    setBusy(false);
    if (error) return showError('Could not save', error);
    onSaved();
    onClose();
  };

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60, backgroundColor: c.bg, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <H1 style={{ fontSize: 30 }}>I'm free 🙋</H1>
        <Muted style={{ marginBottom: 20 }}>People nearby into the same stuff can see you and invite you to their plans. Only your approximate area (~1 km) is shared.</Muted>
        <Label>For the next</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
          {HOURS.map((h) => <Chip key={h} label={`${h} ${h === 1 ? 'hour' : 'hours'}`} color={c.accent} active={h === hours} onPress={() => setHours(h)} />)}
        </View>
        <Label>Down for</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
          {activities.map((a) => (
            <Chip key={a.slug} label={`${a.icon} ${a.name}`} active={picked.includes(a.slug)}
              onPress={() => setPicked(picked.includes(a.slug) ? picked.filter((x) => x !== a.slug) : [...picked, a.slug])} />
          ))}
        </View>
        <Input label="Note (optional)" value={note} onChangeText={setNote} maxLength={80} placeholder="e.g. have 2 rackets, near Indiranagar" />
        <Button variant="pop" title="Let people know ✨" onPress={save} loading={busy} />
        <View style={{ height: 12 }} />
        <Button variant="outline" title="Cancel" onPress={onClose} />
      </ScrollView>
    </Modal>
  );
}
