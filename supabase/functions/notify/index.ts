// Supabase Edge Function: turns new alerts and chat messages into phone push notifications (Expo push service).
// Called by database triggers (supabase/018_push.sql) with { table, id }. It never trusts text from the caller:
// it re-reads the row with the service key and ignores rows older than 2 minutes, so the public URL can't be used
// to send made-up or repeated notifications. Deploy: supabase functions deploy notify --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const FRESH_MS = 2 * 60 * 1000;
const fresh = (createdAt?: string) => !!createdAt && Date.now() - new Date(createdAt).getTime() < FRESH_MS;

async function push(userIds: string[], title: string, body: string, data: Record<string, unknown>) {
  if (!userIds.length) return;
  const { data: rows } = await db.from('push_tokens').select('token').in('user_id', userIds);
  const tokens = (rows ?? []).map((r) => r.token as string);
  if (!tokens.length) return;
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(tokens.map((to) => ({ to, title, body, data, sound: 'default', channelId: 'default' }))),
  });
  // Forget tokens of phones that uninstalled the app or turned notifications off.
  const out = await res.json().catch(() => null);
  const dead = (out?.data ?? []).map((t: any, i: number) => (t?.details?.error === 'DeviceNotRegistered' ? tokens[i] : null)).filter(Boolean);
  if (dead.length) await db.from('push_tokens').delete().in('token', dead);
}

Deno.serve(async (req) => {
  const { table, id } = await req.json().catch(() => ({}));

  if (table === 'notifications' && id) {
    const { data: n } = await db.from('notifications').select('user_id, request_id, title, body, created_at').eq('id', id).maybeSingle();
    if (n && fresh(n.created_at)) await push([n.user_id], n.title, n.body, { requestId: n.request_id });
  }

  if (table === 'messages' && id) {
    const { data: m } = await db.from('messages').select('request_id, sender_id, body, kind, created_at').eq('id', id).maybeSingle();
    if (m && fresh(m.created_at)) {
      const [{ data: r }, { data: ps }, { data: sender }, { data: bl }] = await Promise.all([
        db.from('requests').select('host_id, title, activities(name, icon)').eq('id', m.request_id).single(),
        db.from('participants').select('user_id').eq('request_id', m.request_id),
        db.from('profiles').select('full_name').eq('id', m.sender_id).single(),
        db.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${m.sender_id},blocked_id.eq.${m.sender_id}`),
      ]);
      const to = new Set<string>([r?.host_id, ...(ps ?? []).map((p) => p.user_id)].filter(Boolean));
      to.delete(m.sender_id);
      (bl ?? []).forEach((b) => { to.delete(b.blocker_id); to.delete(b.blocked_id); });
      const plan = r?.title || `${(r as any)?.activities?.name ?? 'Plan'} squad`;
      const icon = (r as any)?.activities?.icon ?? '💬';
      // Chat: "🏸 Evening doubles" / "Priya: see you at 7!"; notices ("👋 Dev joined") and polls read as-is.
      const body = m.kind === 'system' ? m.body : m.kind === 'poll' ? `📊 ${sender?.full_name ?? 'Someone'}: ${m.body}` : `${sender?.full_name ?? 'Someone'}: ${m.body}`;
      await push([...to], `${icon} ${plan}`, String(body).slice(0, 160), { requestId: m.request_id });
    }
  }

  return new Response('ok');
});
