-- Optional map pin. Run in the Supabase SQL editor after 003_categories.sql. Safe to run more than once.
-- With a pin, requests.location is the exact meeting spot. Without one, it is the host's area rounded to ~1 km,
-- used only for "nearby" search and alerts, and never shown on a map.

alter table requests add column if not exists has_pin boolean not null default true;

drop function if exists create_request(text,text,text,text,timestamptz,text,double precision,double precision,int);
create or replace function create_request(p_slug text, p_title text, p_note text, p_skill text, p_starts timestamptz,
  p_venue text, p_lat double precision, p_lng double precision, p_slots int, p_has_pin boolean default true) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_act int; v_id uuid; v_lat double precision := p_lat; v_lng double precision := p_lng;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_starts <= now() then raise exception 'Pick a time in the future'; end if;
  select id into v_act from activities where slug=p_slug;
  if v_act is null then raise exception 'Unknown activity'; end if;
  if not p_has_pin then
    v_lat := round(p_lat::numeric, 2)::float8;
    v_lng := round(p_lng::numeric, 2)::float8;
  end if;
  insert into requests(host_id,activity_id,title,note,skill_level,starts_at,venue_name,location,slots_total,has_pin)
  values (auth.uid(),v_act,nullif(p_title,''),nullif(p_note,''),coalesce(p_skill,'Any'),p_starts,p_venue,
          st_setsrid(st_makepoint(v_lng,v_lat),4326)::geography,p_slots,p_has_pin) returning id into v_id;
  return v_id;
end $$;

-- Pinned plans: members get the exact pin; everyone else gets the pin rounded to ~1 km (shown as an area circle).
-- Unpinned plans return no coordinates at all.
create or replace function request_detail(p_id uuid) returns jsonb language plpgsql security definer stable set search_path=public as $$
declare r requests%rowtype; v_member boolean; v_out jsonb; v_lat double precision; v_lng double precision;
begin
  select * into r from requests where id=p_id;
  if not found or is_blocked_pair(auth.uid(), r.host_id) then return null; end if;
  v_member := is_member(p_id);
  v_lat := st_y(r.location::geometry); v_lng := st_x(r.location::geometry);
  select jsonb_build_object(
    'id',r.id,'title',r.title,'note',r.note,'skill_level',r.skill_level,'starts_at',r.starts_at,'venue_name',r.venue_name,
    'slots_total',r.slots_total,'slots_filled',r.slots_filled,'status',r.status,
    'activity_name',a.name,'activity_icon',a.icon,
    'host',jsonb_build_object('id',h.id,'name',h.full_name,'rating',h.rating_avg,'rating_count',h.rating_count),
    'is_host', r.host_id=auth.uid(), 'is_member', v_member, 'has_pin', r.has_pin,
    'lat', case when v_member and r.has_pin then v_lat end,
    'lng', case when v_member and r.has_pin then v_lng end,
    'approx_lat', case when r.has_pin then round(v_lat::numeric, 2) end,
    'approx_lng', case when r.has_pin then round(v_lng::numeric, 2) end,
    'participants', case when v_member then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'rating',p.rating_avg))
        from participants x join profiles p on p.id=x.user_id where x.request_id=r.id),'[]'::jsonb) else '[]'::jsonb end
  ) into v_out from activities a, profiles h where a.id=r.activity_id and h.id=r.host_id;
  return v_out;
end $$;
