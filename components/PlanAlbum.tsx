import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { MAX, photoUrl, pickImages, uploadPhoto } from '../lib/photos';
import PhotoViewer, { photoTile } from './PhotoViewer';
import { Button, Muted } from './ui';
import { c } from '../lib/theme';

// Shared photo album for a plan. Each photo also shows up as a moment on the uploader's profile.
export default function PlanAlbum({ requestId, activityId, meId }: { requestId: string; activityId: number; meId: string }) {
  const [photos, setPhotos] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('plan_album', { p_request: requestId });
    setPhotos(data ?? []);
  }, [requestId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    try {
      const imgs = await pickImages(5);
      if (!imgs.length) return;
      setBusy(true);
      for (const img of imgs) await uploadPhoto(meId, img, 'moment', { activity_id: activityId, request_id: requestId });
    } catch (e: any) {
      Alert.alert('Could not add photos', e.message.includes('up to') ? `You can have up to ${MAX.moment} moments. Delete some in Me first.` : e.message);
    }
    setBusy(false);
    load();
  };

  if (!photos) return <ActivityIndicator color={c.primary} />;
  return (
    <View>
      {photos.length === 0 ? <Muted style={{ marginBottom: 10 }}>No photos yet. Be the first to drop some 📸</Muted> : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {photos.map((p) => (
            <Pressable key={p.id} onPress={() => setViewing(p)} style={[photoTile, { width: '31.5%', aspectRatio: 1 }]}>
              <Image source={{ uri: photoUrl(p.path) }} style={{ flex: 1 }} />
            </Pressable>
          ))}
        </View>
      )}
      {busy ? <ActivityIndicator color={c.primary} /> : <Button variant="outline" small title="＋ Add photos to the album" onPress={add} />}
      <PhotoViewer uri={viewing ? photoUrl(viewing.path) : null} caption={viewing ? `📸 by ${viewing.user_name}` : null} onClose={() => setViewing(null)} />
    </View>
  );
}
