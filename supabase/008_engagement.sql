-- Engagement pack: home feed, "I'm free", quick plans / run it back, share links, check-in + show-up score,
-- chat reactions & polls, plan albums, kudos, crews, regulars, streaks & badges, weekly challenges, featured events,
-- venue pages, verification and women-only plans.
-- Run in the Supabase SQL editor after 007_profile_photos.sql. Safe to run more than once.

-- =====================================================================================================
-- 1. NEW COLUMNS
-- =====================================================================================================
-- Profiles: optional self-declared gender (only used for women-only plans; never shown to others) and verification.
alter table profiles add column if not exists gender text;
alter table profiles drop constraint if exists profiles_gender_check;
alter table profiles add constraint profiles_gender_check check (gender is null or gender in ('woman','man','nonbinary'));
alter table profiles add column if not exists verification_status text not null default 'none';
alter table profiles drop constraint if exists profiles_verification_status_check;
alter table profiles add constraint profiles_verification_status_check check (verification_status in ('none','pending','verified','rejected'));
alter table profiles add column if not exists verification_photo text;
grant update (gender) on profiles to authenticated;   -- verification_status is only changed by admins

-- Plans: women-only, featured events (set by admins, e.g. update requests set featured_label = '🏆 FIFA Cup' where id = ...),
-- and check-in. checkin_enabled is false for plans created before this migration so old plans don't count as no-shows.
alter table requests add column if not exists women_only boolean not null default false;
alter table requests add column if not exists featured_label text;
alter table requests add column if not exists checkin_enabled boolean not null default false;
alter table requests alter column checkin_enabled set default true;

-- Alerts: what kind of alert it is (nearby, crew, regular, invite, run_back).
alter table notifications add column if not exists kind text not null default 'nearby';

-- Chat: polls.
alter table messages add column if not exists kind text not null default 'text';
alter table messages drop constraint if exists messages_kind_check;
alter table messages add constraint messages_kind_check check (kind in ('text','poll'));
alter table messages add column if not exists poll_options jsonb;
alter table messages drop constraint if exists messages_poll_check;
alter table messages add constraint messages_poll_check
  check (kind <> 'poll' or (jsonb_typeof(poll_options) = 'array' and jsonb_array_length(poll_options) between 2 and 4));

-- Photos: a moment can belong to a plan's shared album.
alter table user_photos add column if not exists request_id uuid references requests(id) on delete set null;
create index if not exists user_photos_request_id_idx on user_photos(request_id);

