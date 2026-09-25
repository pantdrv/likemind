import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { uploadPhoto } from '../lib/photos';
import { Button, Chip, H1, Input, Label, Muted } from './ui';
import { c, border, shadow } from '../lib/theme';
import { showError } from '../lib/errors';

type Img = { uri: string; width: number; height: number };

// Bottom sheet shown after picking a moment photo: tag it with an activity and add a caption, then upload.
export default function MomentComposer({ userId, image, activities, onClose, onSaved }:
  { userId: string; image: Img | null; activities: { id: number; name: string; icon: string }[]; onClose: () => void; onSaved: () => void }) {
  const [activity, setActivity] = useState<number | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => { setActivity(null); setCaption(''); onClose(); };
  const save = async () => {
    if (!image) return;
    setBusy(true);
    try {
      await uploadPhoto(userId, image, 'moment', { activity_id: activity, caption: caption.trim() || null });
      close();
      onSaved();
    } catch (e: any) {
      showError('Could not upload', e);
    }
    setBusy(false);
  };

  return (
    <Modal visible={!!image} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <H1 style={{ fontSize: 28 }}>New moment 📸</H1>
            <Muted style={{ marginBottom: 16 }}>Show people what you've been up to.</Muted>
            {image && (
              <View style={{ borderRadius: 20, overflow: 'hidden', ...border, ...shadow(4), marginBottom: 20 }}>
                <Image source={{ uri: image.uri }} style={{ width: '100%', aspectRatio: 4 / 3 }} resizeMode="cover" />
              </View>
            )}
            <Label>What was it?</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
              {activities.map((a) => <Chip key={a.id} label={`${a.icon} ${a.name}`} active={activity === a.id} onPress={() => setActivity(activity === a.id ? null : a.id)} />)}
            </View>
            <Input label="Caption (optional)" value={caption} onChangeText={setCaption} maxLength={120} placeholder="e.g. won 21-19 🔥" />
            <Button variant="pop" title="Post moment 🚀" onPress={save} loading={busy} />
            <View style={{ height: 12 }} />
            <Button variant="outline" title="Cancel" onPress={close} disabled={busy} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
