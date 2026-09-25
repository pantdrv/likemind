import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { KUDOS } from '../lib/engage';
import Avatar from './Avatar';
import { c, font, border, shadow } from '../lib/theme';

type Person = { id: string; name: string; avatar_url?: string | null };

// Tap tags to give (or take back) kudos to each person in the plan.
export default function KudosPanel({ requestId, meId, people, given }:
  { requestId: string; meId: string; people: Person[]; given: { receiver_id: string; tag: string }[] }) {
  const [mine, setMine] = useState(() => new Set(given.map((g) => `${g.receiver_id}:${g.tag}`)));
  const others = people.filter((p) => p.id !== meId);
  if (!others.length) return null;

  const toggle = async (receiver: string, tag: string) => {
    const k = `${receiver}:${tag}`;
    const next = new Set(mine);
    if (next.has(k)) next.delete(k); else next.add(k);
    setMine(next);
    const { error } = await supabase.rpc('toggle_kudos', { p_request: requestId, p_receiver: receiver, p_tag: tag });
    if (error) { Alert.alert('Could not save kudos', error.message); setMine(mine); }
  };

  return (
    <View style={{ backgroundColor: c.card, borderRadius: 22, ...border, ...shadow(4), padding: 14 }}>
      {others.map((p, i) => (
        <View key={p.id} style={{ paddingVertical: 8, borderTopWidth: i ? 1.5 : 0, borderColor: '#E8E1D6' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Avatar url={p.avatar_url} name={p.name} size={30} />
            <Text style={{ marginLeft: 8, fontFamily: font.bold, color: c.ink, fontSize: 15 }}>{p.name}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {KUDOS.map((k) => {
              const on = mine.has(`${p.id}:${k.tag}`);
              return (
                <Pressable key={k.tag} onPress={() => toggle(p.id, k.tag)}
                  style={{ borderRadius: 999, borderWidth: 1.5, borderColor: c.ink, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: on ? c.accent : c.bg }}>
                  <Text style={{ fontFamily: on ? font.black : font.semi, fontSize: 13, color: c.ink }}>{k.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
