-- Share the exact spot (and so the Google Maps link) with players into that activity, not only with people who joined.
-- Run in the Supabase SQL editor after 005_otp_login.sql. Safe to run more than once.
-- 'spot_access' tells the app why the viewer sees the exact pin: 'member' (host or joined), 'interest' (picked this activity), or null.

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
    'host',jsonb_build_object('id',h.id,'name',h.full_name,'rating',h.rating_avg,'rating_count',h.rating_count),
    'is_host', r.host_id=auth.uid(), 'is_member', v_member, 'has_pin', r.has_pin, 'spot_access', v_access,
    'lat', case when v_access is not null then v_lat end,
    'lng', case when v_access is not null then v_lng end,
    'approx_lat', case when r.has_pin then round(v_lat::numeric, 2) end,
    'approx_lng', case when r.has_pin then round(v_lng::numeric, 2) end,
    'participants', case when v_member then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'rating',p.rating_avg))
        from participants x join profiles p on p.id=x.user_id where x.request_id=r.id),'[]'::jsonb) else '[]'::jsonb end
  ) into v_out from activities a, profiles h where a.id=r.activity_id and h.id=r.host_id;
  return v_out;
end $$;
