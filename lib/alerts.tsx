import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabase';
import { getCoords, Coords } from './location';

export type AlertItem = { id: number; request_id: string | null; actor_id: string | null; title: string; body: string; read_at: string | null; created_at: string };

// Saves the player's approximate area (the server rounds it to ~1 km) so they get alerts for nearby games.
let last = { userId: '', at: 0 };
export async function syncAlertArea(userId: string, pos?: Coords | null) {
  if (last.userId === userId && Date.now() - last.at < 10 * 60 * 1000) return;
  const p = pos ?? (await getCoords());
  if (!p) return;
  last = { userId, at: Date.now() };
  await supabase.rpc('set_alert_area', { p_lat: p.lat, p_lng: p.lng });
}

type Ctx = { items: AlertItem[] | null; unread: number; reload: () => Promise<void>; markRead: (id: number) => Promise<void>; markAllRead: () => Promise<void> };
const AlertsCtx = createContext<Ctx>({ items: null, unread: 0, reload: async () => {}, markRead: async () => {}, markAllRead: async () => {} });
export const useAlerts = () => useContext(AlertsCtx);

export function AlertsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [items, setItems] = useState<AlertItem[] | null>(null);

  const reload = useCallback(async () => {
    const { data } = await supabase.from('notifications').select('id, request_id, actor_id, title, body, read_at, created_at')
      .order('created_at', { ascending: false }).limit(50);
    setItems(data ?? []);
  }, []);

  useEffect(() => {
    reload();
    const ch = supabase.channel(`alerts:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (p) => setItems((cur) => [p.new as AlertItem, ...(cur ?? [])]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, reload]);

  const markRead = useCallback(async (id: number) => {
    const now = new Date().toISOString();
    setItems((cur) => cur?.map((a) => (a.id === id && !a.read_at ? { ...a, read_at: now } : a)) ?? null);
    await supabase.from('notifications').update({ read_at: now }).eq('id', id).is('read_at', null);
  }, []);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setItems((cur) => cur?.map((a) => (a.read_at ? a : { ...a, read_at: now })) ?? null);
    await supabase.from('notifications').update({ read_at: now }).eq('user_id', userId).is('read_at', null);
  }, [userId]);

  const unread = items?.filter((a) => !a.read_at).length ?? 0;
  return <AlertsCtx.Provider value={{ items, unread, reload, markRead, markAllRead }}>{children}</AlertsCtx.Provider>;
}
