import { Linking, Pressable, Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { Button, Muted } from './ui';
import { directionsLink, mapsLink } from '../lib/places';
import { c, font, border, shadow } from '../lib/theme';

// The server returns exact lat/lng only to the host, joined players and players into this activity (spot_access);
// everyone else gets a ~1 km circle around the rounded spot. Plans without a pin show no map, only a venue-name search.
export default function PlanMap({ d }: { d: any }) {
  const exact = d.lat != null;
  const lat = exact ? d.lat : d.approx_lat != null ? Number(d.approx_lat) : null;
  const lng = exact ? d.lng : d.approx_lng != null ? Number(d.approx_lng) : null;
  const link = exact ? mapsLink({ lat: d.lat, lng: d.lng }) : null;

  return (
    <View>
      {lat != null && lng != null && (
        <View style={{ height: 200, borderRadius: 22, overflow: 'hidden', marginBottom: 10, ...border, ...shadow(4) }}>
          <MapView style={{ flex: 1 }} scrollEnabled={false} zoomEnabled={false} pitchEnabled={false} rotateEnabled={false} toolbarEnabled={false}
            initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: exact ? 0.01 : 0.035, longitudeDelta: exact ? 0.01 : 0.035 }}>
            {exact
              ? <Marker coordinate={{ latitude: lat, longitude: lng }} title={d.venue_name} />
              : <Circle center={{ latitude: lat, longitude: lng }} radius={1000} strokeColor={c.primary} strokeWidth={2} fillColor="rgba(124,58,237,0.18)" />}
          </MapView>
          <View style={{ position: 'absolute', left: 10, bottom: 10, right: 10, alignItems: 'flex-start' }}>
            <View style={{ backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, ...border }}>
              <Text style={{ fontFamily: font.bold, fontSize: 12, color: c.ink }}>
                {!exact ? `approx area · exact spot for people into ${d.activity_name} 🔓`
                  : d.spot_access === 'interest' ? `you can see this because you're into ${d.activity_name} ✨` : 'exact spot 📍'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {link ? (
        <>
          <Pressable onPress={() => Linking.openURL(link)} style={{ backgroundColor: c.card, borderRadius: 14, borderWidth: 1.5, borderColor: c.ink, padding: 12, marginBottom: 10 }}>
            <Text style={{ fontFamily: font.bold, fontSize: 12, color: c.muted, marginBottom: 2 }}>GOOGLE MAPS LINK</Text>
            <Text style={{ fontFamily: font.semi, color: c.primary, textDecorationLine: 'underline' }} numberOfLines={1}>{link}</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button variant="outline" title="🗺️ Open" onPress={() => Linking.openURL(link)} /></View>
            <View style={{ flex: 1 }}><Button variant="outline" title="🧭 Directions" onPress={() => Linking.openURL(directionsLink({ lat: d.lat, lng: d.lng }))} /></View>
          </View>
        </>
      ) : (
        <>
          {lat == null && <Muted style={{ marginBottom: 10 }}>No pin for this one. Search the venue name or ask in the chat 💬</Muted>}
          <Button variant="outline" title={`🔎 Find "${d.venue_name}" in Maps`}
            onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.venue_name)}`)} />
        </>
      )}
    </View>
  );
}
