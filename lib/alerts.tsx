import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabase';
import { getCoords, Coords } from './location';
import { friendlyError, safe, showError } from './errors';

export type AlertItem = { id: number; request_id: string | null; actor_id: string | null; title: string; body: string; read_at: string | null; created_at: string };

// "My area": one distance used for both the Home feed and new-plan alerts (stored as alert_areas.radius_km).
export const AREA_KMS = [2, 5, 10, 25, 50];
export const DEFAULT_AREA_KM = 10;
export async function setMyAreaKm(km: number) {
  return safe(supabase.rpc('set_alert_radius', { p_km: km }));
}

// Saves the player's approximate area (the server rounds it to ~1 km) so they get alerts for nearby games.
let last = { userId: '', at: 0 };
export async function syncAlertArea(userId: string, pos?: Coords | null) {
  if (last.userId === userId && Date.now() - last.at < 10 * 60 * 1000) return;
  const p = pos ?? (await getCoords());
  if (!p) return;
  const { error } = await safe(supabase.rpc('set_alert_area', { p_lat: p.lat, p_lng: p.lng }));
  // Only remember success, so a failed save is retried next time. Silent: this runs in the background.
  if (error) { if (__DEV__) console.warn('set_alert_area failed', error); return; }
  last = { userId, at: Date.now() };
}

type Ctx = { items: AlertItem[] | null; error: string | null; unread: number; reload: () => Promise<void>; markRead: (id: number) => Promise<void>; markAllRead: () => Promise<void> };
const AlertsCtx = createContext<Ctx>({ items: null, error: null, unread: 0, reload: async () => {}, markRead: async () => {}, markAllRead: async () => {} });
export const useAlerts = () => useContext(AlertsCtx);

export function AlertsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [items, setItems] = useState<AlertItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // On failure, keeps whatever alerts were already loaded and reports the error.
  const reload = useCallback(async () => {
    const { data, error } = await safe(supabase.from('notifications').select('id, request_id, actor_id, title, body, read_at, created_at')
      .order('created_at', { ascending: false }).limit(50));
    setError(error ? friendlyError(error) : null);
    if (!error) setItems(data ?? []);
    else setItems((cur) => cur ?? []);
  }, []);

  useEffect(() => {
    reload();
    const ch = supabase.channel(`alerts:${userId}:${Math.random().toString(36).slice(2)}`)  // unique, see Chat
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (p) => setItems((cur) => [p.new as AlertItem, ...(cur ?? [])]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, reload]);

  const markRead = useCallback(async (id: number) => {
    const now = new Date().toISOString();
    setItems((cur) => cur?.map((a) => (a.id === id && !a.read_at ? { ...a, read_at: now } : a)) ?? null);
    const { error } = await safe(supabase.from('notifications').update({ read_at: now }).eq('id', id).is('read_at', null));
    if (error) setItems((cur) => cur?.map((a) => (a.id === id && a.read_at === now ? { ...a, read_at: null } : a)) ?? null);
  }, []);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setItems((cur) => cur?.map((a) => (a.read_at ? a : { ...a, read_at: now })) ?? null);
    const { error } = await safe(supabase.from('notifications').update({ read_at: now }).eq('user_id', userId).is('read_at', null));
    if (error) { showError('Could not mark as read', error); reload(); }
  }, [userId, reload]);

  const unread = items?.filter((a) => !a.read_at).length ?? 0;
  return <AlertsCtx.Provider value={{ items, error, unread, reload, markRead, markAllRead }}>{children}</AlertsCtx.Provider>;
}
