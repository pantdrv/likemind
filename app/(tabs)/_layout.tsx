import { ComponentProps } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { AlertsProvider } from '../../lib/alerts';
import { useThemeMode } from '../../lib/themeMode';
import { c, font } from '../../lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;
// Props expo-router passes to a custom tab bar.
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];
// The bar's buttons, left to right. "new" is the centre ＋ (opens the activity picker); Alerts is reached from the bell.
const ITEMS: { name: string; icon: IconName; label: string }[] = [
  { name: 'index', icon: 'compass', label: 'Explore' },
  { name: 'activity', icon: 'calendar', label: 'My plans' },
  { name: 'new', icon: 'add', label: 'Start a plan' },
  { name: 'crews', icon: 'people', label: 'Crews' },
  { name: 'profile', icon: 'person', label: 'Me' },
];

// One pill-shaped bar for both looks; only the colours change. Every button is the same size, so they line up.
function PillTabBar({ state, navigation }: BottomTabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const day = useThemeMode().mode === 'day';
  const barBg = day ? c.ink : c.card;           // Day: dark brown pill. Night: dark grey pill.
  const iconColor = day ? '#FBEFE9' : c.muted;
  const current = state.routes[state.index]?.name;

  return (
    <View style={{ backgroundColor: c.bg, paddingHorizontal: 16, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 12) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: 64, borderRadius: 32, backgroundColor: barBg, paddingHorizontal: 6,
        borderWidth: day ? 0 : 1, borderColor: c.line }}>
        {ITEMS.map((it) => {
          const route = state.routes.find((r) => r.name === it.name);
          const focused = current === it.name;
          const onPress = () => {
            if (it.name === 'new') return router.push('/start');
            if (!route) return;
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <Pressable key={it.name} onPress={onPress} accessibilityRole="button" accessibilityLabel={it.label} accessibilityState={{ selected: focused }}
              style={{ flex: 1, height: 64, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? c.primary : 'transparent' }}>
                <Ionicons name={focused || it.name === 'new' ? it.icon : (`${it.icon}-outline` as IconName)} size={it.name === 'new' ? 30 : 22}
                  color={focused ? c.onNeon : iconColor} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TabsInner() {
  const router = useRouter();
  return (
    <Tabs tabBar={(props) => <PillTabBar {...props} />} screenOptions={{
      headerStyle: { backgroundColor: c.bg }, headerShadowVisible: false, headerTintColor: c.ink,
      headerTitleStyle: { fontFamily: font.black, fontSize: 22, color: c.ink },
      sceneStyle: { backgroundColor: c.bg },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Explore', headerShown: false }} />
      <Tabs.Screen name="activity" options={{ title: 'My plans' }} />
      <Tabs.Screen name="new" options={{ title: 'Start a plan' }} />
      <Tabs.Screen name="crews" options={{ title: 'Crews' }} />
      <Tabs.Screen name="profile" options={{ title: 'Me' }} />
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
