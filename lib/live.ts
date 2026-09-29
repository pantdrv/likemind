import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

// Calls `onChange` when rows in `table` change (inserts and updates; Supabase can't filter deletes).
// `filter` narrows it, e.g. "request_id=eq.<id>"; without one, row-level security still limits it to rows this
// person may see. Several changes in a row cause one call.
export function useLive(table: string, filter: string | null, onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => { clearTimeout(timer); timer = setTimeout(() => cb.current(), 300); };
    const ch = supabase.channel(`live:${table}:${filter ?? 'all'}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, fire)
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(ch); };
  }, [table, filter]);
}
