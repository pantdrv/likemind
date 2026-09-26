import { Tabs, useRouter } from 'expo-router';
import { ColorValue, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../lib/auth';
import { AlertsProvider } from '../../lib/alerts';
import { c, font } from '../../lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (name: IconName) => ({ focused, color }: { focused: boolean; color: ColorValue }) => (
  <Ionicons name={focused ? name : (`${name}-outline` as IconName)} size={24} color={color as string} />
);

function TabsInner() {
  const router = useRouter();
  return (
    <Tabs screenOptions={{
      tabBarShowLabel: false,
      tabBarActiveTintColor: c.primary, tabBarInactiveTintColor: c.muted,
      tabBarStyle: { backgroundColor: c.bg, borderTopWidth: 1, borderTopColor: c.line, height: 84, paddingTop: 10 },
      headerStyle: { backgroundColor: c.bg }, headerShadowVisible: false, headerTintColor: c.ink,
      headerTitleStyle: { fontFamily: font.black, fontSize: 22, color: c.ink },
      sceneStyle: { backgroundColor: c.bg },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Explore', headerShown: false, tabBarIcon: icon('compass') }} />
      <Tabs.Screen name="activity" options={{ title: 'My plans', tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="new" options={{
        title: 'Start a plan',
        // The centre ＋ from the design: opens the activity picker instead of a tab.
        tabBarButton: () => (
          <Pressable onPress={() => router.push('/start')} accessibilityLabel="Start a plan" style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ width: 48, height: 40, borderRadius: 14, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={28} color={c.onNeon} />
            </View>
          </Pressable>
        ),
      }} />
      <Tabs.Screen name="crews" options={{ title: 'Crews', tabBarIcon: icon('people') }} />
      <Tabs.Screen name="profile" options={{ title: 'Me', tabBarIcon: icon('person') }} />
      {/* Opened from the bell on Explore. */}
      <Tabs.Screen name="alerts" options={{
        title: 'Alerts', href: null,
        headerLeft: () => (
          <Pressable onPress={() => router.navigate('/')} hitSlop={10} style={{ paddingHorizontal: 16 }} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={24} color={c.ink} />
          </Pressable>
        ),
      }} />
    </Tabs>
  );
}

export default function TabsLayout() {
  const { session } = useAuth();
  if (!session) return null; // the root Gate redirects to login
  return <AlertsProvider userId={session.user.id}><TabsInner /></AlertsProvider>;
}
