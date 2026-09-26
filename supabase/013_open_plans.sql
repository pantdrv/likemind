-- Open plans: social activities (walks, food crawls, runs, study…) can be "open to anyone" instead of a fixed number of spots.
-- Open plans keep the maximum of 50 spots behind the scenes, so joining and "full" work as before; open_ended tells the app
-- to show "N going" instead of "N spots left". Run in the Supabase SQL editor after 012_categories_v4.sql. Safe to run more than once.

alter table requests add column if not exists open_ended boolean not null default false;


drop function if exists create_request(text,text,text,text,timestamptz,text,double precision,double precision,int,boolean,boolean,uuid,jsonb);
create or replace function create_request(p_slug text, p_title text, p_note text, p_skill text, p_starts timestamptz,
  p_venue text, p_lat double precision, p_lng double precision, p_slots int, p_has_pin boolean default true,
  p_women_only boolean default false, p_crew_id uuid default null, p_details jsonb default '{}'::jsonb, p_open_ended boolean default false) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_act int; v_id uuid; v_lat double precision := p_lat; v_lng double precision := p_lng;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_starts <= now() then raise exception 'Pick a time in the future'; end if;
  select id into v_act from activities where slug = p_slug;
  if v_act is null then raise exception 'Unknown activity'; end if;
  if p_women_only and not is_woman(auth.uid()) then raise exception 'Only women can start a women-only plan (set your gender in Me)'; end if;
  if p_crew_id is not null and not is_crew_member(p_crew_id) then raise exception 'You are not in that crew'; end if;
  if jsonb_typeof(coalesce(p_details, '{}'::jsonb)) <> 'object' or (select count(*) from jsonb_object_keys(coalesce(p_details, '{}'::jsonb))) > 10 then
    raise exception 'Invalid plan details';
  end if;
  if not p_has_pin then
    v_lat := round(p_lat::numeric, 2)::float8;
    v_lng := round(p_lng::numeric, 2)::float8;
  end if;
  insert into requests(host_id, activity_id, title, note, skill_level, starts_at, venue_name, location, slots_total, has_pin, women_only, crew_id, details, open_ended)
  values (auth.uid(), v_act, nullif(p_title,''), nullif(p_note,''), coalesce(p_skill,'Any'), p_starts, p_venue,
          st_setsrid(st_makepoint(v_lng, v_lat),4326)::geography, case when p_open_ended then 50 else p_slots end, p_has_pin, p_women_only, p_crew_id, coalesce(p_details, '{}'::jsonb), coalesce(p_open_ended, false))
  returning id into v_id;
  return v_id;
end $$;

drop function if exists nearby_requests(double precision, double precision, double precision, text, boolean);
create or replace function nearby_requests(p_lat double precision, p_lng double precision, p_radius_km double precision default 10,
  p_slug text default null, p_interests_only boolean default false)
returns table(id uuid, activity_name text, activity_slug text, activity_icon text, title text, note text, skill_level text,
  starts_at timestamptz, venue_name text, slots_total int, slots_filled int, host_id uuid, host_name text, host_rating numeric,
  distance_km numeric, is_host boolean, has_joined boolean, host_avatar text, host_verified boolean, women_only boolean,
  featured_label text, crew_name text, category_slug text, open_ended boolean)
language sql security definer stable set search_path=public as $$
  select r.id, a.name, a.slug, a.icon, r.title, r.note, r.skill_level, r.starts_at, r.venue_name, r.slots_total, r.slots_filled,
         r.host_id, p.full_name, p.rating_avg,
         greatest(0.5, round((st_distance(r.location, st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography)/1000.0*2)::numeric)/2),
         r.host_id = auth.uid(),
         exists(select 1 from participants x where x.request_id = r.id and x.user_id = auth.uid()),
         p.avatar_url, p.verification_status = 'verified', r.women_only, r.featured_label, cr.name, cat.slug, r.open_ended
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
  ended boolean, kudos_given boolean, album_count int, crew_name text, cancel_reason text, open_ended boolean)
language sql security definer stable set search_path=public as $$
  select r.id, a.name, a.icon, a.slug, r.title, r.starts_at, r.venue_name, r.status, r.slots_total, r.slots_filled,
         case when r.host_id = auth.uid() then 'host' else 'player' end,
         r.starts_at + interval '2 hours' < now(),
         exists(select 1 from kudos k where k.request_id = r.id and k.giver_id = auth.uid()),
         (select count(*)::int from user_photos u where u.request_id = r.id),
         cr.name, r.cancel_reason, r.open_ended
  from requests r join activities a on a.id = r.activity_id left join crews cr on cr.id = r.crew_id
  where r.host_id = auth.uid() or exists(select 1 from participants x where x.request_id = r.id and x.user_id = auth.uid())
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
    'cancel_reason', r.cancel_reason, 'open_ended', r.open_ended, 'women_only', r.women_only, 'featured_label', r.featured_label, 'checkin_enabled', r.checkin_enabled,
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

