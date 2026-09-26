-- Changing plans: cancel (host) or drop out (joiner) with an optional reason, and move a plan's time.
-- The squad or host gets an alert, and drop-outs / time changes show up as a notice in the group chat.
-- No penalties: dropping out never affects scores. Run in the Supabase SQL editor after 010_plan_details.sql. Safe to run more than once.

alter table requests add column if not exists cancel_reason text;

-- Chat notices ("Aarav can't make it", "Moved to Sat 7 PM") are messages of kind 'system', written only by these functions.
alter table messages drop constraint if exists messages_kind_check;
alter table messages add constraint messages_kind_check check (kind in ('text','poll','system'));
drop policy if exists "members write" on messages;
create policy "members write" on messages for insert to authenticated with check (
  sender_id = auth.uid() and kind <> 'system' and is_member(request_id)
  and exists(select 1 from requests where id = request_id and status <> 'cancelled'));

-- Tidies a free-text reason: trimmed, at most 200 characters, null when empty.
create or replace function clean_reason(p text) returns text language sql immutable as $$
  select nullif(left(trim(coalesce(p, '')), 200), ''); $$;

create or replace function fmt_when(t timestamptz) returns text language sql immutable as $$
  select to_char(t at time zone 'Asia/Kolkata', 'Dy DD Mon, FMHH12:MI AM'); $$;

-- Host cancels. Everyone who joined gets an alert with the reason.
drop function if exists cancel_request(uuid);
create or replace function cancel_request(p_request uuid, p_reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare r requests%rowtype; v_act text; v_icon text; v_host text; v_reason text := clean_reason(p_reason);
begin
  select * into r from requests where id = p_request for update;
  if not found or r.host_id <> auth.uid() then raise exception 'Only the host can cancel this plan'; end if;
  if r.status = 'cancelled' then return; end if;
  update requests set status = 'cancelled', cancel_reason = v_reason where id = p_request;
  select name, icon into v_act, v_icon from activities where id = r.activity_id;
  select full_name into v_host from profiles where id = r.host_id;
  insert into notifications(user_id, request_id, actor_id, kind, title, body)
  select x.user_id, r.id, r.host_id, 'cancelled',
         format('💔 %s %s is cancelled', v_icon, coalesce(r.title, v_act)),
         format('%s cancelled the plan at %s (%s).%s', v_host, r.venue_name, fmt_when(r.starts_at),
                case when v_reason is not null then format(' Reason: %s', v_reason) else '' end)
  from participants x where x.request_id = r.id;
end $$;

-- Joiner drops out. Frees the spot, alerts the host and posts a notice in the chat.
drop function if exists leave_request(uuid);
create or replace function leave_request(p_request uuid, p_reason text default null) returns void
language plpgsql security definer set search_path=public as $$
declare r requests%rowtype; v_me text; v_act text; v_icon text; v_reason text := clean_reason(p_reason);
begin
  select * into r from requests where id = p_request for update;
  if not found then raise exception 'Plan not found'; end if;
  delete from participants where request_id = p_request and user_id = auth.uid();
  if not found then return; end if;
  update requests set slots_filled = greatest(slots_filled - 1, 0),
    status = case when status = 'full' and starts_at > now() then 'open' else status end where id = p_request;
  if r.status = 'cancelled' then return; end if;
  select full_name into v_me from profiles where id = auth.uid();
  select name, icon into v_act, v_icon from activities where id = r.activity_id;
  insert into notifications(user_id, request_id, actor_id, kind, title, body)
  values (r.host_id, r.id, auth.uid(), 'left',
          format('%s %s can''t make it', v_icon, v_me),
          format('%s dropped out of %s at %s. The spot is open again.%s', v_me, coalesce(r.title, v_act), r.venue_name,
                 case when v_reason is not null then format(' Reason: %s', v_reason) else '' end));
  insert into messages(request_id, sender_id, kind, body)
  values (r.id, auth.uid(), 'system', format('👋 %s can''t make it%s', v_me, case when v_reason is not null then format(' (%s)', v_reason) else '' end));
end $$;

-- Host moves the plan to a new time instead of cancelling. Everyone who joined gets an alert.
create or replace function reschedule_request(p_request uuid, p_starts timestamptz) returns void
language plpgsql security definer set search_path=public as $$
declare r requests%rowtype; v_act text; v_icon text;
begin
  select * into r from requests where id = p_request for update;
  if not found or r.host_id <> auth.uid() then raise exception 'Only the host can change the time'; end if;
  if r.status = 'cancelled' then raise exception 'This plan is cancelled'; end if;
  if p_starts <= now() then raise exception 'Pick a time in the future'; end if;
  if p_starts = r.starts_at then return; end if;
  update requests set starts_at = p_starts where id = p_request;
  select name, icon into v_act, v_icon from activities where id = r.activity_id;
  insert into notifications(user_id, request_id, actor_id, kind, title, body)
  select x.user_id, r.id, r.host_id, 'moved',
         format('🗓 %s %s has a new time', v_icon, coalesce(r.title, v_act)),
         format('Now %s (was %s) at %s.', fmt_when(p_starts), fmt_when(r.starts_at), r.venue_name)
  from participants x where x.request_id = r.id;
  insert into messages(request_id, sender_id, kind, body)
  values (r.id, auth.uid(), 'system', format('🗓 Plan moved to %s', fmt_when(p_starts)));
end $$;

grant execute on function cancel_request(uuid, text), leave_request(uuid, text), reschedule_request(uuid, timestamptz) to authenticated;

-- my_requests and request_detail also return the cancel reason.
drop function if exists my_requests();
create or replace function my_requests() returns table(id uuid, activity_name text, activity_icon text, activity_slug text, title text,
  starts_at timestamptz, venue_name text, status text, slots_total int, slots_filled int, role text,
  ended boolean, kudos_given boolean, album_count int, crew_name text, cancel_reason text)
language sql security definer stable set search_path=public as $$
  select r.id, a.name, a.icon, a.slug, r.title, r.starts_at, r.venue_name, r.status, r.slots_total, r.slots_filled,
         case when r.host_id = auth.uid() then 'host' else 'player' end,
         r.starts_at + interval '2 hours' < now(),
         exists(select 1 from kudos k where k.request_id = r.id and k.giver_id = auth.uid()),
         (select count(*)::int from user_photos u where u.request_id = r.id),
         cr.name, r.cancel_reason
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
    'cancel_reason', r.cancel_reason, 'women_only', r.women_only, 'featured_label', r.featured_label, 'checkin_enabled', r.checkin_enabled,
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