-- =====================================================================================================
-- 2. NEW TABLES
-- =====================================================================================================
create table if not exists crews (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  emoji text not null default '👯',
  activity_id int references activities(id) on delete set null,
  owner_id uuid not null references profiles(id) on delete cascade,
  code text not null unique default upper(substr(md5(random()::text), 1, 6)),   -- share this to invite people
  created_at timestamptz not null default now()
);
create table if not exists crew_members (
  crew_id uuid references crews(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);
create table if not exists crew_messages (
  id bigserial primary key,
  crew_id uuid not null references crews(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists crew_messages_crew_id_created_at_idx on crew_messages(crew_id, created_at);
alter table requests add column if not exists crew_id uuid references crews(id) on delete set null;

create table if not exists check_ins (
  request_id uuid references requests(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  at timestamptz not null default now(),
  primary key (request_id, user_id)
);

create table if not exists kudos (
  request_id uuid references requests(id) on delete cascade,
  giver_id uuid references profiles(id) on delete cascade,
  receiver_id uuid references profiles(id) on delete cascade,
  tag text not null check (tag in ('mvp','good_vibes','on_time','carried','friendly')),
  created_at timestamptz not null default now(),
  primary key (request_id, giver_id, receiver_id, tag)
);
create index if not exists kudos_receiver_id_idx on kudos(receiver_id);

create table if not exists message_reactions (
  message_id bigint references messages(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍','🔥','😂','❤️','😮')),
  primary key (message_id, user_id, emoji)
);
create table if not exists poll_votes (
  message_id bigint references messages(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  option int not null check (option between 0 and 3),
  primary key (message_id, user_id)
);

-- "I'm free": who is up for something right now. Area is rounded to ~1 km.
create table if not exists availability (
  user_id uuid primary key references profiles(id) on delete cascade,
  until timestamptz not null,
  activity_ids int[] not null default '{}',
  note text check (char_length(note) <= 80),
  area geography(point,4326) not null,
  created_at timestamptz not null default now()
);
create index if not exists availability_area_idx on availability using gist(area);

-- Private bucket for verification selfies (reviewed by admins in the dashboard, never shown in the app).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification', 'verification', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;
drop policy if exists "verification upload own folder" on storage.objects;
create policy "verification upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'verification' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================================================
-- 3. HELPERS
-- =====================================================================================================
create or replace function is_crew_member(cid uuid) returns boolean language sql security definer stable set search_path=public as $$
  select exists(select 1 from crew_members where crew_id = cid and user_id = auth.uid()); $$;

create or replace function is_woman(uid uuid) returns boolean language sql security definer stable set search_path=public as $$
  select coalesce((select gender = 'woman' from profiles where id = uid), false); $$;

create or replace function message_request(mid bigint) returns uuid language sql security definer stable set search_path=public as $$
  select request_id from messages where id = mid; $$;

-- Plans a user actually did: past, not cancelled, as a participant or as a host someone joined.
create or replace function plans_done_by(p_user uuid)
returns table(request_id uuid, activity_id int, starts_at timestamptz, week date, hosted boolean)
language sql stable security definer set search_path=public as $$
  select r.id, r.activity_id, r.starts_at, date_trunc('week', r.starts_at)::date, r.host_id = p_user
  from requests r
  where r.starts_at < now() and r.status <> 'cancelled'
    and ((r.host_id = p_user and r.slots_filled > 0)
         or exists(select 1 from participants x where x.request_id = r.id and x.user_id = p_user)); $$;

-- People a user has done past plans with, and how many times.
create or replace function plan_people(p_user uuid) returns table(user_id uuid, times int)
language sql stable security definer set search_path=public as $$
  with m as (select x.request_id, x.user_id from participants x union select r.id, r.host_id from requests r),
  mine as (select m.request_id from m join requests r on r.id = m.request_id
           where m.user_id = p_user and r.starts_at < now() and r.status <> 'cancelled')
  select m.user_id, count(*)::int from m join mine using (request_id) where m.user_id <> p_user group by m.user_id; $$;

-- Consecutive weeks (ending this week, or last week if nothing yet this week) with at least one plan done.
create or replace function week_streak(p_user uuid) returns int language plpgsql stable security definer set search_path=public as $$
declare v_week date := date_trunc('week', now())::date; v_n int := 0;
begin
  if not exists(select 1 from plans_done_by(p_user) d where d.week = v_week) then v_week := v_week - 7; end if;
  while exists(select 1 from plans_done_by(p_user) d where d.week = v_week) loop
    v_n := v_n + 1;
    v_week := v_week - 7;
  end loop;
  return v_n;
end $$;

-- Stats, kudos, show-up score and badges for a profile. Night owl / early bird use India time.
create or replace function user_stats(p_user uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_done int; v_hosted int; v_night int; v_early int; v_cats int; v_all_cats int; v_out int; v_ps5 int; v_shop int;
  v_streak int; v_kudos jsonb; v_mvp int; v_due int; v_checked int; v_badges jsonb;
begin
  select count(*), count(*) filter (where d.hosted),
         count(*) filter (where extract(hour from d.starts_at at time zone 'Asia/Kolkata') >= 21),
         count(*) filter (where extract(hour from d.starts_at at time zone 'Asia/Kolkata') < 8),
         count(distinct c.id),
         count(*) filter (where c.slug = 'outdoor'), count(*) filter (where c.slug = 'ps5'), count(*) filter (where c.slug = 'shopping')
    into v_done, v_hosted, v_night, v_early, v_cats, v_out, v_ps5, v_shop
    from plans_done_by(p_user) d join activities a on a.id = d.activity_id join categories c on c.id = a.category_id;
  select count(*) into v_all_cats from categories;
  v_streak := week_streak(p_user);
  select coalesce(jsonb_object_agg(tag, n), '{}'::jsonb) into v_kudos
    from (select tag, count(*) n from kudos where receiver_id = p_user group by tag) k;
  v_mvp := coalesce((v_kudos->>'mvp')::int, 0);
  select count(*), count(ci.user_id) into v_due, v_checked
    from requests r left join check_ins ci on ci.request_id = r.id and ci.user_id = p_user
    where r.checkin_enabled and r.status <> 'cancelled' and r.starts_at + interval '3 hours' < now()
      and ((r.host_id = p_user and r.slots_filled > 0) or exists(select 1 from participants x where x.request_id = r.id and x.user_id = p_user));
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'emoji', b.emoji, 'label', b.label) order by b.ord), '[]'::jsonb) into v_badges
  from (values
    (1, 'first_plan', '🎉', 'First plan', v_done >= 1),
    (2, 'regular', '🔁', 'Regular', v_done >= 10),
    (3, 'host', '👑', 'Host with the most', v_hosted >= 5),
    (4, 'on_fire', '🔥', 'On fire', v_streak >= 4),
    (5, 'night_owl', '🦉', 'Night owl', v_night >= 3),
    (6, 'early_bird', '🌅', 'Early bird', v_early >= 3),
    (7, 'explorer', '🧭', 'Explorer', v_all_cats > 0 and v_cats >= v_all_cats),
    (8, 'court_regular', '🏸', 'Court regular', v_out >= 5),
    (9, 'gamer', '🎮', 'Controller certified', v_ps5 >= 5),
    (10, 'shopaholic', '🛍️', 'Shopaholic', v_shop >= 5),
    (11, 'mvp', '🏆', 'Certified MVP', v_mvp >= 5),
    (12, 'reliable', '✅', 'Always shows up', v_due >= 5 and v_checked >= 0.9 * v_due)
  ) as b(ord, id, emoji, label, earned) where b.earned;
  return jsonb_build_object('plans_done', v_done, 'hosted', v_hosted, 'streak', v_streak, 'kudos', v_kudos,
    'badges', v_badges, 'show_up', jsonb_build_object('checked', v_checked, 'due', v_due));
end $$;

-- =====================================================================================================
-- 4. PLANS: create / join / nearby / details / my plans
-- =====================================================================================================
drop function if exists create_request(text,text,text,text,timestamptz,text,double precision,double precision,int,boolean);
create or replace function create_request(p_slug text, p_title text, p_note text, p_skill text, p_starts timestamptz,
  p_venue text, p_lat double precision, p_lng double precision, p_slots int, p_has_pin boolean default true,
  p_women_only boolean default false, p_crew_id uuid default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_act int; v_id uuid; v_lat double precision := p_lat; v_lng double precision := p_lng;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_starts <= now() then raise exception 'Pick a time in the future'; end if;
  select id into v_act from activities where slug = p_slug;
  if v_act is null then raise exception 'Unknown activity'; end if;
  if p_women_only and not is_woman(auth.uid()) then raise exception 'Only women can start a women-only plan (set your gender in Me)'; end if;
  if p_crew_id is not null and not is_crew_member(p_crew_id) then raise exception 'You are not in that crew'; end if;
  if not p_has_pin then
    v_lat := round(p_lat::numeric, 2)::float8;
    v_lng := round(p_lng::numeric, 2)::float8;
  end if;
  insert into requests(host_id, activity_id, title, note, skill_level, starts_at, venue_name, location, slots_total, has_pin, women_only, crew_id)
  values (auth.uid(), v_act, nullif(p_title,''), nullif(p_note,''), coalesce(p_skill,'Any'), p_starts, p_venue,
          st_setsrid(st_makepoint(v_lng, v_lat),4326)::geography, p_slots, p_has_pin, p_women_only, p_crew_id)
  returning id into v_id;
  return v_id;
end $$;

create or replace function join_request(p_request uuid) returns void language plpgsql security definer set search_path=public as $$
declare r requests%rowtype;
begin
  select * into r from requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'open' then raise exception 'This plan is no longer open'; end if;
  if r.starts_at <= now() then raise exception 'This plan has already started'; end if;
  if r.host_id = auth.uid() then raise exception 'You are the host of this plan'; end if;
  if is_blocked_pair(auth.uid(), r.host_id) then raise exception 'This plan is not available'; end if;
  if r.women_only and not is_woman(auth.uid()) then raise exception 'This plan is for women only'; end if;
  insert into participants(request_id, user_id) values (p_request, auth.uid()) on conflict do nothing;
  if found then
    update requests set slots_filled = slots_filled + 1,
      status = case when slots_filled + 1 >= slots_total then 'full' else 'open' end where id = p_request;
  end if;
end $$;

-- p_interests_only: only the caller's interests (all activities if they picked none). Used by the home feed.
drop function if exists nearby_requests(double precision, double precision, double precision, text);
drop function if exists nearby_requests(double precision, double precision, double precision, text, boolean);
create or replace function nearby_requests(p_lat double precision, p_lng double precision, p_radius_km double precision default 10,
  p_slug text default null, p_interests_only boolean default false)
returns table(id uuid, activity_name text, activity_slug text, activity_icon text, title text, note text, skill_level text,
  starts_at timestamptz, venue_name text, slots_total int, slots_filled int, host_id uuid, host_name text, host_rating numeric,
  distance_km numeric, is_host boolean, has_joined boolean, host_avatar text, host_verified boolean, women_only boolean,
  featured_label text, crew_name text, category_slug text)
language sql security definer stable set search_path=public as $$
  select r.id, a.name, a.slug, a.icon, r.title, r.note, r.skill_level, r.starts_at, r.venue_name, r.slots_total, r.slots_filled,
         r.host_id, p.full_name, p.rating_avg,
         greatest(0.5, round((st_distance(r.location, st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography)/1000.0*2)::numeric)/2),
         r.host_id = auth.uid(),
         exists(select 1 from participants x where x.request_id = r.id and x.user_id = auth.uid()),
         p.avatar_url, p.verification_status = 'verified', r.women_only, r.featured_label, cr.name, cat.slug
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
    'women_only', r.women_only, 'featured_label', r.featured_label, 'checkin_enabled', r.checkin_enabled,
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

drop function if exists my_requests();
create or replace function my_requests() returns table(id uuid, activity_name text, activity_icon text, activity_slug text, title text,
  starts_at timestamptz, venue_name text, status text, slots_total int, slots_filled int, role text,
  ended boolean, kudos_given boolean, album_count int, crew_name text)
language sql security definer stable set search_path=public as $$
  select r.id, a.name, a.icon, a.slug, r.title, r.starts_at, r.venue_name, r.status, r.slots_total, r.slots_filled,
         case when r.host_id = auth.uid() then 'host' else 'player' end,
         r.starts_at + interval '2 hours' < now(),
         exists(select 1 from kudos k where k.request_id = r.id and k.giver_id = auth.uid()),
         (select count(*)::int from user_photos u where u.request_id = r.id),
         cr.name
  from requests r join activities a on a.id = r.activity_id left join crews cr on cr.id = r.crew_id
  where r.host_id = auth.uid() or exists(select 1 from participants x where x.request_id = r.id and x.user_id = auth.uid())
  order by r.starts_at desc limit 100; $$;

-- Latest plan I hosted for an activity (for "same as last time").
create or replace function my_last_plan(p_slug text) returns uuid language sql security definer stable set search_path=public as $$
  select r.id from requests r join activities a on a.id = r.activity_id
  where r.host_id = auth.uid() and a.slug = p_slug order by r.created_at desc limit 1; $$;

-- =====================================================================================================
-- 5. ALERTS: new plan -> crew members, regulars (2+ plans together) and nearby people into the activity.
--    One alert per person (crew beats regular beats nearby). Women-only plans only alert women.
-- =====================================================================================================
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
           format('%s New %s plan near you', v_icon, v_name), format('%s is looking for %s more at %s', v_host, new.slots_total, new.venue_name)
      from user_sports s join alert_areas z on z.user_id = s.user_id
      where s.activity_id = new.activity_id and z.area is not null and st_dwithin(z.area, new.location, z.radius_km*1000)
  ) t
  where t.user_id <> new.host_id
    and not is_blocked_pair(t.user_id, new.host_id)
    and (not new.women_only or is_woman(t.user_id))
  order by t.user_id, t.rank;
  return new;
end $$;
drop trigger if exists on_request_created on requests;
create trigger on_request_created after insert on requests for each row execute function notify_new_plan();
drop function if exists notify_sport_followers();

-- Invite one person to a plan you're in.
create or replace function invite_to_plan(p_request uuid, p_user uuid) returns void language plpgsql security definer set search_path=public as $$
declare r requests%rowtype; v_me text; v_act text; v_icon text;
begin
  select * into r from requests where id = p_request;
  if not found or r.status <> 'open' or r.starts_at <= now() then raise exception 'That plan is not open anymore'; end if;
  if not is_member(p_request) then raise exception 'Only people in the plan can invite others'; end if;
  if p_user = auth.uid() or is_blocked_pair(auth.uid(), p_user) then raise exception 'You cannot invite this person'; end if;
  if r.women_only and not is_woman(p_user) then raise exception 'This is a women-only plan'; end if;
  if r.host_id = p_user or exists(select 1 from participants where request_id = p_request and user_id = p_user) then
    raise exception 'They are already in this plan'; end if;
  if exists(select 1 from notifications where request_id = p_request and user_id = p_user and actor_id = auth.uid() and kind = 'invite') then return; end if;
  select full_name into v_me from profiles where id = auth.uid();
  select name, icon into v_act, v_icon from activities where id = r.activity_id;
  insert into notifications(user_id, request_id, actor_id, kind, title, body)
  values (p_user, p_request, auth.uid(), 'invite', format('%s %s invited you', v_icon, v_me), format('%s at %s. Tap to see the plan.', v_act, r.venue_name));
end $$;

-- "Run it back": invite everyone from an old plan to a new one.
create or replace function invite_squad(p_new uuid, p_old uuid) returns int language plpgsql security definer set search_path=public as $$
declare r requests%rowtype; v_me text; v_act text; v_icon text; v_n int;
begin
  select * into r from requests where id = p_new;
  if not found or r.host_id <> auth.uid() then raise exception 'Only the host can invite the squad'; end if;
  if not is_member(p_old) then raise exception 'You were not in that plan'; end if;
  select full_name into v_me from profiles where id = auth.uid();
  select name, icon into v_act, v_icon from activities where id = r.activity_id;
  -- The squad invite replaces any generic "new plan near you" / regular alert they already got for this plan.
  delete from notifications n where n.request_id = p_new and n.kind in ('nearby','regular')
    and n.user_id in (select x.user_id from participants x where x.request_id = p_old union select o.host_id from requests o where o.id = p_old);
  insert into notifications(user_id, request_id, actor_id, kind, title, body)
  select m.user_id, p_new, auth.uid(), 'run_back', format('🔁 %s wants to run it back', v_me), format('%s %s at %s. Same squad?', v_icon, v_act, r.venue_name)
  from (select x.user_id from participants x where x.request_id = p_old union select o.host_id from requests o where o.id = p_old) m
  where m.user_id <> auth.uid() and not is_blocked_pair(auth.uid(), m.user_id) and (not r.women_only or is_woman(m.user_id));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- =====================================================================================================
-- 6. CHECK-IN, KUDOS, PLAN ALBUM
-- =====================================================================================================
create or replace function check_in(p_request uuid, p_lat double precision, p_lng double precision) returns void
language plpgsql security definer set search_path=public as $$
declare r requests%rowtype; v_m double precision;
begin
  select * into r from requests where id = p_request;
  if not found or r.status = 'cancelled' then raise exception 'Plan not found'; end if;
  if not is_member(p_request) then raise exception 'Join the plan first'; end if;
  if now() < r.starts_at - interval '30 minutes' then raise exception 'Check-in opens 30 minutes before the start'; end if;
  if now() > r.starts_at + interval '3 hours' then raise exception 'Check-in has closed for this plan'; end if;
  if r.has_pin then
    v_m := st_distance(r.location, st_setsrid(st_makepoint(p_lng, p_lat),4326)::geography);
    if v_m > 300 then raise exception 'You need to be at the spot to check in (you are about % m away)', round(v_m); end if;
  end if;
  insert into check_ins(request_id, user_id) values (p_request, auth.uid()) on conflict do nothing;
end $$;

-- Toggles a kudos tag; returns true if it is now given.
create or replace function toggle_kudos(p_request uuid, p_receiver uuid, p_tag text) returns boolean
language plpgsql security definer set search_path=public as $$
declare r requests%rowtype;
begin
  select * into r from requests where id = p_request;
  if not found or r.starts_at > now() or r.status = 'cancelled' then raise exception 'Kudos open once the plan has started'; end if;
  if p_receiver = auth.uid() then raise exception 'No self-kudos 😅'; end if;
  if not is_member(p_request) then raise exception 'Only people in this plan can give kudos'; end if;
  if not (r.host_id = p_receiver or exists(select 1 from participants where request_id = p_request and user_id = p_receiver)) then
    raise exception 'That person was not in this plan'; end if;
  delete from kudos where request_id = p_request and giver_id = auth.uid() and receiver_id = p_receiver and tag = p_tag;
  if found then return false; end if;
  insert into kudos(request_id, giver_id, receiver_id, tag) values (p_request, auth.uid(), p_receiver, p_tag);
  return true;
end $$;

create or replace function plan_album(p_request uuid)
returns table(id bigint, path text, caption text, user_id uuid, user_name text, created_at timestamptz)
language sql stable security definer set search_path=public as $$
  select u.id, u.path, u.caption, u.user_id, p.full_name, u.created_at
  from user_photos u join profiles p on p.id = u.user_id
  where u.request_id = p_request and is_member(p_request) order by u.created_at; $$;

-- =====================================================================================================
-- 7. I'M FREE
-- =====================================================================================================
create or replace function set_free(p_hours int, p_slugs text[], p_note text, p_lat double precision, p_lng double precision) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into availability(user_id, until, activity_ids, note, area)
  values (auth.uid(), now() + make_interval(hours => least(greatest(p_hours, 1), 6)),
          coalesce((select array_agg(id) from activities where slug = any(p_slugs)), '{}'), nullif(trim(p_note), ''),
          st_setsrid(st_makepoint(round(p_lng::numeric,2)::float8, round(p_lat::numeric,2)::float8),4326)::geography)
  on conflict (user_id) do update set until = excluded.until, activity_ids = excluded.activity_ids, note = excluded.note,
    area = excluded.area, created_at = now();
end $$;

create or replace function clear_free() returns void language sql security definer set search_path=public as $$
  delete from availability where user_id = auth.uid(); $$;

-- Free people nearby whose activities overlap mine (everyone free if I picked no interests).
create or replace function free_nearby(p_lat double precision, p_lng double precision, p_radius_km double precision default 10)
returns table(user_id uuid, name text, avatar_url text, verified boolean, until timestamptz, note text, activities jsonb,
  distance_km numeric, played_together int)
language sql stable security definer set search_path=public as $$
  with me as (select coalesce(array_agg(activity_id), '{}') ids from user_sports where user_id = auth.uid()),
       pp as (select * from plan_people(auth.uid()))
  select v.user_id, p.full_name, p.avatar_url, p.verification_status = 'verified', v.until, v.note,
         coalesce((select jsonb_agg(jsonb_build_object('name', a.name, 'icon', a.icon)) from activities a where a.id = any(v.activity_ids)), '[]'::jsonb),
         greatest(0.5, round((st_distance(v.area, st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography)/1000.0*2)::numeric)/2),
         coalesce(pp.times, 0)
  from availability v join profiles p on p.id = v.user_id left join pp on pp.user_id = v.user_id, me
  where v.until > now() and v.user_id <> auth.uid() and not is_blocked_pair(auth.uid(), v.user_id)
    and st_dwithin(v.area, st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography, p_radius_km*1000)
    and (cardinality(me.ids) = 0 or cardinality(v.activity_ids) = 0 or v.activity_ids && me.ids)
  order by coalesce(pp.times, 0) desc, v.created_at desc limit 30; $$;

-- =====================================================================================================
-- 8. CREWS
-- =====================================================================================================
create or replace function create_crew(p_name text, p_emoji text, p_slug text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into crews(name, emoji, activity_id, owner_id)
  values (trim(p_name), coalesce(nullif(p_emoji,''), '👯'), (select id from activities where slug = p_slug), auth.uid()) returning id into v_id;
  insert into crew_members(crew_id, user_id) values (v_id, auth.uid());
  return v_id;
end $$;

create or replace function join_crew(p_code text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id into v_id from crews where code = upper(trim(p_code));
  if v_id is null then raise exception 'No crew with that code'; end if;
  if (select count(*) from crew_members where crew_id = v_id) >= 50 then raise exception 'This crew is full (50 people)'; end if;
  insert into crew_members(crew_id, user_id) values (v_id, auth.uid()) on conflict do nothing;
  return v_id;
end $$;

-- Leaving: if the owner leaves, the longest-standing member takes over; the last person out deletes the crew.
create or replace function leave_crew(p_crew uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_next uuid;
begin
  delete from crew_members where crew_id = p_crew and user_id = auth.uid();
  select user_id into v_next from crew_members where crew_id = p_crew order by joined_at limit 1;
  if v_next is null then delete from crews where id = p_crew;
  else update crews set owner_id = v_next where id = p_crew and owner_id = auth.uid();
  end if;
end $$;

create or replace function my_crews() returns table(id uuid, name text, emoji text, activity_name text, activity_icon text,
  members int, next_plan timestamptz)
language sql stable security definer set search_path=public as $$
  select c.id, c.name, c.emoji, a.name, a.icon,
         (select count(*)::int from crew_members m where m.crew_id = c.id),
         (select min(r.starts_at) from requests r where r.crew_id = c.id and r.starts_at > now() and r.status <> 'cancelled')
  from crews c join crew_members me on me.crew_id = c.id and me.user_id = auth.uid() left join activities a on a.id = c.activity_id
  order by c.created_at desc; $$;

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
                  'starts_at', r.starts_at, 'venue_name', r.venue_name, 'slots_total', r.slots_total, 'slots_filled', r.slots_filled) order by r.starts_at)
                from requests r join activities ra on ra.id = r.activity_id
                where r.crew_id = c.id and r.starts_at > now() - interval '2 hours' and r.status <> 'cancelled'), '[]'::jsonb)
  ) into v from crews c left join activities a on a.id = c.activity_id where c.id = p_crew;
  return v;
end $$;

-- =====================================================================================================
-- 9. HOME: regulars, weekly challenges, popular venues, venue pages
-- =====================================================================================================
create or replace function my_regulars() returns table(user_id uuid, name text, avatar_url text, verified boolean, times int)
language sql stable security definer set search_path=public as $$
  select pp.user_id, p.full_name, p.avatar_url, p.verification_status = 'verified', pp.times
  from plan_people(auth.uid()) pp join profiles p on p.id = pp.user_id
  where pp.times >= 2 and not is_blocked_pair(auth.uid(), pp.user_id)
  order by pp.times desc limit 20; $$;

-- This week's progress for the challenges on the home screen.
create or replace function my_week() returns jsonb language sql stable security definer set search_path=public as $$
  with wk as (select date_trunc('week', now()) w),
  mine as (select r.* from requests r, wk
           where r.status <> 'cancelled' and r.starts_at >= wk.w and r.starts_at < wk.w + interval '7 days'
             and (r.host_id = auth.uid() or exists(select 1 from participants x where x.request_id = r.id and x.user_id = auth.uid())))
  select jsonb_build_object(
    'plans', (select count(*) from mine),
    'hosted', (select count(*) from mine where host_id = auth.uid()),
    'new_activity', exists(select 1 from mine m where not exists(
        select 1 from plans_done_by(auth.uid()) d, wk where d.activity_id = m.activity_id and d.starts_at < wk.w)),
    'moments', (select count(*) from user_photos u, wk where u.user_id = auth.uid() and u.kind = 'moment' and u.created_at >= wk.w),
    'streak', week_streak(auth.uid())); $$;

create or replace function popular_venues(p_lat double precision, p_lng double precision, p_radius_km double precision default 15)
returns table(name text, plans int, upcoming int, icon text)
language sql stable security definer set search_path=public as $$
  select min(r.venue_name), count(*)::int, count(*) filter (where r.starts_at > now() and r.status = 'open')::int,
         (array_agg(a.icon order by r.created_at desc))[1]
  from requests r join activities a on a.id = r.activity_id
  where r.status <> 'cancelled' and not r.women_only and r.created_at > now() - interval '30 days'
    and st_dwithin(r.location, st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography, p_radius_km*1000)
  group by lower(trim(r.venue_name)) having count(*) >= 1
  order by count(*) desc limit 6; $$;

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
                  'starts_at', starts_at, 'slots_total', slots_total, 'slots_filled', slots_filled) order by starts_at)
                from v where starts_at > now() and status = 'open'), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'path', u.path, 'caption', u.caption) order by u.created_at desc)
                from user_photos u where u.request_id in (select id from v)), '[]'::jsonb)); $$;

