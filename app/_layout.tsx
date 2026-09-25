import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
    syncAlertArea(session.user.id);
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
