import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { MAX, deletePhoto, makeMain, photoUrl, pickImages, syncAvatar, uploadPhoto } from '../../lib/photos';
import { Button, Card, Chip, H2, Input, Muted } from '../../components/ui';
import Avatar from '../../components/Avatar';
import PhotoViewer, { photoTile } from '../../components/PhotoViewer';
import { c, font, border, catStyle } from '../../lib/theme';
import { friendlyError, safe, showError } from '../../lib/errors';
import { AREA_KMS, DEFAULT_AREA_KM, setMyAreaKm } from '../../lib/alerts';
import { useThemeMode } from '../../lib/themeMode';
import Thumb from '../../components/Thumb';

const GENDERS = [{ v: 'woman', l: 'Woman' }, { v: 'man', l: 'Man' }, { v: 'nonbinary', l: 'Non-binary' }, { v: null, l: 'Prefer not to say' }];
const BIO_MAX = 150;
type Photo = { id: number; path: string; caption?: string | null; activities?: { name: string; icon: string } | null };

export default function Profile() {
  const { session } = useAuth();
  const uid = session!.user.id;
  const router = useRouter();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [blocked, setBlocked] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [cats, setCats] = useState<any[]>([]);
  const [mine, setMine] = useState<string[]>([]);
  const [radius, setRadius] = useState(DEFAULT_AREA_KM);
  const [hasArea, setHasArea] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { pref: themePref, setPref: setThemePref } = useThemeMode();

  const load = useCallback(async () => {
    const res = await Promise.all([
      safe(supabase.from('profiles').select('full_name, bio, gender').eq('id', uid).single()),
      safe(supabase.from('blocks').select('blocked_id, profiles!blocks_blocked_id_fkey(full_name)').eq('blocker_id', uid)),
      safe(supabase.from('categories').select('id, slug, name, activities(id, slug, name, icon)').order('sort').order('sort', { referencedTable: 'activities' })),
      safe(supabase.from('user_sports').select('activities(slug)').eq('user_id', uid)),
      safe(supabase.from('alert_areas').select('radius_km, area').eq('user_id', uid).maybeSingle()),
      safe(supabase.from('user_photos').select('id, kind, path, caption, activities(name, icon)').eq('user_id', uid).order('position').order('id')),
    ]);
    const failed = res.find((r) => r.error);
    // Don't overwrite the form with blanks when loading fails; keep what's on screen and say why.
    if (failed) { setLoadError(friendlyError(failed.error)); return; }
    setLoadError(null);
    const [{ data: p }, { data: b }, { data: all }, { data: us }, { data: area }, { data: ph }] = res as any[];
    if (p) { setName(p.full_name); setBio(p.bio ?? ''); setGender(p.gender); }
    setBlocked(b ?? []);
    setCats(all ?? []);
    setMine((us ?? []).map((r: any) => r.activities?.slug).filter(Boolean));
    setRadius(area?.radius_km ?? DEFAULT_AREA_KM);
    setHasArea(!!area?.area);
    setPhotos(((ph ?? []) as any[]).filter((x) => x.kind === 'profile'));
  }, [uid]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addProfilePhotos = async () => {
    try {
      const imgs = await pickImages(MAX.profile - photos.length);
      if (!imgs.length) return;
      setUploading(true);
      for (const [i, img] of imgs.entries()) await uploadPhoto(uid, img, 'profile', { position: photos.length + i });
      await syncAvatar(uid);
    } catch (e: any) {
      showError('Could not add photo', e);
    }
    setUploading(false);
    load();
  };

  const remove = (p: Photo) =>
    Alert.alert('Delete this photo?', undefined, [{ text: 'Keep' }, {
      text: 'Delete', style: 'destructive', onPress: async () => {
        setViewing(null);
        try { await deletePhoto(p.id, p.path); await syncAvatar(uid); } catch (e: any) { showError('Could not delete', e); }
        load();
      },
    }]);

  const toggleSport = async (slug: string) => {
    const next = mine.includes(slug) ? mine.filter((s) => s !== slug) : [...mine, slug];
    setMine(next);
    const { error } = await safe(supabase.rpc('set_my_sports', { p_slugs: next }));
    if (error) { showError('Could not save your interests', error); load(); }
  };
  const changeRadius = async (km: number) => {
    setRadius(km);
    const { error } = await setMyAreaKm(km);
    if (error) { showError('Could not save your area', error); load(); }
  };

  const save = async () => {
    setBusy(true);
    if (name.trim().length < 2) { setBusy(false); return Alert.alert('Add your name', 'Your name needs at least 2 characters.'); }
    const { error } = await safe(supabase.from('profiles').update({ full_name: name.trim(), bio: bio.trim() }).eq('id', uid));
    setBusy(false);
    if (error) showError('Could not save', error); else Alert.alert('Saved ✨');
  };
  const changeGender = async (g: string | null) => {
    setGender(g);
    const { error } = await safe(supabase.from('profiles').update({ gender: g }).eq('id', uid));
    if (error) { showError('Could not save', error); load(); }
  };
  const unblock = async (id: string) => {
    const { error } = await safe(supabase.from('blocks').delete().eq('blocker_id', uid).eq('blocked_id', id));
    if (error) showError('Could not unblock', error);
    load();
  };
  const logOut = async () => {
    const { error } = await safe(supabase.auth.signOut());
    // If the server can't be reached, still clear the session on this phone.
    if (error) await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  };

  const allActivities = cats.flatMap((cat) => cat.activities);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      {loadError && (
        <Card color={c.pink} style={{ marginBottom: 18 }}>
          <Text style={{ fontFamily: font.bold, color: c.ink }}>😵‍💫 Couldn't load your profile. {loadError}</Text>
          <View style={{ marginTop: 10 }}><Button small variant="outline" title="↻ Try again" onPress={load} /></View>
        </Card>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
        <Avatar url={photos[0] ? photoUrl(photos[0].path) : null} name={name} size={72} color={c.pink} />
        <View style={{ marginLeft: 16, flex: 1 }}>
          <Text style={{ fontFamily: font.black, fontSize: 24, color: c.ink }} numberOfLines={1}>{name || 'You'}</Text>
          <Muted numberOfLines={1}>{session!.user.email}</Muted>
        </View>
      </View>
      <Button variant="outline" small title="👀 See my profile as others do" onPress={() => router.push(`/user/${uid}`)} />

      <H2>My photos</H2>
      <Muted style={{ marginBottom: 12 }}>Up to {MAX.profile}. The first one is your main photo. Tap a photo to change it.</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {photos.map((p, i) => (
          <Pressable key={p.id} onPress={() => setViewing(p)} style={[photoTile, { width: '31.5%', aspectRatio: 3 / 4, marginBottom: 10 }]}>
            <Thumb path={p.path} />
            {i === 0 && <View style={{ position: 'absolute', left: 6, top: 6, backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: c.line }}>
              <Text style={{ fontFamily: font.black, fontSize: 11, color: c.ink }}>MAIN</Text>
            </View>}
          </Pressable>
        ))}
        {photos.length < MAX.profile && (
          <Pressable onPress={addProfilePhotos} disabled={uploading}
            style={[photoTile, { width: '31.5%', aspectRatio: 3 / 4, marginBottom: 10, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: c.lime }]}>
            {uploading ? <ActivityIndicator color={c.ink} /> : <><Text style={{ fontSize: 30 }}>＋</Text><Text style={{ fontFamily: font.bold, color: c.ink }}>Add</Text></>}
          </Pressable>
        )}
        {/* keep the last row left-aligned */}
        {Array.from({ length: (3 - ((photos.length + (photos.length < MAX.profile ? 1 : 0)) % 3)) % 3 }).map((_, i) => <View key={`gap${i}`} style={{ width: '31.5%' }} />)}
      </View>

      <H2>About me</H2>
      <Input label="Name" value={name} onChangeText={setName} />
      <Input label={`Bio · ${bio.length}/${BIO_MAX}`} value={bio} onChangeText={setBio} maxLength={BIO_MAX} multiline
        placeholder="1–2 lines about you, e.g. weekend badminton, FIFA sweat, always down for thrifting" style={{ minHeight: 70, textAlignVertical: 'top' }} />
      <Button title="Save changes" onPress={save} loading={busy} />

      <H2 style={{ marginTop: 36 }}>Look</H2>
      <Muted style={{ marginBottom: 10 }}>Auto follows your phone's light/dark setting. You can also switch with ☀️/🌙 on Home.</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {([['auto', '📱 Auto'], ['day', '☀️ Day'], ['night', '🌙 Night']] as const).map(([v, l]) => (
          <Chip key={v} label={l} color={c.accent} active={themePref === v} onPress={() => setThemePref(v)} />
        ))}
      </View>

      <H2 style={{ marginTop: 36 }}>Gender (optional)</H2>
      <Muted style={{ marginBottom: 10 }}>Never shown on your profile. Only used for women-only plans.</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {GENDERS.map((g) => <Chip key={g.l} label={g.l} color={c.pink} active={gender === g.v} onPress={() => changeGender(g.v)} />)}
      </View>

      <H2 style={{ marginTop: 36 }}>Things I'm into</H2>
      <Muted style={{ marginBottom: 14 }}>You get an alert when someone near you starts a plan for these.</Muted>
      {cats.map((cat) => (
        <View key={cat.id} style={{ marginBottom: 8 }}>
          <Text style={{ fontFamily: font.black, color: c.ink, marginBottom: 8 }}>{catStyle(cat.slug).emoji} {cat.name}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cat.activities.map((a: any) => <Chip key={a.slug} label={`${a.icon} ${a.name}`} color={catStyle(cat.slug).color} active={mine.includes(a.slug)} onPress={() => toggleSport(a.slug)} />)}
          </View>
        </View>
      ))}
      <Text style={{ fontFamily: font.black, color: c.ink, marginTop: 8 }}>📍 My area</Text>
      <Muted style={{ fontSize: 13, marginBottom: 8 }}>Home shows plans within this distance, and you get an alert when someone starts one in it.</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {AREA_KMS.map((km) => <Chip key={km} label={`${km} km`} color={c.accent} active={km === radius} onPress={() => changeRadius(km)} />)}
      </View>
      {!hasArea && mine.length > 0 && (
        <Card color={c.accent} style={{ marginTop: 8 }}>
          <Text style={{ fontFamily: font.semi, color: c.ink }}>📍 Allow location access so we know which plans are near you. Only your approximate area (about 1 km) is saved.</Text>
        </Card>
      )}

      <H2 style={{ marginTop: 36 }}>Blocked people</H2>
      {blocked.length === 0 && <Muted>You haven't blocked anyone.</Muted>}
      {blocked.map((b) => (
        <View key={b.blocked_id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ fontFamily: font.semi, color: c.ink, fontSize: 15 }}>{b.profiles?.full_name ?? 'Player'}</Text>
          <Button small variant="outline" title="Unblock" onPress={() => unblock(b.blocked_id)} />
        </View>
      ))}
      <View style={{ marginTop: 36 }}><Button variant="outline" title="Log out 👋" onPress={logOut} /></View>

      <PhotoViewer uri={viewing ? photoUrl(viewing.path) : null} onClose={() => setViewing(null)}
        actions={!viewing ? [] : photos[0]?.id !== viewing.id
          ? [{ title: '⭐ Make main', onPress: async () => {
              const id = viewing.id; setViewing(null);
              try { await makeMain(uid, photos, id); } catch (e) { showError('Could not change main photo', e); }
              load();
            } },
             { title: 'Delete', danger: true, onPress: () => remove(viewing) }]
          : [{ title: 'Delete', danger: true, onPress: () => remove(viewing) }]} />
    </ScrollView>
  );
}
