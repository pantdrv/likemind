-- Playmate schema. Run in Supabase SQL editor (Database > Extensions: postgis is enabled below).
create extension if not exists postgis;

-- ========== TABLES ==========
create table categories (id serial primary key, slug text unique not null, name text not null);
create table activities (
  id serial primary key,
  category_id int not null references categories(id),
  slug text unique not null, name text not null, icon text
);
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Player', avatar_url text, bio text,
  rating_avg numeric(3,2) not null default 0, rating_count int not null default 0,
  created_at timestamptz not null default now()
);
create table push_tokens (user_id uuid primary key references profiles(id) on delete cascade, token text not null, updated_at timestamptz default now());
create table requests (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references profiles(id) on delete cascade,
  activity_id int not null references activities(id),
  title text, note text, skill_level text default 'Any',
  starts_at timestamptz not null,
  venue_name text not null,
  location geography(point,4326) not null,          -- meeting place chosen by the host
  slots_total int not null check (slots_total between 1 and 50), -- players needed besides the host
  slots_filled int not null default 0,
  status text not null default 'open' check (status in ('open','full','cancelled')),
  details jsonb not null default '{}'::jsonb,       -- extension point for concerts/movies etc.
  created_at timestamptz not null default now()
);
create index on requests using gist(location);
create index on requests(status, starts_at);
create table participants (
  request_id uuid references requests(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (request_id, user_id)
);
create table messages (
  id bigserial primary key,
  request_id uuid not null references requests(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index on messages(request_id, created_at);
create table ratings (
  id bigserial primary key,
  request_id uuid not null references requests(id) on delete cascade,
  rater_id uuid not null references profiles(id) on delete cascade,
  ratee_id uuid not null references profiles(id) on delete cascade,
  score int not null check (score between 1 and 5), comment text,
  created_at timestamptz not null default now(),
  unique (request_id, rater_id, ratee_id)
);
create table blocks (
  blocker_id uuid references profiles(id) on delete cascade,
  blocked_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
create table reports (
  id bigserial primary key,
  reporter_id uuid not null references profiles(id) on delete cascade,
  reported_user_id uuid not null references profiles(id) on delete cascade,
  request_id uuid references requests(id) on delete set null,
  reason text not null, created_at timestamptz not null default now()
);

-- ========== SEED ==========
insert into categories(slug,name) values ('sports','Sports');  -- later: ('concerts',..), ('movies',..)
insert into activities(category_id,slug,name,icon)
select c.id, v.slug, v.name, v.icon from categories c,
 (values ('chess','Chess','♟️'),('cricket','Cricket','🏏'),('football','Football','⚽'),
         ('tennis','Tennis','🎾'),('pickleball','Pickleball','🏓'),('badminton','Badminton','🏸')) as v(slug,name,icon)
where c.slug='sports';

-- ========== HELPERS ==========
create or replace function is_member(rid uuid) returns boolean language sql security definer stable set search_path=public as $$
  select exists(select 1 from requests r where r.id=rid and r.host_id=auth.uid())
      or exists(select 1 from participants p where p.request_id=rid and p.user_id=auth.uid()); $$;
create or replace function is_blocked_pair(a uuid, b uuid) returns boolean language sql security definer stable set search_path=public as $$
  select exists(select 1 from blocks where (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a)); $$;

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into profiles(id, full_name) values (new.id, coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ========== RPCs (all writes to requests/participants/ratings go through these) ==========
create or replace function create_request(p_slug text, p_title text, p_note text, p_skill text, p_starts timestamptz,
  p_venue text, p_lat double precision, p_lng double precision, p_slots int) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_act int; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_starts <= now() then raise exception 'Pick a time in the future'; end if;
  select id into v_act from activities where slug=p_slug;
  if v_act is null then raise exception 'Unknown activity'; end if;
  insert into requests(host_id,activity_id,title,note,skill_level,starts_at,venue_name,location,slots_total)
  values (auth.uid(),v_act,nullif(p_title,''),nullif(p_note,''),coalesce(p_skill,'Any'),p_starts,p_venue,
          st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography,p_slots) returning id into v_id;
  return v_id;
end $$;

-- Caller's own position is only used for this query and never stored.
-- Distance is rounded to the nearest 0.5 km. Meeting-place coordinates are NOT returned here.
create or replace function nearby_requests(p_lat double precision, p_lng double precision, p_radius_km double precision default 10, p_slug text default null)
returns table(id uuid, activity_name text, activity_slug text, activity_icon text, title text, note text, skill_level text,
  starts_at timestamptz, venue_name text, slots_total int, slots_filled int, host_id uuid, host_name text, host_rating numeric,
  distance_km numeric, is_host boolean, has_joined boolean)
language sql security definer stable set search_path=public as $$
  select r.id, a.name, a.slug, a.icon, r.title, r.note, r.skill_level, r.starts_at, r.venue_name, r.slots_total, r.slots_filled,
         r.host_id, p.full_name, p.rating_avg,
         greatest(0.5, round((st_distance(r.location, st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography)/1000.0*2)::numeric)/2),
         r.host_id = auth.uid(),
         exists(select 1 from participants x where x.request_id=r.id and x.user_id=auth.uid())
  from requests r join activities a on a.id=r.activity_id join profiles p on p.id=r.host_id
  where r.status='open' and r.starts_at > now()
    and st_dwithin(r.location, st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography, p_radius_km*1000)
    and (p_slug is null or a.slug=p_slug)
    and not is_blocked_pair(auth.uid(), r.host_id)
  order by r.starts_at asc limit 100; $$;

create or replace function join_request(p_request uuid) returns void language plpgsql security definer set search_path=public as $$
declare r requests%rowtype;
begin
  select * into r from requests where id=p_request for update;
  if not found then raise exception 'Request not found'; end if;
  if r.status <> 'open' then raise exception 'This request is no longer open'; end if;
  if r.starts_at <= now() then raise exception 'This game has already started'; end if;
  if r.host_id = auth.uid() then raise exception 'You are the host of this request'; end if;
  if is_blocked_pair(auth.uid(), r.host_id) then raise exception 'This request is not available'; end if;
  insert into participants(request_id,user_id) values (p_request, auth.uid()) on conflict do nothing;
  if found then
    update requests set slots_filled = slots_filled+1,
      status = case when slots_filled+1 >= slots_total then 'full' else 'open' end where id=p_request;
  end if;
end $$;

create or replace function leave_request(p_request uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  delete from participants where request_id=p_request and user_id=auth.uid();
  if found then
    update requests set slots_filled = greatest(slots_filled-1,0),
      status = case when status='full' and starts_at > now() then 'open' else status end where id=p_request;
  end if;
end $$;

create or replace function cancel_request(p_request uuid) returns void language sql security definer set search_path=public as $$
  update requests set status='cancelled' where id=p_request and host_id=auth.uid(); $$;

-- Exact meeting coordinates and participant list only go to the host and people who joined.
create or replace function request_detail(p_id uuid) returns jsonb language plpgsql security definer stable set search_path=public as $$
declare r requests%rowtype; v_member boolean; v_out jsonb;
begin
  select * into r from requests where id=p_id;
  if not found or is_blocked_pair(auth.uid(), r.host_id) then return null; end if;
  v_member := is_member(p_id);
  select jsonb_build_object(
    'id',r.id,'title',r.title,'note',r.note,'skill_level',r.skill_level,'starts_at',r.starts_at,'venue_name',r.venue_name,
    'slots_total',r.slots_total,'slots_filled',r.slots_filled,'status',r.status,
    'activity_name',a.name,'activity_icon',a.icon,
    'host',jsonb_build_object('id',h.id,'name',h.full_name,'rating',h.rating_avg,'rating_count',h.rating_count),
    'is_host', r.host_id=auth.uid(), 'is_member', v_member,
    'lat', case when v_member then st_y(r.location::geometry) end,
    'lng', case when v_member then st_x(r.location::geometry) end,
    'participants', case when v_member then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'rating',p.rating_avg))
        from participants x join profiles p on p.id=x.user_id where x.request_id=r.id),'[]'::jsonb) else '[]'::jsonb end
  ) into v_out from activities a, profiles h where a.id=r.activity_id and h.id=r.host_id;
  return v_out;
end $$;

create or replace function my_requests() returns table(id uuid, activity_name text, activity_icon text, title text, starts_at timestamptz,
  venue_name text, status text, slots_total int, slots_filled int, role text)
language sql security definer stable set search_path=public as $$
  select r.id, a.name, a.icon, r.title, r.starts_at, r.venue_name, r.status, r.slots_total, r.slots_filled,
         case when r.host_id=auth.uid() then 'host' else 'player' end
  from requests r join activities a on a.id=r.activity_id
  where r.host_id=auth.uid() or exists(select 1 from participants x where x.request_id=r.id and x.user_id=auth.uid())
  order by r.starts_at desc limit 100; $$;

-- ========== RATINGS ==========
create or replace function rate_user(p_request uuid, p_ratee uuid, p_score int, p_comment text default null) returns void
language plpgsql security definer set search_path=public as $$
declare r requests%rowtype;
begin
  select * into r from requests where id=p_request;
  if not found then raise exception 'Request not found'; end if;
  if r.starts_at > now() then raise exception 'You can rate after the game starts'; end if;
  if p_ratee = auth.uid() then raise exception 'You cannot rate yourself'; end if;
  if not is_member(p_request) then raise exception 'Only players in this game can rate'; end if;
  if not (r.host_id=p_ratee or exists(select 1 from participants where request_id=p_request and user_id=p_ratee)) then
    raise exception 'That person was not in this game'; end if;
  insert into ratings(request_id,rater_id,ratee_id,score,comment) values (p_request,auth.uid(),p_ratee,p_score,p_comment);
end $$;

create or replace function refresh_rating() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update profiles set rating_avg=(select round(avg(score)::numeric,2) from ratings where ratee_id=new.ratee_id),
                      rating_count=(select count(*) from ratings where ratee_id=new.ratee_id) where id=new.ratee_id;
  return new;
end $$;
create trigger on_rating after insert on ratings for each row execute function refresh_rating();

-- ========== SAFETY ==========
create or replace function block_user(p_user uuid) returns void language sql security definer set search_path=public as $$
  insert into blocks(blocker_id,blocked_id) select auth.uid(), p_user where p_user <> auth.uid() on conflict do nothing; $$;
create or replace function report_user(p_user uuid, p_request uuid, p_reason text) returns void language sql security definer set search_path=public as $$
  insert into reports(reporter_id,reported_user_id,request_id,reason) values (auth.uid(),p_user,p_request,p_reason); $$;

-- ========== ROW LEVEL SECURITY ==========
alter table categories enable row level security;   create policy "read" on categories for select to authenticated using (true);
alter table activities enable row level security;   create policy "read" on activities for select to authenticated using (true);
alter table profiles enable row level security;
create policy "read" on profiles for select to authenticated using (true);
create policy "update own" on profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
revoke update on profiles from authenticated; grant update (full_name, avatar_url, bio) on profiles to authenticated;
alter table push_tokens enable row level security;
create policy "own" on push_tokens for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
alter table requests enable row level security;
create policy "members read" on requests for select to authenticated using (is_member(id));
alter table participants enable row level security;
create policy "members read" on participants for select to authenticated using (user_id=auth.uid() or is_member(request_id));
alter table messages enable row level security;
create policy "members read" on messages for select to authenticated using (is_member(request_id) and not is_blocked_pair(auth.uid(), sender_id));
create policy "members write" on messages for insert to authenticated with check (
  sender_id=auth.uid() and is_member(request_id) and exists(select 1 from requests where id=request_id and status<>'cancelled'));
alter table ratings enable row level security;
create policy "involved read" on ratings for select to authenticated using (rater_id=auth.uid() or ratee_id=auth.uid());
alter table blocks enable row level security;
create policy "own" on blocks for all to authenticated using (blocker_id=auth.uid()) with check (blocker_id=auth.uid());
alter table reports enable row level security;
create policy "file report" on reports for insert to authenticated with check (reporter_id=auth.uid());

alter publication supabase_realtime add table messages;