-- =====================================================================================================
-- 10. VERIFICATION + PUBLIC PROFILE (now with stats, badges, kudos, show-up, "played together", free status)
-- =====================================================================================================
create or replace function request_verification(p_path text) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or split_part(p_path, '/', 1) <> auth.uid()::text then raise exception 'Invalid photo'; end if;
  update profiles set verification_status = 'pending', verification_photo = p_path
  where id = auth.uid() and verification_status <> 'verified';
end $$;

create or replace function public_profile(p_user uuid) returns jsonb language plpgsql security definer stable set search_path=public as $$
declare v jsonb;
begin
  if auth.uid() is null or is_blocked_pair(auth.uid(), p_user) then return null; end if;
  select jsonb_build_object(
    'id', p.id, 'name', p.full_name, 'bio', p.bio, 'avatar_url', p.avatar_url,
    'rating', p.rating_avg, 'rating_count', p.rating_count, 'member_since', p.created_at, 'is_me', p.id = auth.uid(),
    'verified', p.verification_status = 'verified',
    'stats', user_stats(p.id),
    'plans_done', (select count(*) from plans_done_by(p.id)),
    'played_together', coalesce((select pp.times from plan_people(auth.uid()) pp where pp.user_id = p.id), 0),
    'free_until', (select a.until from availability a where a.user_id = p.id and a.until > now()),
    'interests', coalesce((select jsonb_agg(jsonb_build_object('slug', a.slug, 'name', a.name, 'icon', a.icon, 'category', c.slug) order by a.id)
                  from user_sports s join activities a on a.id = s.activity_id join categories c on c.id = a.category_id where s.user_id = p.id), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'path', u.path) order by u.position, u.id)
                  from user_photos u where u.user_id = p.id and u.kind = 'profile'), '[]'::jsonb),
    'moments', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'path', u.path, 'caption', u.caption, 'activity_name', a.name, 'activity_icon', a.icon) order by u.created_at desc)
                  from user_photos u left join activities a on a.id = u.activity_id where u.user_id = p.id and u.kind = 'moment'), '[]'::jsonb)
  ) into v from profiles p where p.id = p_user;
  return v;
