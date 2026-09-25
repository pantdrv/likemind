import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Expo Go no longer supports remote push, and on Android even importing expo-notifications errors there.
// So the module is loaded lazily and only in development/store builds.
export const pushSupported = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
type NotificationsModule = typeof import('expo-notifications');
export const Notifications: NotificationsModule | null = pushSupported ? require('expo-notifications') : null;

Notifications?.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function registerForPush(userId: string) {
  if (!Notifications) return;
  try {
    if (!Device.isDevice) return;
    if (Platform.OS === 'android')
      await Notifications.setNotificationChannelAsync('default', { name: 'default', importance: Notifications.AndroidImportance.HIGH });
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return; // set after `eas init`
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('push_tokens').upsert({ user_id: userId, token, updated_at: new Date().toISOString() });
  } catch (e) {
    console.log('Push registration skipped:', e);
  }
}
