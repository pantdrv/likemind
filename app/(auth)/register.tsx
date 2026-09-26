import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { Button, Chip, H1, Input, Muted } from '../../components/ui';
import GoogleButton from '../../components/GoogleButton';
import { c, font, border, catStyle, neonOf } from '../../lib/theme';
import { safe, showError } from '../../lib/errors';

const MIN_PICKS = 3;

// Two steps ("Soft Start" design): 1) account details, 2) pick at least 3 interests, then the account is created.
export default function Register() {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [cats, setCats] = useState<any[]>([]);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    // If interests can't load, sign-up still works and they can be picked later in Me.
    safe(supabase.from('categories').select('id, slug, name, activities(slug, name, icon)').order('sort').order('sort', { referencedTable: 'activities' }))
      .then(({ data }) => setCats(data ?? []));
  }, []);
  const toggle = (slug: string) => setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));
  const total = cats.reduce((n, cat) => n + (cat.activities?.length ?? 0), 0);
  const need = Math.max(0, Math.min(MIN_PICKS, total) - picked.length);

  const next = () => {
    if (!name.trim() || !email.trim() || password.length < 6) return Alert.alert('Check your details', 'Enter your name, an email and a password of at least 6 characters.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return Alert.alert('Check your email', "That email address doesn't look right.");
    setStep(2);
  };

  const submit = async () => {
    setBusy(true);
    // The signup trigger saves `sports` into user_sports.
    const { data, error } = await safe(supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim(), sports: picked } } }));
    setBusy(false);
    if (error) return showError('Could not register', error);
    if (!data?.session) Alert.alert('Confirm your email', 'We sent you a link. Confirm your email, then log in.');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 64, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {/* Progress */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 28 }}>
          {step === 2 ? (
            <Pressable onPress={() => setStep(1)} hitSlop={10} accessibilityLabel="Back"
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', marginRight: 12, ...border }}>
              <Ionicons name="chevron-back" size={18} color={c.ink} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c.raised, overflow: 'hidden' }}>
            <View style={{ width: step === 1 ? '50%' : '100%', height: '100%', backgroundColor: c.primary, borderRadius: 3 }} />
          </View>
          <Text style={{ fontFamily: font.bold, color: c.muted, fontSize: 12, marginLeft: 12 }}>{step} of 2</Text>
        </View>

        {step === 1 ? (<>
          <H1 style={{ fontSize: 38, lineHeight: 42 }}>Find your{'\n'}<Text style={{ color: c.primary }}>people.</Text></H1>
          <Muted style={{ marginTop: 6, marginBottom: 28, fontSize: 16 }}>Takes 30 seconds. Then pick what you're into.</Muted>
          <Input label="Name" value={name} onChangeText={setName} placeholder="What should people call you?" />
          <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
            textContentType="emailAddress" autoComplete="email" placeholder="you@example.com" />
          <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" autoComplete="new-password" placeholder="At least 6 characters" />
          <Button variant="pop" title="Continue" onPress={next} />
          <GoogleButton />
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24 }}>
            <Muted>Already in? </Muted>
            <Link href="/login" style={{ color: c.primary, fontFamily: font.black, fontSize: 14 }}>Log in</Link>
          </View>
        </>) : (<>
          <H1 style={{ fontSize: 32, lineHeight: 36 }}>What makes you{'\n'}lose track of time?</H1>
          <Muted style={{ marginTop: 6, marginBottom: 22 }}>Pick at least {MIN_PICKS}. We'll ping you when someone nearby starts a plan for these. Change them anytime in Me.</Muted>
          {cats.map((cat) => {
            const cs = catStyle(cat.slug);
            return (
              <View key={cat.id} style={{ marginBottom: 10 }}>
                <Text style={{ fontFamily: font.black, color: neonOf(cs.color), fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>{cs.emoji} {cat.name}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {cat.activities.map((a: any) => <Chip key={a.slug} label={`${a.icon} ${a.name}`} color={cs.color} active={picked.includes(a.slug)} onPress={() => toggle(a.slug)} />)}
                </View>
              </View>
            );
          })}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 16, padding: 14, marginTop: 8, marginBottom: 14, ...border }}>
            <Ionicons name={need ? 'people-outline' : 'checkmark-circle'} size={22} color={need ? c.muted : c.primary} />
            <Text style={{ flex: 1, marginLeft: 10, fontFamily: font.medium, color: c.ink }}>
              {need ? `Pick ${need} more to see who shares your interests.` : `Nice, ${picked.length} picked. Let's find your people.`}
            </Text>
          </View>
          <Button variant="pop" title="Create account ✨" onPress={submit} loading={busy} disabled={need > 0} />
        </>)}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
