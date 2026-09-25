-- Activity-specific plan fields (e.g. movie language/format, concert tickets, PS5 setup), stored in requests.details.
-- Run in the Supabase SQL editor after 009_categories_v3.sql. Safe to run more than once.

drop function if exists create_request(text,text,text,text,timestamptz,text,double precision,double precision,int,boolean,boolean,uuid);
create or replace function create_request(p_slug text, p_title text, p_note text, p_skill text, p_starts timestamptz,
  p_venue text, p_lat double precision, p_lng double precision, p_slots int, p_has_pin boolean default true,
  p_women_only boolean default false, p_crew_id uuid default null, p_details jsonb default '{}'::jsonb) returns uuid
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
  insert into requests(host_id, activity_id, title, note, skill_level, starts_at, venue_name, location, slots_total, has_pin, women_only, crew_id, details)
  values (auth.uid(), v_act, nullif(p_title,''), nullif(p_note,''), coalesce(p_skill,'Any'), p_starts, p_venue,
          st_setsrid(st_makepoint(v_lng, v_lat),4326)::geography, p_slots, p_has_pin, p_women_only, p_crew_id, coalesce(p_details, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

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
