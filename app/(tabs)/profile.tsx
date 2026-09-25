import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { MAX, deletePhoto, makeMain, photoUrl, pickImages, submitVerificationSelfie, syncAvatar, uploadPhoto } from '../../lib/photos';
import { Button, Card, Chip, H2, Input, Muted } from '../../components/ui';
import Avatar from '../../components/Avatar';
import PhotoViewer, { photoTile } from '../../components/PhotoViewer';
import MomentComposer from '../../components/MomentComposer';
import { c, font, border, catStyle } from '../../lib/theme';

const RADII = [5, 10, 25, 50];
const GENDERS = [{ v: 'woman', l: 'Woman' }, { v: 'man', l: 'Man' }, { v: 'nonbinary', l: 'Non-binary' }, { v: null, l: 'Prefer not to say' }];
const BIO_MAX = 150;
type Photo = { id: number; path: string; caption?: string | null; activities?: { name: string; icon: string } | null };

export default function Profile() {
  const { session } = useAuth();
  const uid = session!.user.id;
  const router = useRouter();
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [rating, setRating] = useState<{ avg: number; n: number }>({ avg: 0, n: 0 });
  const [blocked, setBlocked] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [cats, setCats] = useState<any[]>([]);
  const [mine, setMine] = useState<string[]>([]);
  const [radius, setRadius] = useState(10);
  const [hasArea, setHasArea] = useState(true);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [moments, setMoments] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<{ photo: Photo; kind: 'profile' | 'moment' } | null>(null);
  const [draft, setDraft] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [verification, setVerification] = useState('none');
  const [verifying, setVerifying] = useState(false);

  const load = useCallback(async () => {
    const [{ data: p }, { data: b }, { data: all }, { data: us }, { data: area }, { data: ph }] = await Promise.all([
      supabase.from('profiles').select('full_name, bio, rating_avg, rating_count, gender, verification_status').eq('id', uid).single(),
      supabase.from('blocks').select('blocked_id, profiles!blocks_blocked_id_fkey(full_name)').eq('blocker_id', uid),
      supabase.from('categories').select('id, slug, name, activities(id, slug, name, icon)').order('sort').order('sort', { referencedTable: 'activities' }),
      supabase.from('user_sports').select('activities(slug)').eq('user_id', uid),
      supabase.from('alert_areas').select('radius_km, area').eq('user_id', uid).maybeSingle(),
      supabase.from('user_photos').select('id, kind, path, caption, activities(name, icon)').eq('user_id', uid).order('position').order('id'),
    ]);
    if (p) { setName(p.full_name); setBio(p.bio ?? ''); setRating({ avg: Number(p.rating_avg), n: p.rating_count }); setGender(p.gender); setVerification(p.verification_status); }
    setBlocked(b ?? []);
    setCats(all ?? []);
    setMine((us ?? []).map((r: any) => r.activities?.slug).filter(Boolean));
    setRadius(area?.radius_km ?? 10);
    setHasArea(!!area?.area);
    setPhotos(((ph ?? []) as any[]).filter((x) => x.kind === 'profile'));
    setMoments(((ph ?? []) as any[]).filter((x) => x.kind === 'moment').reverse());
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
      Alert.alert('Could not add photo', e.message);
    }
    setUploading(false);
    load();
  };

  const addMoment = async () => {
    try {
      const [img] = await pickImages(1);
      if (img) setDraft(img);
    } catch (e: any) {
      Alert.alert('Could not open photos', e.message);
    }
  };

  const remove = (p: Photo, kind: 'profile' | 'moment') =>
    Alert.alert('Delete this photo?', undefined, [{ text: 'Keep' }, {
      text: 'Delete', style: 'destructive', onPress: async () => {
        setViewing(null);
        try { await deletePhoto(p.id, p.path); if (kind === 'profile') await syncAvatar(uid); } catch (e: any) { Alert.alert('Could not delete', e.message); }
        load();
      },
    }]);

  const toggleSport = async (slug: string) => {
    const next = mine.includes(slug) ? mine.filter((s) => s !== slug) : [...mine, slug];
    setMine(next);
    const { error } = await supabase.rpc('set_my_sports', { p_slugs: next });
    if (error) { Alert.alert('Could not save your interests', error.message); load(); }
  };
  const changeRadius = async (km: number) => {
    setRadius(km);
    const { error } = await supabase.rpc('set_alert_radius', { p_km: km });
    if (error) { Alert.alert('Could not save alert distance', error.message); load(); }
  };

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ full_name: name.trim(), bio: bio.trim() }).eq('id', uid);
    setBusy(false);
    Alert.alert(error ? 'Could not save' : 'Saved ✨', error?.message);
  };
  const changeGender = async (g: string | null) => {
    setGender(g);
    const { error } = await supabase.from('profiles').update({ gender: g }).eq('id', uid);
    if (error) { Alert.alert('Could not save', error.message); load(); }
  };
  const verify = async () => {
    setVerifying(true);
    try {
      if (await submitVerificationSelfie(uid)) Alert.alert('Selfie sent ✅', "We'll review it soon. Your ☑️ badge shows up once you're verified.");
    } catch (e: any) {
      Alert.alert('Could not send selfie', e.message);
    }
    setVerifying(false);
    load();
  };
  const unblock = async (id: string) => { await supabase.from('blocks').delete().eq('blocker_id', uid).eq('blocked_id', id); load(); };

  const allActivities = cats.flatMap((cat) => cat.activities);
  const mineFirst = [...allActivities.filter((a) => mine.includes(a.slug)), ...allActivities.filter((a) => !mine.includes(a.slug))];

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
        <Avatar url={photos[0] ? photoUrl(photos[0].path) : null} name={name} size={72} color={c.pink} />
        <View style={{ marginLeft: 16, flex: 1 }}>
          <Text style={{ fontFamily: font.black, fontSize: 24, color: c.ink }} numberOfLines={1}>{name || 'You'}</Text>
          <Muted numberOfLines={1}>{session!.user.email}</Muted>
          <Text style={{ fontFamily: font.bold, color: c.primary, marginTop: 2 }}>{rating.n ? `★ ${rating.avg.toFixed(1)} · ${rating.n} ratings` : 'no ratings yet'}</Text>
        </View>
      </View>
      <Button variant="outline" small title="👀 See my profile as others do" onPress={() => router.push(`/user/${uid}`)} />

      <H2>My photos</H2>
      <Muted style={{ marginBottom: 12 }}>Up to {MAX.profile}. The first one is your main photo. Tap a photo to change it.</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {photos.map((p, i) => (
          <Pressable key={p.id} onPress={() => setViewing({ photo: p, kind: 'profile' })} style={[photoTile, { width: '31.5%', aspectRatio: 3 / 4, marginBottom: 10 }]}>
            <Image source={{ uri: photoUrl(p.path) }} style={{ flex: 1 }} />
            {i === 0 && <View style={{ position: 'absolute', left: 6, top: 6, backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1.5, borderColor: c.ink }}>
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

      <H2 style={{ marginTop: 36 }}>Verification ☑️</H2>
      {verification === 'verified' ? <Card color={c.mint}><Text style={{ fontFamily: font.black, color: c.ink }}>☑️ You're verified. People see the badge next to your name.</Text></Card>
        : verification === 'pending' ? <Card color={c.accent}><Text style={{ fontFamily: font.bold, color: c.ink }}>⏳ Your selfie is being reviewed.</Text></Card>
        : (<>
          <Muted style={{ marginBottom: 10 }}>{verification === 'rejected' ? "Your last selfie couldn't be matched. Try again with a clear, well-lit face photo." : 'Take a quick selfie so people know you\'re real. Verified people get a ☑️ and more yeses.'}</Muted>
          <Button variant="outline" title="📸 Get verified" onPress={verify} loading={verifying} />
        </>)}

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
      <Text style={{ fontFamily: font.black, color: c.ink, marginTop: 8, marginBottom: 8 }}>📡 Alert me about plans within</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {RADII.map((km) => <Chip key={km} label={`${km} km`} color={c.accent} active={km === radius} onPress={() => changeRadius(km)} />)}
      </View>
      {!hasArea && mine.length > 0 && (
        <Card color={c.accent} style={{ marginTop: 8 }}>
          <Text style={{ fontFamily: font.semi, color: c.ink }}>📍 Allow location access so we know which plans are near you. Only your approximate area (about 1 km) is saved.</Text>
        </Card>
      )}

      <H2 style={{ marginTop: 36 }}>My moments 📸</H2>
      <Muted style={{ marginBottom: 12 }}>Photos from games and plans you've done. Up to {MAX.moment}.</Muted>
      {moments.length < MAX.moment && <View style={{ marginBottom: 14 }}><Button variant="pop" small title="＋ Add a moment" onPress={addMoment} /></View>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {moments.map((m) => (
          <Pressable key={m.id} onPress={() => setViewing({ photo: m, kind: 'moment' })} style={[photoTile, { width: '48.5%', aspectRatio: 1, marginBottom: 12 }]}>
            <Image source={{ uri: photoUrl(m.path) }} style={{ flex: 1 }} />
            {m.activities && <View style={{ position: 'absolute', left: 6, bottom: 6, backgroundColor: c.card, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1.5, borderColor: c.ink }}>
              <Text style={{ fontFamily: font.bold, fontSize: 11, color: c.ink }}>{m.activities.icon} {m.activities.name}</Text>
            </View>}
          </Pressable>
        ))}
      </View>
      {moments.length === 0 && <Muted>No moments yet.</Muted>}

      <H2 style={{ marginTop: 36 }}>Blocked people</H2>
      {blocked.length === 0 && <Muted>You haven't blocked anyone.</Muted>}
      {blocked.map((b) => (
        <View key={b.blocked_id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ fontFamily: font.semi, color: c.ink, fontSize: 15 }}>{b.profiles?.full_name ?? 'Player'}</Text>
          <Button small variant="outline" title="Unblock" onPress={() => unblock(b.blocked_id)} />
        </View>
      ))}
      <View style={{ marginTop: 36 }}><Button variant="outline" title="Log out 👋" onPress={() => supabase.auth.signOut()} /></View>

      <PhotoViewer uri={viewing ? photoUrl(viewing.photo.path) : null} onClose={() => setViewing(null)}
        caption={viewing?.kind === 'moment' ? [viewing.photo.activities && `${viewing.photo.activities.icon} ${viewing.photo.activities.name}`, viewing.photo.caption].filter(Boolean).join(' · ') : null}
        actions={!viewing ? [] : viewing.kind === 'profile' && photos[0]?.id !== viewing.photo.id
          ? [{ title: '⭐ Make main', onPress: async () => { const id = viewing.photo.id; setViewing(null); await makeMain(uid, photos, id); load(); } },
             { title: 'Delete', danger: true, onPress: () => remove(viewing.photo, 'profile') }]
          : [{ title: 'Delete', danger: true, onPress: () => remove(viewing.photo, viewing.kind) }]} />
      <MomentComposer userId={uid} image={draft} activities={mineFirst} onClose={() => setDraft(null)} onSaved={load} />
    </ScrollView>
  );
}
