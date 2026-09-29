-- Performance: indexes for the lookups the app makes most, and per-plan realtime for chat reactions and poll votes.
-- Run in the Supabase SQL editor after 013_open_plans.sql. Safe to run more than once.

-- 1. Indexes
create index if not exists requests_host_id_idx on requests(host_id);
create index if not exists requests_crew_id_idx on requests(crew_id) where crew_id is not null;
create index if not exists requests_venue_idx on requests(lower(trim(venue_name)));        -- venue pages
create index if not exists participants_user_id_idx on participants(user_id);              -- "plans I joined"
create index if not exists crew_members_user_id_idx on crew_members(user_id);
create index if not exists kudos_giver_idx on kudos(request_id, giver_id);

-- 2. Reactions and poll votes carry their plan id, so a chat can listen to its own plan only
--    (before, every open chat reloaded on every reaction or vote anywhere). Filled in automatically on insert.
alter table message_reactions add column if not exists request_id uuid references requests(id) on delete cascade;
alter table poll_votes add column if not exists request_id uuid references requests(id) on delete cascade;
update message_reactions mr set request_id = m.request_id from messages m where m.id = mr.message_id and mr.request_id is null;
update poll_votes pv set request_id = m.request_id from messages m where m.id = pv.message_id and pv.request_id is null;
create index if not exists message_reactions_request_id_idx on message_reactions(request_id);
create index if not exists poll_votes_request_id_idx on poll_votes(request_id);

create or replace function set_message_request_id() returns trigger language plpgsql security definer set search_path=public as $$
begin
  select request_id into new.request_id from messages where id = new.message_id;
  return new;
end $$;
drop trigger if exists message_reactions_request_id on message_reactions;
create trigger message_reactions_request_id before insert on message_reactions for each row execute function set_message_request_id();
drop trigger if exists poll_votes_request_id on poll_votes;
create trigger poll_votes_request_id before insert or update of message_id on poll_votes for each row execute function set_message_request_id();

-- 3. My plans: same result, now uses the indexes above.
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
  -- Union of two indexed lookups (plans I host, plans I joined) instead of an OR that forces a full scan.
  where r.id in (select h.id from requests h where h.host_id = auth.uid()
                 union select x.request_id from participants x where x.user_id = auth.uid())
  order by r.starts_at desc limit 100; $$;
