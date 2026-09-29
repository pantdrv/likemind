-- My plans loads less: "Coming up" only fetches today onwards, and History loads 10 plans at a time as you scroll.
-- Run in the Supabase SQL editor after 019_free_details.sql. Safe to run more than once.

drop function if exists my_requests();
create or replace function my_requests(p_from timestamptz default null) returns table(id uuid, activity_name text, activity_icon text, activity_slug text, title text,
  starts_at timestamptz, venue_name text, status text, slots_total int, slots_filled int, role text,
  ended boolean, kudos_given boolean, album_count int, crew_name text, cancel_reason text, open_ended boolean, pending_requests int)
language sql security definer stable set search_path=public as $$
  select r.id, a.name, a.icon, a.slug, r.title, r.starts_at, r.venue_name, r.status, r.slots_total, r.slots_filled,
         case when r.host_id = auth.uid() then 'host'
              when exists(select 1 from participants x where x.request_id = r.id and x.user_id = auth.uid()) then 'player'
              else 'requested' end,
         r.starts_at + interval '2 hours' < now(),
         exists(select 1 from kudos k where k.request_id = r.id and k.giver_id = auth.uid()),
         (select count(*)::int from user_photos u where u.request_id = r.id),
         cr.name, r.cancel_reason, r.open_ended,
         case when r.host_id = auth.uid() then (select count(*)::int from join_requests j where j.request_id = r.id and j.status = 'pending') else 0 end
  from requests r join activities a on a.id = r.activity_id left join crews cr on cr.id = r.crew_id
  -- Union of two indexed lookups (plans I host, plans I joined) instead of an OR that forces a full scan.
  where r.id in (select h.id from requests h where h.host_id = auth.uid()
                 union select x.request_id from participants x where x.user_id = auth.uid()
                 union select j.request_id from join_requests j where j.user_id = auth.uid() and j.status = 'pending')
    and (p_from is null or r.starts_at >= p_from)
  order by r.starts_at desc limit 100; $$;

-- Past plans in pages of 10 (newest first). Pass the last row's starts_at and id as the cursor to get the next page.
-- p_role: null = all, 'host' = plans I hosted, 'player' = plans I joined. Only plans I hosted or was in (not just requested).
create or replace function my_history(p_before timestamptz, p_role text default null,
  p_cursor_at timestamptz default null, p_cursor_id uuid default null, p_limit int default 10)
returns table(id uuid, activity_name text, activity_icon text, activity_slug text, title text,
  starts_at timestamptz, venue_name text, status text, slots_total int, slots_filled int, role text,
  ended boolean, kudos_given boolean, album_count int, crew_name text, cancel_reason text, open_ended boolean, pending_requests int)
language sql security definer stable set search_path=public as $$
  select r.id, a.name, a.icon, a.slug, r.title, r.starts_at, r.venue_name, r.status, r.slots_total, r.slots_filled,
         case when r.host_id = auth.uid() then 'host'
              when exists(select 1 from participants x where x.request_id = r.id and x.user_id = auth.uid()) then 'player'
              else 'requested' end,
         r.starts_at + interval '2 hours' < now(),
         exists(select 1 from kudos k where k.request_id = r.id and k.giver_id = auth.uid()),
         (select count(*)::int from user_photos u where u.request_id = r.id),
         cr.name, r.cancel_reason, r.open_ended,
         case when r.host_id = auth.uid() then (select count(*)::int from join_requests j where j.request_id = r.id and j.status = 'pending') else 0 end
  from requests r join activities a on a.id = r.activity_id left join crews cr on cr.id = r.crew_id
  where r.starts_at < p_before
    and r.id in (select h.id from requests h where h.host_id = auth.uid()
                 union select x.request_id from participants x where x.user_id = auth.uid())
    and (p_role is null or (p_role = 'host') = (r.host_id = auth.uid()))
    and (p_cursor_at is null or (r.starts_at, r.id) < (p_cursor_at, p_cursor_id))
  order by r.starts_at desc, r.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50); $$;

-- Counts for the History header ("12 organized · 8 joined").
create or replace function my_history_stats(p_before timestamptz) returns jsonb
language sql security definer stable set search_path=public as $$
  select jsonb_build_object('total', count(*), 'hosted', count(*) filter (where r.host_id = auth.uid()))
  from requests r
  where r.starts_at < p_before
    and r.id in (select h.id from requests h where h.host_id = auth.uid()
                 union select x.request_id from participants x where x.user_id = auth.uid()); $$;
