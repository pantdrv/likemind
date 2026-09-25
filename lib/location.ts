import * as Location from 'expo-location';

export type Coords = { lat: number; lng: number };

// Used only to query nearby requests or prefill the meeting pin. Never uploaded as "my location".
export async function getCoords(): Promise<Coords | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;
  const last = await Location.getLastKnownPositionAsync();
  const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}
