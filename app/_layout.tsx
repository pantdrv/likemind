import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { ErrorBoundaryProps, Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Button } from '../components/ui';
import { friendlyError } from '../lib/errors';
import { AuthProvider, useAuth } from '../lib/auth';
import { Notifications, registerForPush } from '../lib/notifications';
import { syncAlertArea } from '../lib/alerts';
import { useFonts, BricolageGrotesque_400Regular, BricolageGrotesque_500Medium, BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { c, font } from '../lib/theme';

function Gate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    if (!session && !inAuth) router.replace('/login');
    else if (session && inAuth) router.replace('/');
  }, [session, loading, segments]);

  useEffect(() => {
    if (!session) return;
    registerForPush(session.user.id);
    syncAlertArea(session.user.id).catch((e) => __DEV__ && console.warn('syncAlertArea', e));
  }, [session]);

  // Tapping a push opens the related request
  useEffect(() => {
    if (!Notifications) return;
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const id = r.notification.request.content.data?.requestId;
      if (id) router.push(`/request/${id}`);
    });
    return () => sub.remove();
  }, []);

  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: c.bg }, headerTintColor: c.ink, headerShadowVisible: false,
      headerTitleStyle: { fontFamily: font.black, fontSize: 20 }, headerBackButtonDisplayMode: 'minimal', contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      <Stack.Screen name="sport/[slug]" options={{ title: 'Nearby' }} />
      <Stack.Screen name="request/new" options={{ title: 'Start a plan', presentation: 'modal' }} />
      <Stack.Screen name="request/[id]" options={{ title: 'The plan' }} />
      <Stack.Screen name="user/[id]" options={{ title: 'Profile' }} />
      <Stack.Screen name="crew/[id]" options={{ title: 'Crew' }} />
      <Stack.Screen name="venue/[name]" options={{ title: 'Spot' }} />
    </Stack>
  );
}

// Catches render crashes anywhere in the app and offers a retry instead of a blank screen.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  if (__DEV__) console.error(error);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center', padding: 28 }}>
      <Text style={{ fontSize: 56, textAlign: 'center' }}>🫠</Text>
      <Text style={{ fontFamily: font.black, fontSize: 24, color: c.ink, textAlign: 'center', marginTop: 12 }}>Oops, something broke</Text>
      <Text style={{ fontFamily: font.medium, fontSize: 15, color: c.muted, textAlign: 'center', marginTop: 8, marginBottom: 24 }}>
        {friendlyError(error)}
      </Text>
      <Button title="↻ Try again" onPress={retry} />
    </View>
  );
}

export default function Root() {
  const [fontsLoaded] = useFonts({ BricolageGrotesque_400Regular, BricolageGrotesque_500Medium, BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });
  if (!fontsLoaded) return null;
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Gate />
    </AuthProvider>
  );
}
