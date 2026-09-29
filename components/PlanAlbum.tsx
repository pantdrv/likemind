import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { MAX, photoUrl, pickImages, uploadPhoto } from '../lib/photos';
import PhotoViewer, { photoTile } from './PhotoViewer';
import { Button, Muted } from './ui';
import { friendlyError, safe, showError } from '../lib/errors';
import { c } from '../lib/theme';
import Thumb from './Thumb';

// Shared photo album for a plan.
export default function PlanAlbum({ requestId, activityId, meId }: { requestId: string; activityId: number; meId: string }) {
  const [photos, setPhotos] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await safe(supabase.rpc('plan_album', { p_request: requestId }));
    setError(error ? friendlyError(error) : null);
    if (!error) setPhotos(data ?? []); else setPhotos((cur) => cur ?? []);
  }, [requestId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    try {
      const imgs = await pickImages(5);
      if (!imgs.length) return;
      setBusy(true);
      for (const img of imgs) await uploadPhoto(meId, img, 'moment', { activity_id: activityId, request_id: requestId });
    } catch (e: any) {
      if (String(e?.message ?? '').includes('up to')) Alert.alert('Could not add photos', `You've reached the limit of ${MAX.moment} album photos.`);
      else showError('Could not add photos', e);
    }
    setBusy(false);
    load();
  };

  if (!photos) return <ActivityIndicator color={c.primary} />;
  return (
    <View>
      {error && <Muted style={{ marginBottom: 10, color: c.danger }} onPress={load}>Couldn't load the album. {error} Tap to retry.</Muted>}
      {photos.length === 0 ? error ? null : <Muted style={{ marginBottom: 10 }}>No photos yet. Be the first to drop some 📸</Muted> : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {photos.map((p) => (
            <Pressable key={p.id} onPress={() => setViewing(p)} style={[photoTile, { width: '31.5%', aspectRatio: 1 }]}>
              <Thumb path={p.path} />
            </Pressable>
          ))}
        </View>
      )}
      {busy ? <ActivityIndicator color={c.primary} /> : <Button variant="outline" small title="＋ Add photos to the album" onPress={add} />}
      <PhotoViewer uri={viewing ? photoUrl(viewing.path) : null} caption={viewing ? `📸 by ${viewing.user_name}` : null} onClose={() => setViewing(null)} />
    </View>
  );
}
