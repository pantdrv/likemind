import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { signInWithGoogle } from '../lib/google';
import { c, font, border, shadow, pressedOffset } from '../lib/theme';

export default function GoogleButton() {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const error = await signInWithGoogle();
    setBusy(false);
    if (error) Alert.alert('Google sign-in failed', error);
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 18 }}>
        <View style={{ flex: 1, height: 2, backgroundColor: c.ink, opacity: 0.15 }} />
        <Text style={{ marginHorizontal: 12, fontFamily: font.bold, color: c.muted }}>or</Text>
        <View style={{ flex: 1, height: 2, backgroundColor: c.ink, opacity: 0.15 }} />
      </View>
      <Pressable onPress={go} disabled={busy}
        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: c.card, borderRadius: 16, paddingVertical: 14, ...border },
          pressed ? pressedOffset(4) : shadow(4)]}>
        {busy ? <ActivityIndicator color={c.ink} /> : (
          <>
            <Text style={{ fontFamily: font.black, fontSize: 20, color: '#4285F4', marginRight: 10 }}>G</Text>
            <Text style={{ fontFamily: font.black, fontSize: 17, color: c.ink }}>Continue with Google</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}