end $$;

-- =====================================================================================================
-- 11. ROW LEVEL SECURITY
-- =====================================================================================================
alter table crews enable row level security;
drop policy if exists "members read" on crews;
create policy "members read" on crews for select to authenticated using (is_crew_member(id));
drop policy if exists "owner update" on crews;
create policy "owner update" on crews for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table crew_members enable row level security;
drop policy if exists "members read" on crew_members;
create policy "members read" on crew_members for select to authenticated using (is_crew_member(crew_id));

alter table crew_messages enable row level security;
drop policy if exists "members read" on crew_messages;
create policy "members read" on crew_messages for select to authenticated using (is_crew_member(crew_id) and not is_blocked_pair(auth.uid(), sender_id));
drop policy if exists "members write" on crew_messages;
create policy "members write" on crew_messages for insert to authenticated with check (sender_id = auth.uid() and is_crew_member(crew_id));

alter table check_ins enable row level security;
drop policy if exists "members read" on check_ins;
create policy "members read" on check_ins for select to authenticated using (is_member(request_id));

alter table kudos enable row level security;
drop policy if exists "own given" on kudos;
create policy "own given" on kudos for select to authenticated using (giver_id = auth.uid());

alter table message_reactions enable row level security;
drop policy if exists "members read" on message_reactions;
create policy "members read" on message_reactions for select to authenticated using (is_member(message_request(message_id)));
drop policy if exists "own write" on message_reactions;
create policy "own write" on message_reactions for insert to authenticated with check (user_id = auth.uid() and is_member(message_request(message_id)));
drop policy if exists "own delete" on message_reactions;
create policy "own delete" on message_reactions for delete to authenticated using (user_id = auth.uid());

alter table poll_votes enable row level security;
drop policy if exists "members read" on poll_votes;
create policy "members read" on poll_votes for select to authenticated using (is_member(message_request(message_id)));
drop policy if exists "own write" on poll_votes;
create policy "own write" on poll_votes for insert to authenticated with check (user_id = auth.uid() and is_member(message_request(message_id)));
drop policy if exists "own update" on poll_votes;
create policy "own update" on poll_votes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own delete" on poll_votes;
create policy "own delete" on poll_votes for delete to authenticated using (user_id = auth.uid());

alter table availability enable row level security;
drop policy if exists "own read" on availability;
create policy "own read" on availability for select to authenticated using (user_id = auth.uid());

-- Plan albums: members of the plan can add to and see its photos.
drop policy if exists "own insert" on user_photos;
create policy "own insert" on user_photos for insert to authenticated with check (user_id = auth.uid() and (request_id is null or is_member(request_id)));
drop policy if exists "plan album read" on user_photos;
create policy "plan album read" on user_photos for select to authenticated using (request_id is not null and is_member(request_id));

-- Realtime for crew chat, reactions and poll votes.
do $$
declare t text;
begin
  foreach t in array array['crew_messages','message_reactions','poll_votes'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
