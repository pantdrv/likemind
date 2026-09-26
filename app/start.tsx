import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { friendlyError, safe } from '../lib/errors';
import { ErrorState, H1, Muted } from '../components/ui';
import { c, font, border, catStyle, neonOf, pressedOffset } from '../lib/theme';

// Opened from the ＋ in the tab bar: pick an activity, then fill in the plan.
export default function StartPicker() {
  const router = useRouter();
  const [cats, setCats] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await safe(supabase.from('categories').select('id, slug, name, activities(id, slug, name, icon)').order('sort').order('sort', { referencedTable: 'activities' }));
    setError(error ? friendlyError(error) : null);
    if (!error) setCats(data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!cats) return error ? <ErrorState message={error} onRetry={load} /> : <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />;
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <H1 style={{ fontSize: 30, lineHeight: 34 }}>What are you{'\n'}<Text style={{ color: c.primary }}>up for?</Text></H1>
      <Muted style={{ marginTop: 6, marginBottom: 8 }}>Pick one. People nearby who are into it get an alert.</Muted>
      {cats.map((cat) => {
        const cs = catStyle(cat.slug);
        return (
          <View key={cat.id} style={{ marginTop: 18 }}>
            <Text style={{ fontFamily: font.black, color: neonOf(cs.color), fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>{cs.emoji} {cat.name}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {cat.activities.map((a: any) => (
                <Pressable key={a.id} onPress={() => router.replace({ pathname: '/request/new', params: { slug: a.slug } })}
                  style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', backgroundColor: cs.color, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14, ...border }, pressed && pressedOffset()]}>
                  <Text style={{ fontSize: 18, marginRight: 6 }}>{a.icon}</Text>
                  <Text style={{ fontFamily: font.bold, color: c.ink, fontSize: 15 }}>{a.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
