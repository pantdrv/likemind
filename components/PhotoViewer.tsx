import { Image, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from './ui';
import { c, font } from '../lib/theme';

// Full-screen photo with an optional caption and action buttons (e.g. "Make main", "Delete").
export default function PhotoViewer({ uri, caption, actions = [], onClose }:
  { uri: string | null; caption?: string | null; actions?: { title: string; onPress: () => void; danger?: boolean }[]; onClose: () => void }) {
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: 'rgba(12,12,12,0.94)' }}>
        <Pressable onPress={onClose} hitSlop={12} style={{ alignSelf: 'flex-end', padding: 16 }}>
          <Text style={{ color: '#fff', fontSize: 28, fontFamily: font.black }}>✕</Text>
        </Pressable>
        {uri && <Image source={{ uri }} style={{ flex: 1 }} resizeMode="contain" />}
        {caption ? <Text style={{ color: '#fff', fontFamily: font.semi, fontSize: 16, textAlign: 'center', padding: 16 }}>{caption}</Text> : null}
        {actions.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 10, padding: 16 }}>
            {actions.map((a) => (
              <View key={a.title} style={{ flex: 1 }}><Button title={a.title} variant={a.danger ? 'danger' : 'pop'} onPress={a.onPress} /></View>
            ))}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

export const photoTile = { borderRadius: 16, borderWidth: 1, borderColor: c.line, overflow: 'hidden' as const, backgroundColor: c.card };
