import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { AlertsProvider, useAlerts } from '../../lib/alerts';
import { c, font } from '../../lib/theme';

const icon = (e: string) => ({ focused }: { focused: boolean }) => (
  <View style={{ paddingHorizontal: 12, paddingVertical: 2, borderRadius: 999, backgroundColor: focused ? c.lime : 'transparent', borderWidth: focused ? 2 : 0, borderColor: c.ink }}>
    <Text style={{ fontSize: 18 }}>{e}</Text>
  </View>
);

function TabsInner() {
  const { unread } = useAlerts();
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: c.ink, tabBarInactiveTintColor: c.muted,
      tabBarLabelStyle: { fontFamily: font.bold, fontSize: 11 },
      tabBarStyle: { backgroundColor: c.card, borderTopWidth: 2, borderTopColor: c.ink },
      tabBarBadgeStyle: { backgroundColor: c.pink, color: c.ink, fontFamily: font.black, borderWidth: 1.5, borderColor: c.ink },
      headerStyle: { backgroundColor: c.bg }, headerShadowVisible: false, headerTitleStyle: { fontFamily: font.black, fontSize: 22 },
      sceneStyle: { backgroundColor: c.bg },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Explore', headerShown: false, tabBarIcon: icon('✨') }} />
      <Tabs.Screen name="activity" options={{ title: 'My plans', tabBarIcon: icon('📅') }} />
      <Tabs.Screen name="crews" options={{ title: 'Crews', tabBarIcon: icon('👯') }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarIcon: icon('🔔'), tabBarBadge: unread > 0 ? unread : undefined }} />
      <Tabs.Screen name="profile" options={{ title: 'Me', tabBarIcon: icon('😎') }} />
    </Tabs>
  );
}

export default function TabsLayout() {
  const { session } = useAuth();
  if (!session) return null; // the root Gate redirects to login
  return <AlertsProvider userId={session.user.id}><TabsInner /></AlertsProvider>;
}
