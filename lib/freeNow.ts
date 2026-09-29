import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

// "Free right now" updates live: when someone turns "I'm free" on or off, their app sends a tiny "changed"
// signal (no data in it) and every phone showing Home re-fetches its own nearby free list. This avoids opening
// up the availability table (which holds people's approximate area) to live reads by everyone.
// One shared channel per app: everyone must use the same name for the signal to reach them.
let channel: RealtimeChannel | null = null;
const listeners = new Set<() => void>();

function shared() {
  if (!channel) {
    channel = supabase.channel('free-now', { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'changed' }, () => listeners.forEach((l) => l()))
      .subscribe();
  }
  return channel;
}

export function announceFreeChanged() {
  shared().send({ type: 'broadcast', event: 'changed', payload: {} }).catch(() => {});
}

// Calls `onChange` (at most once a second) when anyone's "I'm free" status changes.
export function useFreeNowUpdates(onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    shared();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const l = () => { clearTimeout(timer); timer = setTimeout(() => cb.current(), 1000); };
    listeners.add(l);
    return () => { clearTimeout(timer); listeners.delete(l); };
  }, []);
}
