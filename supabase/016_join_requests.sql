-- Ask to join: people request a spot and the host accepts or declines, instead of joining instantly.
-- People the host invited ("Invite to a plan", "Run it back") and crew members on crew plans still join straight away.
-- Run in the Supabase SQL editor after 015_rename_sports.sql. Safe to run more than once.

create table if not exists join_requests (
  request_id uuid references requests(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (request_id, user_id)
);
create index if not exists join_requests_user_idx on join_requests(user_id);
create index if not exists join_requests_pending_idx on join_requests(request_id) where status = 'pending';

-- The requester and the plan's host can see a request. Changes only happen through the functions below.
alter table join_requests enable row level security;
drop policy if exists "requester or host read" on join_requests;
create policy "requester or host read" on join_requests for select to authenticated using (
  user_id = auth.uid() or exists(select 1 from requests r where r.id = request_id and r.host_id = auth.uid()));

-- Internal: puts someone in a plan and updates the count / "full" status. Callers lock the plan row first.
create or replace function add_to_plan(p_request uuid, p_user uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  insert into participants(request_id, user_id) values (p_request, p_user) on conflict do nothing;
  if found then
    update requests set slots_filled = slots_filled + 1,
      status = case when slots_filled + 1 >= slots_total then 'full' else 'open' end where id = p_request;
  end if;
end $$;
revoke execute on function add_to_plan(uuid, uuid) from public, anon, authenticated;

-- "Ask to join". Returns 'pending' (host decides) or 'joined' (already in, invited by the host, or a crew plan).
drop function if exists join_request(uuid);
create or replace function join_request(p_request uuid) returns text
language plpgsql security definer set search_path=public as $$
declare r requests%rowtype; v_prev text; v_me text; v_act text; v_icon text;
begin
  select * into r from requests where id = p_request for update;
  if not found then raise exception 'Plan not found'; end if;
  if r.status = 'cancelled' then raise exception 'This plan was cancelled'; end if;
  if r.starts_at <= now() then raise exception 'This plan has already started'; end if;
  if r.host_id = auth.uid() then raise exception 'You are the host of this plan'; end if;
  if is_blocked_pair(auth.uid(), r.host_id) then raise exception 'This plan is not available'; end if;
  if r.women_only and not is_woman(auth.uid()) then raise exception 'This plan is for women only'; end if;
  if exists(select 1 from participants where request_id = r.id and user_id = auth.uid()) then return 'joined'; end if;

  -- The host already picked them: invited to this plan, or it's a plan of a crew they're in.
  if exists(select 1 from notifications n where n.request_id = r.id and n.user_id = auth.uid() and n.actor_id = r.host_id and n.kind in ('invite', 'run_back'))
     or (r.crew_id is not null and is_crew_member(r.crew_id)) then
    if r.status <> 'open' then raise exception 'This plan is no longer open'; end if;
    perform add_to_plan(r.id, auth.uid());
    insert into join_requests(request_id, user_id, status, decided_at) values (r.id, auth.uid(), 'accepted', now())
    on conflict (request_id, user_id) do update set status = 'accepted', decided_at = now();
    return 'joined';
  end if;

  select status into v_prev from join_requests where request_id = r.id and user_id = auth.uid();
  if v_prev = 'pending' then return 'pending'; end if;
  if v_prev = 'declined' then raise exception 'The host couldn''t fit you in this time'; end if;
  if r.status <> 'open' then raise exception 'This plan is no longer open'; end if;

  insert into join_requests(request_id, user_id) values (r.id, auth.uid())
  on conflict (request_id, user_id) do update set status = 'pending', created_at = now(), decided_at = null;
  select full_name into v_me from profiles where id = auth.uid();
  select name, icon into v_act, v_icon from activities where id = r.activity_id;
  delete from notifications where user_id = r.host_id and request_id = r.id and actor_id = auth.uid() and kind = 'join_request';
  insert into notifications(user_id, request_id, actor_id, kind, title, body)
  values (r.host_id, r.id, auth.uid(), 'join_request', format('🙋 %s wants to join', v_me),
          format('%s %s at %s. Tap to accept or decline.', v_icon, coalesce(r.title, v_act), r.venue_name));
  return 'pending';
end $$;

-- Requester changes their mind.
create or replace function cancel_join_request(p_request uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  delete from join_requests where request_id = p_request and user_id = auth.uid() and status = 'pending';
  delete from notifications n using requests r
  where r.id = p_request and n.user_id = r.host_id and n.request_id = p_request and n.actor_id = auth.uid() and n.kind = 'join_request';
end $$;

-- Host accepts or declines. Accepting adds them to the squad and group chat.
create or replace function respond_join_request(p_request uuid, p_user uuid, p_accept boolean) returns void
language plpgsql security definer set search_path=public as $$
declare r requests%rowtype; v_status text; v_name text; v_host text; v_act text; v_icon text;
begin
  select * into r from requests where id = p_request for update;
  if not found or r.host_id <> auth.uid() then raise exception 'Only the host can respond to requests'; end if;
  select status into v_status from join_requests where request_id = p_request and user_id = p_user for update;
  if v_status is null then raise exception 'They withdrew their request'; end if;
  if v_status <> 'pending' then return; end if;
  select full_name into v_name from profiles where id = p_user;
  select full_name into v_host from profiles where id = r.host_id;
  select name, icon into v_act, v_icon from activities where id = r.activity_id;

  if p_accept then
    if r.status = 'cancelled' then raise exception 'This plan is cancelled'; end if;
    if r.starts_at <= now() then raise exception 'This plan has already started'; end if;
    if r.status = 'full' then raise exception 'The plan is full. Someone needs to drop out before you can accept more people.'; end if;
    perform add_to_plan(p_request, p_user);
    update join_requests set status = 'accepted', decided_at = now() where request_id = p_request and user_id = p_user;
    insert into notifications(user_id, request_id, actor_id, kind, title, body)
    values (p_user, r.id, r.host_id, 'accepted', '🎉 You''re in!',
            format('%s accepted you for %s %s at %s (%s). Say hi in the group chat.', v_host, v_icon, coalesce(r.title, v_act), r.venue_name, fmt_when(r.starts_at)));
    insert into messages(request_id, sender_id, kind, body) values (r.id, p_user, 'system', format('👋 %s joined', v_name));
  else
    update join_requests set status = 'declined', decided_at = now() where request_id = p_request and user_id = p_user;
    insert into notifications(user_id, request_id, actor_id, kind, title, body)
    values (p_user, r.id, r.host_id, 'declined', format('%s %s', v_icon, coalesce(r.title, v_act)),
            'The host couldn''t fit you in this time. Plenty more plans nearby!');
  end if;
  -- The host's "wants to join" alert is dealt with.
  update notifications set read_at = coalesce(read_at, now())
  where user_id = r.host_id and request_id = r.id and actor_id = p_user and kind = 'join_request';
end $$;

grant execute on function join_request(uuid), cancel_join_request(uuid), respond_join_request(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Lists and plan details also report request status.
-- ---------------------------------------------------------------------------------------------------------------


drop function if exists nearby_requests(double precision, double precision, double precision, text, boolean);
create or replace function nearby_requests(p_lat double precision, p_lng double precision, p_radius_km double precision default 10,
  p_slug text default null, p_interests_only boolean default false)
returns table(id uuid, activity_name text, activity_slug text, activity_icon text, title text, note text, skill_level text,
  starts_at timestamptz, venue_name text, slots_total int, slots_filled int, host_id uuid, host_name text, host_rating numeric,
  distance_km numeric, is_host boolean, has_joined boolean, host_avatar text, host_verified boolean, women_only boolean,
  featured_label text, crew_name text, category_slug text, open_ended boolean, my_request text)
language sql security definer stable set search_path=public as $$
  select r.id, a.name, a.slug, a.icon, r.title, r.note, r.skill_level, r.starts_at, r.venue_name, r.slots_total, r.slots_filled,
         r.host_id, p.full_name, p.rating_avg,
         greatest(0.5, round((st_distance(r.location, st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography)/1000.0*2)::numeric)/2),
         r.host_id = auth.uid(),
         exists(select 1 from participants x where x.request_id = r.id and x.user_id = auth.uid()),
         p.avatar_url, p.verification_status = 'verified', r.women_only, r.featured_label, cr.name, cat.slug, r.open_ended,
         (select j.status from join_requests j where j.request_id = r.id and j.user_id = auth.uid())
  from requests r join activities a on a.id = r.activity_id join categories cat on cat.id = a.category_id
       join profiles p on p.id = r.host_id left join crews cr on cr.id = r.crew_id
  where r.status = 'open' and r.starts_at > now()
    and st_dwithin(r.location, st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography, p_radius_km*1000)
    and (p_slug is null or a.slug = p_slug)
    and (not p_interests_only
         or not exists(select 1 from user_sports s where s.user_id = auth.uid())
         or exists(select 1 from user_sports s where s.user_id = auth.uid() and s.activity_id = r.activity_id))
    and (not r.women_only or r.host_id = auth.uid() or is_woman(auth.uid()))
    and not is_blocked_pair(auth.uid(), r.host_id)
  order by r.starts_at asc limit 100; $$;

drop function if exists my_requests();
create or replace function my_requests() returns table(id uuid, activity_name text, activity_icon text, activity_slug text, title text,
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
  order by r.starts_at desc limit 100; $$;

create or replace function request_detail(p_id uuid) returns jsonb language plpgsql security definer stable set search_path=public as $$
declare r requests%rowtype; v_member boolean; v_access text; v_out jsonb; v_lat double precision; v_lng double precision;
begin
  select * into r from requests where id = p_id;
  if not found or is_blocked_pair(auth.uid(), r.host_id) then return null; end if;
  v_member := is_member(p_id);
  if r.women_only and not v_member and not is_woman(auth.uid()) then return null; end if;
  v_access := case
    when not r.has_pin then null
    when v_member then 'member'
    when exists(select 1 from user_sports s where s.user_id = auth.uid() and s.activity_id = r.activity_id) then 'interest'
  end;
  v_lat := st_y(r.location::geometry); v_lng := st_x(r.location::geometry);
  select jsonb_build_object(
    'id', r.id, 'title', r.title, 'note', r.note, 'skill_level', r.skill_level, 'starts_at', r.starts_at, 'venue_name', r.venue_name,
    'slots_total', r.slots_total, 'slots_filled', r.slots_filled, 'status', r.status,
    'activity_name', a.name, 'activity_icon', a.icon, 'activity_slug', a.slug, 'activity_id', a.id,
    'details', r.details, 'category_slug', (select cc.slug from categories cc where cc.id = a.category_id),
    'cancel_reason', r.cancel_reason, 'open_ended', r.open_ended,
    'my_request', (select j.status from join_requests j where j.request_id = r.id and j.user_id = auth.uid()),
    'pending_requests', case when r.host_id = auth.uid() then coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name,
          'avatar_url', p.avatar_url, 'at', j.created_at) order by j.created_at)
        from join_requests j join profiles p on p.id = j.user_id where j.request_id = r.id and j.status = 'pending'), '[]'::jsonb) else '[]'::jsonb end, 'women_only', r.women_only, 'featured_label', r.featured_label, 'checkin_enabled', r.checkin_enabled,
    'crew', case when r.crew_id is null then null else (select jsonb_build_object('id', cr.id, 'name', cr.name, 'emoji', cr.emoji) from crews cr where cr.id = r.crew_id) end,
    'host', jsonb_build_object('id', h.id, 'name', h.full_name, 'rating', h.rating_avg, 'rating_count', h.rating_count, 'avatar_url', h.avatar_url,
             'verified', h.verification_status = 'verified',
             'checked_in', v_member and exists(select 1 from check_ins ci where ci.request_id = r.id and ci.user_id = h.id)),
    'is_host', r.host_id = auth.uid(), 'is_member', v_member, 'has_pin', r.has_pin, 'spot_access', v_access,
    'me_checked_in', exists(select 1 from check_ins ci where ci.request_id = r.id and ci.user_id = auth.uid()),
    'lat', case when v_access is not null then v_lat end,
    'lng', case when v_access is not null then v_lng end,
    'approx_lat', case when r.has_pin then round(v_lat::numeric, 2) end,
    'approx_lng', case when r.has_pin then round(v_lng::numeric, 2) end,
    'participants', case when v_member then coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'rating', p.rating_avg,
          'avatar_url', p.avatar_url, 'verified', p.verification_status = 'verified',
          'checked_in', exists(select 1 from check_ins ci where ci.request_id = r.id and ci.user_id = p.id)))
        from participants x join profiles p on p.id = x.user_id where x.request_id = r.id), '[]'::jsonb) else '[]'::jsonb end,
    'my_kudos', case when v_member then coalesce((select jsonb_agg(jsonb_build_object('receiver_id', k.receiver_id, 'tag', k.tag))
        from kudos k where k.request_id = r.id and k.giver_id = auth.uid()), '[]'::jsonb) else '[]'::jsonb end
  ) into v_out from activities a, profiles h where a.id = r.activity_id and h.id = r.host_id;
  return v_out;
end $$;
