-- Sport alerts. Run in the Supabase SQL editor after schema.sql. Safe to run more than once.
-- Players pick their sports; when someone raises a request, every player who picked that sport and whose
-- alert area is within their chosen distance of the venue gets an in-app notification (and a push, via the notify function).

-- ========== TABLES ==========
create table if not exists user_sports (
  user_id uuid references profiles(id) on delete cascade,
  activity_id int references activities(id) on delete cascade,
  primary key (user_id, activity_id)
);
create index if not exists user_sports_activity_id_idx on user_sports(activity_id);

-- Approximate area (rounded to ~1 km) used only to decide who gets alerts. Readable only by its owner.
create table if not exists alert_areas (
  user_id uuid primary key references profiles(id) on delete cascade,
  area geography(point,4326),
  radius_km int not null default 10 check (radius_km between 1 and 100),
  updated_at timestamptz not null default now()
);
create index if not exists alert_areas_area_idx on alert_areas using gist(area);

create table if not exists notifications (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  request_id uuid references requests(id) on delete cascade,
  title text not null, body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_id_created_at_idx on notifications(user_id, created_at desc);

-- ========== SIGNUP: save sports picked on the register screen (sent as user metadata) ==========
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into profiles(id, full_name) values (new.id, coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1)));
  if jsonb_typeof(new.raw_user_meta_data->'sports') = 'array' then
    insert into user_sports(user_id, activity_id)
    select new.id, a.id from activities a
    where a.slug in (select jsonb_array_elements_text(new.raw_user_meta_data->'sports'));
  end if;
  return new;
end $$;

-- ========== RPCs ==========
create or replace function set_my_sports(p_slugs text[]) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from user_sports where user_id=auth.uid();
  insert into user_sports(user_id, activity_id) select auth.uid(), id from activities where slug = any(p_slugs);
end $$;

-- Rounded to 2 decimals (~1 km) on the server, so the exact position is never stored.
create or replace function set_alert_area(p_lat double precision, p_lng double precision) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into alert_areas(user_id, area)
  values (auth.uid(), st_setsrid(st_makepoint(round(p_lng::numeric,2)::float8, round(p_lat::numeric,2)::float8),4326)::geography)
  on conflict (user_id) do update set area=excluded.area, updated_at=now();
end $$;

create or replace function set_alert_radius(p_km int) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into alert_areas(user_id, radius_km) values (auth.uid(), p_km)
  on conflict (user_id) do update set radius_km=excluded.radius_km, updated_at=now();
end $$;

-- ========== FAN-OUT: new request -> notifications for nearby players of that sport ==========
create or replace function notify_sport_followers() returns trigger language plpgsql security definer set search_path=public as $$
declare v_sport text; v_host text;
begin
  select name into v_sport from activities where id=new.activity_id;
  select full_name into v_host from profiles where id=new.host_id;
  insert into notifications(user_id, request_id, title, body)
  select s.user_id, new.id,
         format('New %s game near you', v_sport),
         format('%s needs %s player%s at %s', v_host, new.slots_total, case when new.slots_total > 1 then 's' else '' end, new.venue_name)
  from user_sports s join alert_areas z on z.user_id=s.user_id
  where s.activity_id=new.activity_id
    and s.user_id <> new.host_id
    and z.area is not null
    and st_dwithin(z.area, new.location, z.radius_km*1000)
    and not is_blocked_pair(s.user_id, new.host_id);
  return new;
end $$;
drop trigger if exists on_request_created on requests;
create trigger on_request_created after insert on requests for each row execute function notify_sport_followers();

-- ========== ROW LEVEL SECURITY ==========
-- The register screen lists sports before the user is signed in.
drop policy if exists "public read" on activities;
create policy "public read" on activities for select to anon using (true);
alter table user_sports enable row level security;
drop policy if exists "own" on user_sports;
create policy "own" on user_sports for select to authenticated using (user_id=auth.uid());
alter table alert_areas enable row level security;
drop policy if exists "own" on alert_areas;
create policy "own" on alert_areas for select to authenticated using (user_id=auth.uid());
alter table notifications enable row level security;
drop policy if exists "own read" on notifications;
create policy "own read" on notifications for select to authenticated using (user_id=auth.uid());
drop policy if exists "own update" on notifications;
create policy "own update" on notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
revoke update on notifications from authenticated; grant update (read_at) on notifications to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications') then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;
