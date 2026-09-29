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

// Search-as-you-type for places. Uses Photon (free OpenStreetMap autocomplete, no API key), first within ~50 km of the
// user (in Photon's relevance order), then up to 300 km away (nearest first, e.g. treks outside the city). Falls back to the phone's geocoder (Apple / Google) if Photon can't be reached.
// Pass an AbortSignal to drop a search that a newer keystroke has replaced.
export async function searchPlaces(query: string, near?: Coords | null, signal?: AbortSignal): Promise<Place[]> {
  try {
    let found = await photon(query, near, true, signal);
    if (!found.length && near) found = await photon(query, near, false, signal);
    return found;
  } catch (e: any) {
    if (signal?.aborted) return [];
    return deviceGeocode(query, near);
  }
}

async function photon(query: string, near: Coords | null | undefined, local: boolean, signal?: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ q: query, limit: '8' });
  if (near) {
    params.set('lat', String(near.lat)); params.set('lon', String(near.lng));
    if (local) params.set('bbox', [near.lng - 0.5, near.lat - 0.5, near.lng + 0.5, near.lat + 0.5].join(','));
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  signal?.addEventListener('abort', () => ctrl.abort());
  try {
    const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Photon ${res.status}`);
    const json = await res.json();
    const seen = new Set<string>();
    const places: Place[] = [];
    for (const f of json.features ?? []) {
      const p = f.properties ?? {};
      const [lng, lat] = f.geometry?.coordinates ?? [];
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;
      const label = [p.name, p.street, p.district ?? p.locality, p.city ?? p.county]
        .filter((v: string | undefined, i: number, all: (string | undefined)[]) => v && all.indexOf(v) === i).join(', ');
      if (!label || seen.has(label)) continue;
      seen.add(label);
      places.push({ lat, lng, label });
    }
    if (!near || local) return places.slice(0, 6);
    return places.filter((p) => km(near, p) <= 300).sort((a, b) => km(near, a) - km(near, b)).slice(0, 6);
  } finally {
    clearTimeout(timer);
  }
}

// The phone's own geocoder: good for full addresses, not partial words, so it's only the fallback.
async function deviceGeocode(query: string, near?: Coords | null): Promise<Place[]> {
  const hits = (await Location.geocodeAsync(query).catch(() => [])).slice(0, 5).map((h) => ({ lat: h.latitude, lng: h.longitude }));
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
