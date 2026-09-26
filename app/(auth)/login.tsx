import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Button, Input, Muted } from '../../components/ui';
import GoogleButton from '../../components/GoogleButton';
import { c, font, border, shadow } from '../../lib/theme';
import { safe, showError } from '../../lib/errors';

const STICKERS = [
  { e: '🏸', bg: c.lime, rot: '-10deg' },
  { e: '🎮', bg: c.lilac, rot: '8deg' },
  { e: '🛍️', bg: c.pink, rot: '-4deg' },
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) return Alert.alert('Enter your email and password');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return Alert.alert('Check your email', "That email address doesn't look right.");
    setBusy(true);
    const { error } = await safe(supabase.auth.signInWithPassword({ email: email.trim(), password }));
    setBusy(false);
    if (error) showError('Could not log in', error);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 84 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', marginBottom: 22 }}>
          {STICKERS.map((s) => (
            <View key={s.e} style={{ width: 58, height: 58, borderRadius: 18, backgroundColor: s.bg, alignItems: 'center', justifyContent: 'center', marginRight: 10, ...border, ...shadow(3) }}>
              <Text style={{ fontSize: 28 }}>{s.e}</Text>
            </View>
          ))}
        </View>
        <Text style={{ fontFamily: font.black, fontSize: 52, lineHeight: 54, color: c.ink, letterSpacing: -1.5 }}>playmate<Text style={{ color: c.primary }}>.</Text></Text>
        <View style={{ alignSelf: 'flex-start', backgroundColor: c.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginTop: 8, marginBottom: 34 }}>
          <Text style={{ fontFamily: font.bold, fontSize: 16, color: c.onNeon }}>find your people. irl. nearby.</Text>
        </View>
        <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
          textContentType="emailAddress" autoComplete="email" placeholder="you@example.com" />
        <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" autoComplete="password" placeholder="Your password" />
        <View style={{ marginTop: 6 }}><Button title="Let's go →" onPress={submit} loading={busy} /></View>
        <GoogleButton />
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 24 }}>
          <Muted>New here? </Muted>
          <Link href="/register" style={{ color: c.primary, fontFamily: font.black, fontSize: 14 }}>Create an account</Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
