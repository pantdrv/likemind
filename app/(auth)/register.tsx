import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Button, Chip, H1, Input, Label, Muted } from '../../components/ui';
import GoogleButton from '../../components/GoogleButton';
import { c, font, catStyle } from '../../lib/theme';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [cats, setCats] = useState<any[]>([]);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    supabase.from('categories').select('id, slug, name, activities(slug, name, icon)').order('sort').order('sort', { referencedTable: 'activities' })
      .then(({ data }) => setCats(data ?? []));
  }, []);
  const toggle = (slug: string) => setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));

  const submit = async () => {
    if (!name.trim() || !email.trim() || password.length < 6) return Alert.alert('Check your details', 'Enter your name, an email and a password of at least 6 characters.');
    setBusy(true);
    // The signup trigger saves `sports` into user_sports.
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim(), sports: picked } } });
    setBusy(false);
    if (error) return Alert.alert('Could not register', error.message);
    if (!data.session) Alert.alert('Confirm your email', 'We sent you a link. Confirm your email, then log in.');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 72, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <H1 style={{ fontSize: 40, lineHeight: 44 }}>join the{'\n'}squad 🫶</H1>
        <Muted style={{ marginTop: 6, marginBottom: 28, fontSize: 16 }}>takes 30 seconds, no cap.</Muted>
        <Input label="Name" value={name} onChangeText={setName} placeholder="What should people call you?" />
        <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
          textContentType="emailAddress" autoComplete="email" placeholder="you@example.com" />
        <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" autoComplete="new-password" placeholder="At least 6 characters" />
        {cats.length > 0 && (
          <View style={{ marginBottom: 18 }}>
            <Label style={{ marginTop: 6 }}>What are you into?</Label>
            <Muted style={{ marginBottom: 12, fontSize: 13 }}>We'll ping you when someone nearby is looking for people. Change it anytime in Me.</Muted>
            {cats.map((cat) => (
              <View key={cat.id} style={{ marginBottom: 6 }}>
                <Muted style={{ fontFamily: font.black, color: c.ink, marginBottom: 8 }}>{catStyle(cat.slug).emoji} {cat.name}</Muted>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {cat.activities.map((a: any) => <Chip key={a.slug} label={`${a.icon} ${a.name}`} color={catStyle(cat.slug).color} active={picked.includes(a.slug)} onPress={() => toggle(a.slug)} />)}
                </View>
              </View>
            ))}
          </View>
        )}
        <Button title="Create account ✨" onPress={submit} loading={busy} />
        <GoogleButton />
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24 }}>
          <Muted>Already in? </Muted>
          <Link href="/login" style={{ color: c.primary, fontFamily: font.black, fontSize: 14 }}>Log in</Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
