import * as Location from 'expo-location';

export type Coords = { lat: number; lng: number };

// Used only to query nearby requests or prefill the meeting pin. Never uploaded as "my location".
// Returns null (never throws) when permission is denied, location services are off, or no fix comes within 15s.
export async function getCoords(): Promise<Coords | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const last = await Location.getLastKnownPositionAsync().catch(() => null);
    const pos = last ?? (await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000)),
    ]));
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : null;
  } catch (e) {
    if (__DEV__) console.warn('getCoords failed', e);
    return null;
  }
}