create or replace function crew_detail(p_crew uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v jsonb;
begin
  if not is_crew_member(p_crew) then return null; end if;
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'emoji', c.emoji, 'code', c.code, 'is_owner', c.owner_id = auth.uid(),
    'activity', case when a.id is null then null else jsonb_build_object('slug', a.slug, 'name', a.name, 'icon', a.icon) end,
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'avatar_url', p.avatar_url,
                  'verified', p.verification_status = 'verified') order by m.joined_at)
                from crew_members m join profiles p on p.id = m.user_id where m.crew_id = c.id), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'activity_name', ra.name, 'activity_icon', ra.icon,
                  'starts_at', r.starts_at, 'venue_name', r.venue_name, 'slots_total', r.slots_total, 'slots_filled', r.slots_filled, 'open_ended', r.open_ended) order by r.starts_at)
                from requests r join activities ra on ra.id = r.activity_id
                where r.crew_id = c.id and r.starts_at > now() - interval '2 hours' and r.status <> 'cancelled'), '[]'::jsonb)
  ) into v from crews c left join activities a on a.id = c.activity_id where c.id = p_crew;
  return v;
end $$;

create or replace function venue_info(p_name text) returns jsonb language sql stable security definer set search_path=public as $$
  with v as (select r.*, a.name act_name, a.icon act_icon from requests r join activities a on a.id = r.activity_id
             where lower(trim(r.venue_name)) = lower(trim(p_name)) and r.status <> 'cancelled'
               and (not r.women_only or r.host_id = auth.uid() or is_woman(auth.uid()))
               and not is_blocked_pair(auth.uid(), r.host_id))
  select jsonb_build_object(
    'name', coalesce((select venue_name from v order by created_at desc limit 1), p_name),
    'plans_30d', (select count(*) from v where created_at > now() - interval '30 days'),
    'plans_total', (select count(*) from v),
    'activities', coalesce((select jsonb_agg(x) from (select jsonb_build_object('name', act_name, 'icon', act_icon, 'count', count(*)) x
                  from v group by act_name, act_icon order by count(*) desc) t), '[]'::jsonb),
    'upcoming', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'activity_name', act_name, 'activity_icon', act_icon,
                  'starts_at', starts_at, 'slots_total', slots_total, 'slots_filled', slots_filled, 'open_ended', open_ended) order by starts_at)
                from v where starts_at > now() and status = 'open'), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'path', u.path, 'caption', u.caption) order by u.created_at desc)
                from user_photos u where u.request_id in (select id from v)), '[]'::jsonb)); $$;

create or replace function notify_new_plan() returns trigger language plpgsql security definer set search_path=public as $$
declare v_name text; v_icon text; v_host text; v_crew text;
begin
  select name, icon into v_name, v_icon from activities where id = new.activity_id;
  select full_name into v_host from profiles where id = new.host_id;
  select name into v_crew from crews where id = new.crew_id;
  insert into notifications(user_id, request_id, actor_id, kind, title, body)
  select distinct on (t.user_id) t.user_id, new.id, new.host_id, t.kind, t.title, t.body
  from (
    select m.user_id, 1 as rank, 'crew' as kind,
           format('👯 New plan in %s', v_crew) as title, format('%s started %s %s at %s', v_host, v_icon, v_name, new.venue_name) as body
      from crew_members m where new.crew_id is not null and m.crew_id = new.crew_id
    union all
    select pp.user_id, 2, 'regular',
           format('⭐ %s started a plan', v_host), format('%s %s at %s. You''ve done %s plans together.', v_icon, v_name, new.venue_name, pp.times)
      from plan_people(new.host_id) pp where pp.times >= 2
    union all
    select s.user_id, 3, 'nearby',
           format('%s New %s plan near you', v_icon, v_name), case when new.open_ended then format('%s is up for %s at %s, open to anyone', v_host, v_name, new.venue_name) else format('%s is looking for %s more at %s', v_host, new.slots_total, new.venue_name) end
      from user_sports s join alert_areas z on z.user_id = s.user_id
      where s.activity_id = new.activity_id and z.area is not null and st_dwithin(z.area, new.location, z.radius_km*1000)
  ) t
  where t.user_id <> new.host_id
    and not is_blocked_pair(t.user_id, new.host_id)
    and (not new.women_only or is_woman(t.user_id))
  order by t.user_id, t.rank;
  return new;
end $$;
