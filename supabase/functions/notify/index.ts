// Supabase Edge Function: sends Expo push notifications.
// Hook it up in Dashboard > Database > Webhooks: INSERT on `participants`, `messages` and `notifications` -> this function.
import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function push(userIds: string[], title: string, body: string, data: Record<string, unknown>) {
  if (!userIds.length) return;
  const { data: rows } = await db.from('push_tokens').select('token').in('user_id', userIds);
  const msgs = (rows ?? []).map((r) => ({ to: r.token, title, body, data, sound: 'default' }));
  if (msgs.length) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msgs),
    });
  }
}

Deno.serve(async (req) => {
  const { table, record } = await req.json();
  // Sport alerts: rows are created by the notify_sport_followers trigger (002_sport_alerts.sql).
  if (table === 'notifications') {
    await push([record.user_id], record.title, record.body, { requestId: record.request_id });
  }
  if (table === 'participants') {
    const [{ data: req_ }, { data: who }] = await Promise.all([
      db.from('requests').select('host_id, title, activities(name)').eq('id', record.request_id).single(),
      db.from('profiles').select('full_name').eq('id', record.user_id).single(),
    ]);
    if (req_) await push([req_.host_id], 'New player joined', `${who?.full_name ?? 'Someone'} joined your ${req_.activities?.name} game`, { requestId: record.request_id });
  }
  if (table === 'messages') {
    const [{ data: r }, { data: ps }, { data: sender }] = await Promise.all([
      db.from('requests').select('host_id').eq('id', record.request_id).single(),
      db.from('participants').select('user_id').eq('request_id', record.request_id),
      db.from('profiles').select('full_name').eq('id', record.sender_id).single(),
    ]);
    const all = new Set<string>([r?.host_id, ...(ps ?? []).map((p) => p.user_id)].filter(Boolean));
    all.delete(record.sender_id);
    // respect blocks
    const { data: bl } = await db.from('blocks').select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${record.sender_id},blocked_id.eq.${record.sender_id}`);
    (bl ?? []).forEach((b) => { all.delete(b.blocker_id); all.delete(b.blocked_id); });
    await push([...all], sender?.full_name ?? 'New message', String(record.body).slice(0, 120), { requestId: record.request_id });
  }
  return new Response('ok');
});
