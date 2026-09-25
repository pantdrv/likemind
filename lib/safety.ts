import { Alert } from 'react-native';
import { supabase } from './supabase';
import { safe, showError } from './errors';

const REASONS = ['Harassment or abuse', 'Fake or spam', 'Unsafe behaviour'];

export function userActions(user: { id: string; name: string }, requestId: string | null, onDone?: () => void) {
  Alert.alert(user.name, undefined, [
    { text: 'Report', onPress: () => reportFlow(user, requestId) },
    {
      text: 'Block', style: 'destructive',
      onPress: () => Alert.alert(`Block ${user.name}?`, "You won't see each other's requests or messages.", [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: async () => {
            const { error } = await safe(supabase.rpc('block_user', { p_user: user.id }));
            if (error) showError('Could not block', error); else onDone?.();
        } },
      ]),
    },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

function reportFlow(user: { id: string; name: string }, requestId: string | null) {
  Alert.alert('Report reason', undefined, [
    ...REASONS.map((reason) => ({
      text: reason,
      onPress: async () => {
        const { error } = await safe(supabase.rpc('report_user', { p_user: user.id, p_request: requestId, p_reason: reason }));
        if (error) showError('Could not send report', error); else Alert.alert('Report sent', 'Thanks. Our team will review it.');
      },
    })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}
