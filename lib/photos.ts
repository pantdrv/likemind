import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';

export type Kind = 'profile' | 'moment';
export const MAX = { profile: 6, moment: 30 };
const BUCKET = 'photos';
const MAX_SIDE = 1280;

export const photoUrl = (path: string) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

// Returns local image URIs the user picked (empty if cancelled or permission denied).
export async function pickImages(limit: number): Promise<{ uri: string; width: number; height: number }[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Allow photo access in Settings to add pictures.');
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], quality: 1, allowsMultipleSelection: limit > 1, selectionLimit: limit, allowsEditing: limit === 1,
  });
  return res.canceled ? [] : res.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
}

// Shrinks to at most 1280px on the long side, uploads as JPEG to <user id>/<kind>-<time>.jpg and records it in user_photos.
export async function uploadPhoto(userId: string, img: { uri: string; width: number; height: number }, kind: Kind,
  extra: { position?: number; activity_id?: number | null; caption?: string | null; request_id?: string | null } = {}) {
  const long = Math.max(img.width, img.height);
  const resize = long > MAX_SIDE ? [{ resize: img.width >= img.height ? { width: MAX_SIDE } : { height: MAX_SIDE } }] : [];
  const out = await manipulateAsync(img.uri, resize, { compress: 0.72, format: SaveFormat.JPEG });
  const body = await (await fetch(out.uri)).arrayBuffer();
  const path = `${userId}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const up = await supabase.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg' });
  if (up.error) throw up.error;
  const { error } = await supabase.from('user_photos').insert({ user_id: userId, kind, path, ...extra });
  if (error) { await supabase.storage.from(BUCKET).remove([path]).catch(() => {}); throw error; }
  return path;
}

export async function deletePhoto(id: number, path: string) {
  const { error } = await supabase.from('user_photos').delete().eq('id', id);
  if (error) throw error;
  // The row is gone, so the photo no longer shows; a leftover file is harmless if this fails.
  await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
}

// Keeps profiles.avatar_url pointing at the main (first) profile photo.
export async function syncAvatar(userId: string) {
  const { data, error } = await supabase.from('user_photos').select('path').eq('user_id', userId).eq('kind', 'profile')
    .order('position').order('id').limit(1).maybeSingle();
  if (error) throw error;
  const up = await supabase.from('profiles').update({ avatar_url: data ? photoUrl(data.path) : null }).eq('id', userId);
  if (up.error) throw up.error;
}

// Moves one profile photo to the front (position 0) and renumbers the rest.
export async function makeMain(userId: string, photos: { id: number }[], id: number) {
  const order = [id, ...photos.map((p) => p.id).filter((x) => x !== id)];
  const results = await Promise.all(order.map((pid, i) => supabase.from('user_photos').update({ position: i }).eq('id', pid)));
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
  await syncAvatar(userId);
}

// Verification selfie: front camera, uploaded to the private "verification" bucket for manual review.
export async function submitVerificationSelfie(userId: string) {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Allow camera access in Settings to take a verification selfie.');
  const res = await ImagePicker.launchCameraAsync({ cameraType: ImagePicker.CameraType.front, quality: 1 });
  if (res.canceled) return false;
  const a = res.assets[0];
  const out = await manipulateAsync(a.uri, [{ resize: a.width >= a.height ? { width: 1080 } : { height: 1080 } }], { compress: 0.7, format: SaveFormat.JPEG });
  const path = `${userId}/selfie-${Date.now()}.jpg`;
  const up = await supabase.storage.from('verification').upload(path, await (await fetch(out.uri)).arrayBuffer(), { contentType: 'image/jpeg' });
  if (up.error) throw up.error;
  const { error } = await supabase.rpc('request_verification', { p_path: path });
  if (error) throw error;
  return true;
}
