-- Rich profiles: up to 6 profile photos, up to 30 "moments" (photos from past plans, tagged with an activity),
-- a short bio, and a public profile view. Run in the Supabase SQL editor after 006_share_spot.sql. Safe to run more than once.

-- ========== STORAGE: public "photos" bucket, each user writes only inside their own folder (<user id>/...) ==========
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "photos read" on storage.objects;
create policy "photos read" on storage.objects for select to authenticated using (bucket_id = 'photos');
drop policy if exists "photos upload own folder" on storage.objects;
create policy "photos upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photos delete own folder" on storage.objects;
create policy "photos delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ========== TABLES ==========
create table if not exists user_photos (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('profile','moment')),
  path text not null,                                            -- storage path in the "photos" bucket
  activity_id int references activities(id) on delete set null,  -- moments: which activity it was
  caption text check (char_length(caption) <= 120),
  position int not null default 0,                               -- profile photos: 0 = main photo
  created_at timestamptz not null default now()
);
create index if not exists user_photos_user_id_kind_position_idx on user_photos(user_id, kind, position);

-- (The limit is computed first: a CASE inside an IF condition would clash with IF ... THEN in PL/pgSQL.)
create or replace function cap_user_photos() returns trigger language plpgsql set search_path=public as $$
declare v_limit int := 30;
begin
  if new.kind = 'profile' then v_limit := 6; end if;
  if (select count(*) from user_photos where user_id=new.user_id and kind=new.kind) >= v_limit then
    raise exception 'You can have up to % % photos', v_limit, new.kind;
  end if;
  return new;
end $$;
drop trigger if exists on_user_photo_insert on user_photos;
create trigger on_user_photo_insert before insert on user_photos for each row execute function cap_user_photos();

-- Short bio (existing longer bios are left alone; new edits must fit).
alter table profiles drop constraint if exists profiles_bio_length;
alter table profiles add constraint profiles_bio_length check (bio is null or char_length(bio) <= 160) not valid;

-- ========== RLS: own rows only; other people's photos come through public_profile() ==========
alter table user_photos enable row level security;
drop policy if exists "own read" on user_photos;
create policy "own read" on user_photos for select to authenticated using (user_id=auth.uid());
drop policy if exists "own insert" on user_photos;
create policy "own insert" on user_photos for insert to authenticated with check (user_id=auth.uid());
drop policy if exists "own update" on user_photos;
create policy "own update" on user_photos for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "own delete" on user_photos;
create policy "own delete" on user_photos for delete to authenticated using (user_id=auth.uid());

-- ========== PUBLIC PROFILE ==========
create or replace function public_profile(p_user uuid) returns jsonb language plpgsql security definer stable set search_path=public as $$
declare v jsonb;
begin
  if auth.uid() is null or is_blocked_pair(auth.uid(), p_user) then return null; end if;
  select jsonb_build_object(
    'id', p.id, 'name', p.full_name, 'bio', p.bio, 'avatar_url', p.avatar_url,
    'rating', p.rating_avg, 'rating_count', p.rating_count, 'member_since', p.created_at, 'is_me', p.id = auth.uid(),
    'plans_done', (select count(*) from requests r where r.starts_at < now() and r.status <> 'cancelled'
                    and (r.host_id = p.id and r.slots_filled > 0 or exists(select 1 from participants x where x.request_id = r.id and x.user_id = p.id))),
    'interests', coalesce((select jsonb_agg(jsonb_build_object('slug', a.slug, 'name', a.name, 'icon', a.icon, 'category', c.slug) order by a.id)
                  from user_sports s join activities a on a.id = s.activity_id join categories c on c.id = a.category_id where s.user_id = p.id), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'path', u.path) order by u.position, u.id)
                  from user_photos u where u.user_id = p.id and u.kind = 'profile'), '[]'::jsonb),
    'moments', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'path', u.path, 'caption', u.caption, 'activity_name', a.name, 'activity_icon', a.icon) order by u.created_at desc)
                  from user_photos u left join activities a on a.id = u.activity_id where u.user_id = p.id and u.kind = 'moment'), '[]'::jsonb)
  ) into v from profiles p where p.id = p_user;
  return v;
end $$;

-- ========== ALERTS: remember who started the plan, so an alert can open their profile ==========
alter table notifications add column if not exists actor_id uuid references profiles(id) on delete set null;

create or replace function notify_sport_followers() returns trigger language plpgsql security definer set search_path=public as $$
declare v_name text; v_icon text; v_host text;
begin
  select name, icon into v_name, v_icon from activities where id=new.activity_id;
  select full_name into v_host from profiles where id=new.host_id;
  insert into notifications(user_id, request_id, actor_id, title, body)
  select s.user_id, new.id, new.host_id,
         format('%s New %s plan near you', v_icon, v_name),
         format('%s is looking for %s more at %s', v_host, new.slots_total, new.venue_name)
  from user_sports s join alert_areas z on z.user_id=s.user_id
  where s.activity_id=new.activity_id
    and s.user_id <> new.host_id
    and z.area is not null
    and st_dwithin(z.area, new.location, z.radius_km*1000)
    and not is_blocked_pair(s.user_id, new.host_id);
  return new;
end $$;

-- Older alerts: fill in who started the plan.
update notifications n set actor_id = r.host_id from requests r where n.request_id = r.id and n.actor_id is null;

-- ========== PLAN DETAILS: include profile pictures (same rules as 006, plus avatar_url) ==========
create or replace function request_detail(p_id uuid) returns jsonb language plpgsql security definer stable set search_path=public as $$
declare r requests%rowtype; v_member boolean; v_access text; v_out jsonb; v_lat double precision; v_lng double precision;
begin
  select * into r from requests where id=p_id;
  if not found or is_blocked_pair(auth.uid(), r.host_id) then return null; end if;
  v_member := is_member(p_id);
  v_access := case
    when not r.has_pin then null
    when v_member then 'member'
    when exists(select 1 from user_sports s where s.user_id=auth.uid() and s.activity_id=r.activity_id) then 'interest'
  end;
  v_lat := st_y(r.location::geometry); v_lng := st_x(r.location::geometry);
  select jsonb_build_object(
    'id',r.id,'title',r.title,'note',r.note,'skill_level',r.skill_level,'starts_at',r.starts_at,'venue_name',r.venue_name,
    'slots_total',r.slots_total,'slots_filled',r.slots_filled,'status',r.status,
    'activity_name',a.name,'activity_icon',a.icon,
    'host',jsonb_build_object('id',h.id,'name',h.full_name,'rating',h.rating_avg,'rating_count',h.rating_count,'avatar_url',h.avatar_url),
    'is_host', r.host_id=auth.uid(), 'is_member', v_member, 'has_pin', r.has_pin, 'spot_access', v_access,
    'lat', case when v_access is not null then v_lat end,
    'lng', case when v_access is not null then v_lng end,
    'approx_lat', case when r.has_pin then round(v_lat::numeric, 2) end,
    'approx_lng', case when r.has_pin then round(v_lng::numeric, 2) end,
    'participants', case when v_member then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'rating',p.rating_avg,'avatar_url',p.avatar_url))
        from participants x join profiles p on p.id=x.user_id where x.request_id=r.id),'[]'::jsonb) else '[]'::jsonb end
  ) into v_out from activities a, profiles h where a.id=r.activity_id and h.id=r.host_id;
  return v_out;
end $$;
