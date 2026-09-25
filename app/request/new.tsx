import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Switch, Text, TextInput, View, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker } from 'react-native-maps';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { getCoords, Coords } from '../../lib/location';
import { Place, mapsLink, placeFromMapsLink, searchPlaces } from '../../lib/places';
import { Button, Card, Chip, Input, Label, Muted } from '../../components/ui';
import { planCopy } from '../../lib/planCopy';
import { c, font, border, shadow, fmtDate } from '../../lib/theme';
import { openUrl, safe, showError } from '../../lib/errors';

const VIBES = ['Any', 'Chill', 'Casual', 'Competitive'];

export default function NewRequest() {
  // from: an older plan to copy ("run it back" invites its squad too). crew: start this as a crew plan.
  const { slug, from, crew } = useLocalSearchParams<{ slug: string; from?: string; crew?: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const [womanOnly, setWomanOnly] = useState(false);
  const [canWomenOnly, setCanWomenOnly] = useState(false);
  const [crewInfo, setCrewInfo] = useState<{ id: string; name: string; emoji: string } | null>(null);
  const [lastPlan, setLastPlan] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  const [when, setWhen] = useState(new Date(Date.now() + 3600_000));
  const [venue, setVenue] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [skill, setSkill] = useState('Any');
  const [slots, setSlots] = useState(1);
  const [here, setHere] = useState<Coords | null>(null);
  const [usePin, setUsePin] = useState(false);
  const [pin, setPin] = useState<Coords | null>(null);
  const [busy, setBusy] = useState(false);
  const map = useRef<MapView>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [link, setLink] = useState('');
  const [reading, setReading] = useState(false);
  const [act, setAct] = useState<{ name: string; icon: string; category: string } | null>(null);
  const [details, setDetails] = useState<Record<string, string>>({});
  const copy = planCopy(slug, act?.category);

  const moveTo = (p: Coords, name?: string) => {
    setPin(p);
    map.current?.animateToRegion({ latitude: p.lat, longitude: p.lng, latitudeDelta: 0.008, longitudeDelta: 0.008 }, 400);
    if (name && !venue.trim()) setVenue(name);
  };

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const found = await searchPlaces(query.trim(), here);
      setResults(found);
      if (!found.length) Alert.alert('No places found', 'Try adding the area or city, e.g. "Smash Arena Koramangala".');
    } catch {
      Alert.alert('Search failed', 'Allow location access and check your internet connection.');
    }
    setSearching(false);
  };

  const applyLink = async (text: string) => {
    setLink(text);
    if (!text.trim()) return;
    setReading(true);
    const place = await placeFromMapsLink(text).catch(() => null);
    setReading(false);
    if (!place) return Alert.alert("Couldn't read that link", 'In Google Maps, open the place, tap Share, then Copy link, and paste it here.');
    moveTo(place, place.name);
  };

  useEffect(() => { getCoords().then((p) => { if (p) { setHere(p); setPin((cur) => cur ?? p); } }); }, []);

  useEffect(() => {
    if (!session) return;
    // These only fine-tune the form (wording, women-only switch, "same as last time"), so failures fall back to defaults.
    safe(supabase.from('profiles').select('gender').eq('id', session.user.id).single()).then(({ data }) => setCanWomenOnly(data?.gender === 'woman'));
    const crewId = crew ?? null;
    if (crewId) safe(supabase.from('crews').select('id, name, emoji').eq('id', crewId).maybeSingle()).then(({ data }) => setCrewInfo(data));
    safe(supabase.from('activities').select('name, icon, categories(slug)').eq('slug', slug).maybeSingle())
      .then(({ data }: any) => data && setAct({ name: data.name, icon: data.icon, category: data.categories?.slug }));
    if (from) prefill(from);
    else safe(supabase.rpc('my_last_plan', { p_slug: slug })).then(({ data }) => setLastPlan(data ?? null));
  }, [session, from, crew, slug]);

  // Copies an older plan's details; the time moves to the same weekday/time in the future.
  const prefill = async (planId: string) => {
    const { data: d, error } = await safe(supabase.rpc('request_detail', { p_id: planId }));
    if (error) return showError("Couldn't copy the last plan", error);
    if (!d) return Alert.alert("Couldn't copy the last plan", "That plan isn't available anymore. Fill in the details below.");
    setTitle(d.title ?? ''); setVenue(d.venue_name); setSkill(d.skill_level); setSlots(d.slots_total); setNote(d.note ?? '');
    setWomanOnly(!!d.women_only);
    setDetails(d.details ?? {});
    if (d.crew && !crew) setCrewInfo(d.crew);
    if (d.lat != null) { setUsePin(true); setPin({ lat: d.lat, lng: d.lng }); }
    const t = new Date(d.starts_at);
    while (t.getTime() < Date.now() + 30 * 60_000) t.setDate(t.getDate() + 7);
    setWhen(t);
    setPrefilled(true);
  };

  const pickAndroid = (mode: 'date' | 'time') =>
    DateTimePickerAndroid.open({
      value: when, mode, minimumDate: new Date(),
      onChange: (_, d) => {
        if (!d) return;
        const n = new Date(when);
        if (mode === 'date') n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); else n.setHours(d.getHours(), d.getMinutes());
        setWhen(n);
      },
    });

  const submit = async () => {
    if (!venue.trim()) return Alert.alert(`Add the ${copy.placeLabel.replace('?', '').toLowerCase()}`, `Give it a name, ${copy.placePh.startsWith('e.g.') ? copy.placePh : `e.g. ${copy.placePh}`}.`);
    // Without a pin, the host's area (rounded to ~1 km on the server) is still needed so nearby people can find the plan.
    const spot = usePin ? pin : here;
    if (!spot) return Alert.alert('Location needed', 'Allow location access so people nearby can find your plan.');
    if (when.getTime() <= Date.now()) return Alert.alert('Pick a time in the future', `The ${copy.whenLabel.toLowerCase()} you picked has already passed.`);
    setBusy(true);
    const { data, error } = await safe(supabase.rpc('create_request', {
      p_slug: slug, p_title: title, p_note: note, p_skill: skill, p_starts: when.toISOString(),
      p_venue: venue.trim(), p_lat: spot.lat, p_lng: spot.lng, p_slots: slots, p_has_pin: usePin,
      p_women_only: womanOnly, p_crew_id: crewInfo?.id ?? null,
      p_details: Object.fromEntries(Object.entries(details).filter(([k, v]) => v && copy.extras.some((x) => x.key === k))),
    }));
    if (error || !data) { setBusy(false); return showError('Could not create plan', error); }
    if (from) {
      // The plan exists already, so a failed invite is only a warning.
      const { data: n, error: invErr } = await safe(supabase.rpc('invite_squad', { p_new: data, p_old: from }));
      if (invErr) showError('Plan posted, but invites failed', invErr);
      else if (n) Alert.alert('Squad invited 🔁', `${n} ${n === 1 ? 'person' : 'people'} from last time got an invite.`);
    }
    setBusy(false);
    router.replace(`/request/${data}`);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      {from && <Card color={c.lime} style={{ marginBottom: 18 }}><Text style={{ fontFamily: font.black, color: c.ink }}>🔁 Running it back. Everyone from last time gets an invite when you post.</Text></Card>}
      {crewInfo && <Card color={c.lilac} style={{ marginBottom: 18 }}><Text style={{ fontFamily: font.black, color: c.ink }}>{crewInfo.emoji} Crew plan for {crewInfo.name}. The whole crew gets pinged.</Text></Card>}
      {!from && lastPlan && !prefilled && (
        <View style={{ marginBottom: 18 }}><Button variant="outline" small title="⚡ Same as last time" onPress={() => prefill(lastPlan)} /></View>
      )}
      <Stack.Screen options={{ title: act ? `${act.icon} New ${act.name} plan` : 'Start a plan' }} />
      <Input label={copy.titleLabel} value={title} onChangeText={setTitle} placeholder={copy.titlePh} />

      <Label>{copy.whenLabel}</Label>
      {Platform.OS === 'ios' ? (
        <View style={{ alignItems: 'flex-start', marginBottom: 14 }}>
          <DateTimePicker value={when} mode="datetime" minimumDate={new Date()} onChange={(_, d) => d && setWhen(d)} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Button small variant="outline" title="Change date" onPress={() => pickAndroid('date')} />
          <View style={{ width: 8 }} />
          <Button small variant="outline" title="Change time" onPress={() => pickAndroid('time')} />
          <Text style={{ marginLeft: 12, color: c.ink, fontFamily: font.bold }}>{fmtDate(when.toISOString())}</Text>
        </View>
      )}

      <Input label={copy.placeLabel} value={venue} onChangeText={setVenue} placeholder={copy.placePh} />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: usePin ? 8 : 20 }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontFamily: font.black, color: c.ink, fontSize: 15 }}>📍 Add exact spot on map</Text>
          <Muted style={{ fontSize: 13 }}>Optional. Players into this activity and anyone who joins can see it, with a Google Maps link.</Muted>
        </View>
        <Switch value={usePin} onValueChange={setUsePin} trackColor={{ true: c.primary, false: '#D9D2C7' }} thumbColor={c.card} />
      </View>
      {usePin && (
        <View style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <TextInput value={query} onChangeText={setQuery} onSubmitEditing={search} returnKeyType="search" placeholder="🔎 Search a place or address"
              placeholderTextColor="#9A948C" style={[field, { flex: 1, marginRight: 8 }]} />
            <Button small title={searching ? '…' : 'Search'} onPress={search} disabled={searching} />
          </View>
          {results?.map((r, i) => (
            <Pressable key={i} onPress={() => { moveTo(r, r.label.split(',')[0]); setResults(null); }}
              style={{ backgroundColor: c.card, borderRadius: 14, borderWidth: 1.5, borderColor: c.ink, padding: 12, marginBottom: 8 }}>
              <Text style={{ fontFamily: font.semi, color: c.ink }}>📍 {r.label}</Text>
            </Pressable>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <TextInput value={link} onChangeText={setLink} onSubmitEditing={() => applyLink(link)} autoCapitalize="none" autoCorrect={false}
              placeholder="🔗 Or paste a Google Maps link" placeholderTextColor="#9A948C" style={[field, { flex: 1, marginRight: 8 }]} />
            {reading ? <ActivityIndicator color={c.primary} style={{ width: 70 }} />
              : <Button small variant="outline" title="Paste" onPress={async () => applyLink(await Clipboard.getStringAsync().catch(() => ''))} />}
          </View>
          <Pressable onPress={() => openUrl(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.trim() || query.trim() || (here ? `${here.lat},${here.lng}` : ''))}`)}>
            <Muted style={{ fontSize: 13, marginBottom: 10 }}>Find it in <Text style={{ fontFamily: font.black, color: c.primary }}>Google Maps ↗</Text>, tap Share → Copy link, then come back and tap Paste. Or just tap the map.</Muted>
          </Pressable>
        </View>
      )}
      {usePin && <View style={{ height: 230, borderRadius: 20, overflow: 'hidden', marginBottom: 8, ...border, ...shadow(4) }}>
        {pin ? (
          <MapView ref={map} style={{ flex: 1 }} initialRegion={{ latitude: pin.lat, longitude: pin.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
            onPress={(e) => setPin({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}>
            <Marker draggable coordinate={{ latitude: pin.lat, longitude: pin.lng }}
              onDragEnd={(e) => setPin({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })} />
          </MapView>
        ) : <Muted style={{ padding: 20 }}>Allow location access to open the map.</Muted>}
      </View>}
      {usePin && pin && <Muted numberOfLines={1} style={{ fontSize: 12, marginBottom: 20 }}>Link players get: {mapsLink(pin)}</Muted>}

      <Label>{copy.peopleLabel}</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <Pressable onPress={() => setSlots(Math.max(1, slots - 1))} style={stepper}><Text style={stepTxt}>−</Text></Pressable>
        <Text style={{ fontSize: 30, fontFamily: font.black, marginHorizontal: 24, color: c.ink, minWidth: 30, textAlign: 'center' }}>{slots}</Text>
        <Pressable onPress={() => setSlots(Math.min(50, slots + 1))} style={stepper}><Text style={stepTxt}>+</Text></Pressable>
      </View>

      {copy.vibeLabel && (<>
        <Label>{copy.vibeLabel}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
          {VIBES.map((s) => <Chip key={s} label={s} active={s === skill} onPress={() => setSkill(s)} />)}
        </View>
      </>)}

      {copy.extras.map((x) => (
        <View key={x.key}>
          <Label>{x.emoji} {x.label} (optional)</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
            {x.options.map((o) => (
              <Chip key={o} label={o} color={c.accent} active={details[x.key] === o}
                onPress={() => setDetails({ ...details, [x.key]: details[x.key] === o ? '' : o })} />
            ))}
          </View>
        </View>
      ))}

      {canWomenOnly && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ fontFamily: font.black, color: c.ink, fontSize: 15 }}>👩 Women only</Text>
            <Muted style={{ fontSize: 13 }}>Only women can see and join this plan.</Muted>
          </View>
          <Switch value={womanOnly} onValueChange={setWomanOnly} trackColor={{ true: c.pink, false: '#D9D2C7' }} thumbColor={c.card} />
        </View>
      )}

      <Input label="Note (optional)" value={note} onChangeText={setNote} multiline placeholder={copy.notePh} style={{ minHeight: 80, textAlignVertical: 'top' }} />
      <Button variant="pop" title={copy.submit} onPress={submit} loading={busy} />
    </ScrollView>
  );
}
const stepper = { width: 48, height: 48, borderRadius: 24, backgroundColor: c.lime, ...border, ...shadow(3), alignItems: 'center' as const, justifyContent: 'center' as const };
const stepTxt = { fontSize: 24, color: c.ink, fontFamily: font.black };
const field = { backgroundColor: c.card, ...border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: c.ink, fontFamily: font.medium };
