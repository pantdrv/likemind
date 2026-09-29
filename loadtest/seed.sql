-- Load-test data: fake users, plans, joins and chat messages around one city.
-- Run with psql against a TEST database (local copy or a separate Supabase test project), never the live one:
--   psql "$DB_URL" -v users=1000 -v plans=20000 -v lat=12.97 -v lng=77.59 -f loadtest/seed.sql
-- Everything it creates belongs to users with emails loadtest+N@example.com; loadtest/cleanup.sql removes it all.
\set ON_ERROR_STOP on
\timing on

-- 1. Users. The signup trigger creates each profile and saves 3-5 random interests from the "sports" metadata,
--    the same way the app's register screen does.
insert into auth.users(id, email, raw_user_meta_data)
select gen_random_uuid(), format('loadtest+%s@example.com', g),
       jsonb_build_object('full_name', format('Tester %s', g),
         'sports', (select jsonb_agg(slug) from (select slug from activities where id > -g order by random() limit 3 + g % 3) s))
from generate_series(1, :users) g;

-- 2. Home areas spread over ~30 km around the centre, with the app's alert distances.
insert into alert_areas(user_id, radius_km, area)
select u.id, (array[2, 5, 10, 10, 25])[1 + floor(random() * 5)::int],
       st_setsrid(st_makepoint(round((:lng + (random() - 0.5) * 0.3)::numeric, 2)::float8,
                               round((:lat + (random() - 0.5) * 0.3)::numeric, 2)::float8), 4326)::geography
from auth.users u where u.email like 'loadtest+%'
on conflict (user_id) do update set area = excluded.area, radius_km = excluded.radius_km;

-- 3. Plans: ~5/6 in the past (history), ~1/6 in the next 10 days. Alerts are switched off while seeding
--    (otherwise every seeded plan would fan out notifications); they're back on for the test itself.
alter table requests disable trigger on_request_created;
with u as (select array_agg(id) ids, count(*) n from auth.users where email like 'loadtest+%'),
     a as (select array_agg(id) ids, count(*) n from activities)
insert into requests(host_id, activity_id, title, skill_level, starts_at, venue_name, location, slots_total, open_ended, status, created_at)
select u.ids[1 + floor(random() * u.n)::int], a.ids[1 + floor(random() * a.n)::int], format('Load test plan %s', g), 'Any',
       now() + make_interval(mins => (random() * 60 * 24 * 60 - 60 * 24 * 50)::int),
       format('Venue %s', g % 300),
       st_setsrid(st_makepoint(:lng + (random() - 0.5) * 0.3, :lat + (random() - 0.5) * 0.3), 4326)::geography,
       case when g % 5 = 0 then 50 else 2 + g % 5 end, g % 5 = 0,
       case when g % 20 = 0 then 'cancelled' else 'open' end,
       now() - interval '60 days' + make_interval(mins => (random() * 60 * 24 * 58)::int)
from generate_series(1, :plans) g, u, a;
alter table requests enable trigger on_request_created;

-- 4. People who joined (never the host, never over the limit), then counts and "full" status to match.
with u as (select array_agg(id) ids, count(*) n from auth.users where email like 'loadtest+%')
insert into participants(request_id, user_id, joined_at)
select r.id, u.ids[1 + floor(random() * u.n)::int], r.created_at
from requests r, u, lateral generate_series(1, floor(random() * (least(r.slots_total, 5) + 1))::int) k
where r.title like 'Load test plan %'
on conflict do nothing;
delete from participants p using requests r where r.id = p.request_id and p.user_id = r.host_id and r.title like 'Load test plan %';
delete from participants p using (
  select x.request_id, x.user_id, row_number() over (partition by x.request_id order by x.joined_at, x.user_id) rn, r.slots_total
  from participants x join requests r on r.id = x.request_id where r.title like 'Load test plan %') o
where p.request_id = o.request_id and p.user_id = o.user_id and o.rn > o.slots_total;
update requests r set slots_filled = coalesce(c.n, 0),
  status = case when r.status = 'cancelled' then 'cancelled' when coalesce(c.n, 0) >= r.slots_total then 'full' else 'open' end
from (select r2.id, (select count(*) from participants p where p.request_id = r2.id) n from requests r2 where r2.title like 'Load test plan %') c
where c.id = r.id;

-- 5. Chat: a few messages in about a third of plans, from people in them.
insert into messages(request_id, sender_id, body, created_at)
select p.request_id, p.user_id, format('Load test message %s', floor(random() * 1000)::int), p.joined_at + make_interval(mins => k)
from participants p join requests r on r.id = p.request_id, generate_series(1, 3) k
where r.title like 'Load test plan %' and r.status <> 'cancelled' and hashtext(r.id::text) % 3 = 0;

analyze;
select (select count(*) from auth.users where email like 'loadtest+%') users,
       (select count(*) from requests where title like 'Load test plan %') plans,
       (select count(*) from requests where title like 'Load test plan %' and starts_at > now() and status = 'open') upcoming_open,
       (select count(*) from participants p join requests r on r.id = p.request_id where r.title like 'Load test plan %') joins,
       (select count(*) from messages m join requests r on r.id = m.request_id where r.title like 'Load test plan %') messages;
