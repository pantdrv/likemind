import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';

export type Kind = 'profile' | 'moment';
export const MAX = { profile: 6, moment: 30 };
const BUCKET = 'photos';
const MAX_SIDE = 1280;
const THUMB_SIDE = 320;

export const photoUrl = (path: string) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

// Each upload also stores a small copy (<name>_t.jpg, ~20 KB) for avatars and grids. Photos uploaded before thumbnails
// existed have none; <Thumb> and <Avatar> fall back to the full photo when the small copy is missing.
export const thumbPath = (path: string) => path.replace(/\.jpg$/, '_t.jpg');
export const thumbUrl = (path: string) => photoUrl(thumbPath(path));
// Same, starting from a full public URL (e.g. profiles.avatar_url). Returns null for URLs that aren't our photos.
export const thumbFromUrl = (url: string) =>
  url.includes(`/object/public/${BUCKET}/`) && /\.jpg$/.test(url) && !/_t\.jpg$/.test(url) ? url.replace(/\.jpg$/, '_t.jpg') : null;

// Base64 -> bytes. The image is uploaded from the manipulator's base64 output: reading the file back with fetch()
// can return an empty body on Android, which uploaded 0-byte photos that never showed up.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(128);
for (let i = 0; i < B64.length; i++) LOOKUP[B64.charCodeAt(i)] = i;
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)], b = LOOKUP[clean.charCodeAt(i + 1)];
    const c3 = i + 2 < len ? LOOKUP[clean.charCodeAt(i + 2)] : 0, d = i + 3 < len ? LOOKUP[clean.charCodeAt(i + 3)] : 0;
    out[o++] = (a << 2) | (b >> 4);
    if (i + 2 < len) out[o++] = ((b & 15) << 4) | (c3 >> 2);
    if (i + 3 < len) out[o++] = ((c3 & 3) << 6) | d;
  }
  return out.slice(0, o);
}

async function uploadJpeg(path: string, base64: string | undefined) {
  const bytes = base64 ? base64ToBytes(base64) : new Uint8Array();
  if (bytes.length < 1000) throw new Error("Couldn't read that photo. Try another one.");
  const up = await supabase.storage.from(BUCKET).upload(path, bytes.buffer as ArrayBuffer, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (up.error) throw up.error;
}

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
  const out = await manipulateAsync(img.uri, resize, { compress: 0.72, format: SaveFormat.JPEG, base64: true });
  const path = `${userId}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  await uploadJpeg(path, out.base64);
  // The small copy is a bonus: if it fails, the app just shows the full photo.
  try {
    const small = await manipulateAsync(img.uri, [{ resize: img.width >= img.height ? { width: THUMB_SIDE } : { height: THUMB_SIDE } }], { compress: 0.7, format: SaveFormat.JPEG, base64: true });
    await uploadJpeg(thumbPath(path), small.base64);
  } catch (e) {
    if (__DEV__) console.warn('thumbnail upload failed', e);
  }
  const { error } = await supabase.from('user_photos').insert({ user_id: userId, kind, path, ...extra });
  if (error) { await supabase.storage.from(BUCKET).remove([path, thumbPath(path)]).catch(() => {}); throw error; }
  return path;
}

export async function deletePhoto(id: number, path: string) {
  const { error } = await supabase.from('user_photos').delete().eq('id', id);
  if (error) throw error;
  // The row is gone, so the photo no longer shows; a leftover file is harmless if this fails.
  await supabase.storage.from(BUCKET).remove([path, thumbPath(path)]).catch(() => {});
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

