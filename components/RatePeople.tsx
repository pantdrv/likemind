import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { c, font, border, shadow } from '../lib/theme';
import { safe, showError } from '../lib/errors';

export default function RatePeople({ requestId, meId, people }: { requestId: string; meId: string; people: { id: string; name: string }[] }) {
  const [given, setGiven] = useState<Record<string, number>>({});

  useEffect(() => {
    // If this fails, stars just start empty; rating again is rejected by the server as a duplicate, which showError explains.
    safe(supabase.from('ratings').select('ratee_id, score').eq('request_id', requestId).eq('rater_id', meId))
      .then(({ data }) => setGiven(Object.fromEntries((data ?? []).map((r: any) => [r.ratee_id, r.score]))));
  }, [requestId]);

  const rate = async (id: string, score: number) => {
    const { error } = await safe(supabase.rpc('rate_user', { p_request: requestId, p_ratee: id, p_score: score }));
    if (error) showError('Could not rate', error); else setGiven((g) => ({ ...g, [id]: score }));
  };

  const others = people.filter((p) => p.id !== meId);
  if (!others.length) return null;
  return (
    <View style={{ backgroundColor: c.card, borderRadius: 22, ...border, ...shadow(4), padding: 14 }}>
      {others.map((p) => (
        <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
          <Text style={{ color: c.ink, fontFamily: font.bold, fontSize: 15 }}>{p.name}</Text>
          <View style={{ flexDirection: 'row' }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} disabled={!!given[p.id]} onPress={() => rate(p.id, n)}>
                <Text style={{ fontSize: 28, color: n <= (given[p.id] ?? 0) ? c.accent : '#D9D2C7', textShadowColor: c.ink, textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 0 }}>★</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
