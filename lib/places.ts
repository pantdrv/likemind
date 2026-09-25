import * as Location from 'expo-location';
import type { Coords } from './location';

export type Place = Coords & { label: string };

// Google Maps link that opens a pin at these coordinates (shared with players who can see the exact spot).
export const mapsLink = (p: Coords) => `https://www.google.com/maps/search/?api=1&query=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
export const directionsLink = (p: Coords) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

const km = (a: Coords, b: Coords) => {
  const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
};

// Free search using the phone's own geocoder (Apple on iOS, Google on Android). Closest results first.
export async function searchPlaces(query: string, near?: Coords | null): Promise<Place[]> {
  const hits = (await Location.geocodeAsync(query)).slice(0, 5).map((h) => ({ lat: h.latitude, lng: h.longitude }));
  if (near) hits.sort((a, b) => km(near, a) - km(near, b));
  return Promise.all(hits.map(async (h) => {
    const [a] = await Location.reverseGeocodeAsync({ latitude: h.lat, longitude: h.lng }).catch(() => []);
    const label = a ? [a.name, a.street, a.district ?? a.subregion, a.city].filter((v, i, all) => v && all.indexOf(v) === i).join(', ') : '';
    return { ...h, label: label || query };
  }));
}

// Reads coordinates (and a place name, if present) from a Google Maps link, including short maps.app.goo.gl links.
export async function placeFromMapsLink(raw: string): Promise<(Coords & { name?: string }) | null> {
  let url = raw.trim().match(/https?:\/\/\S+/)?.[0];
  if (!url) return null;
  let body = '';
  if (/goo\.gl|maps\.app/.test(url)) {
    try {
      const res = await fetch(url);
      url = res.url;
      body = await res.text();
    } catch { return null; }
  }
  const text = decodeURIComponent(url.replace(/\+/g, ' '));
  const coords = firstCoords(text) ?? firstCoords(body);
  if (!coords) return null;
  const name = text.match(/\/place\/([^/@]+)/)?.[1]?.trim();
  return { ...coords, name };
}

function firstCoords(s: string): Coords | null {
  const n = '(-?\\d{1,2}\\.\\d+)', e = '(-?\\d{1,3}\\.\\d+)';
  const patterns = [
    new RegExp(`!3d${n}!4d${e}`),                                          // exact place pin
    new RegExp(`[?&](?:q|query|ll|destination|center)=${n},\\s*${e}`),
    new RegExp(`@${n},${e}`),                                               // map centre
    new RegExp(`/place/${n},${e}`),
  ];
  for (const p of patterns) {
    const m = s.match(p);
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}
