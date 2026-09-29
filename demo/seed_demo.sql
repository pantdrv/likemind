-- Demo data: 200 realistic-looking people around Indiranagar, Bengaluru, with upcoming plans, past plans,
-- chats, "I'm free" people and crews, so the app looks lived-in.
--
-- Paste the whole file into the Supabase SQL editor and run it (after all supabase/*.sql migrations, 001-015).
-- Every demo account has an email like demo+N@example.com and can't log in. demo/cleanup_demo.sql removes it all.
-- Safe to run again: it first removes any demo data from an earlier (or half-finished) run.
-- To centre it elsewhere, change the two numbers in demo_seed.centre below.

begin;

-- Helper tables live in a scratch schema (the SQL editor doesn't keep temporary tables between statements); dropped at the end.
create schema if not exists demo_seed;

-- Start fresh: remove demo people from any earlier run (their plans, chats and crews go with them).
delete from auth.users where email like 'demo+%@example.com';

drop table if exists demo_seed.centre;
create table demo_seed.centre as select 12.9719::float8 as lat, 77.6412::float8 as lng;  -- Indiranagar

-- ---------------------------------------------------------------------------------------------------------------
-- 1. People
-- ---------------------------------------------------------------------------------------------------------------
drop table if exists demo_seed.demo_people;
create table demo_seed.demo_people as
with w(first) as (select unnest(array['Priya','Ananya','Diya','Ishita','Kavya','Meera','Nisha','Riya','Sneha','Tanvi','Aditi','Pooja',
       'Neha','Shreya','Aisha','Zara','Fatima','Sana','Lakshmi','Divya','Anjali','Kriti','Simran','Nandini','Sara','Tara','Mira','Roshni','Pallavi','Aarohi'])),
     m(first) as (select unnest(array['Aarav','Vihaan','Arjun','Rohan','Kabir','Aditya','Siddharth','Karan','Nikhil','Rahul','Varun','Aman',
       'Ishaan','Dev','Harsh','Kunal','Pranav','Yash','Rajat','Farhan','Imran','Zaid','Arnav','Manish','Abhishek','Vikram','Sahil','Tanmay','Akash','Neel'])),
     women as (select array_agg(first) a from w), men as (select array_agg(first) a from m),
     last(a) as (select array['Sharma','Iyer','Reddy','Menon','Nair','Rao','Gupta','Shetty','Kapoor','Khan','Das','Pillai','Joshi','Mehta',
       'Singh','Bose','Hegde','Kulkarni','Fernandes','D''Souza']),
     bios(a) as (select array[
       'Weekend badminton, weekday filter coffee.', 'New to Bangalore, saying yes to everything 🙌', 'Will trade chai for a good board game.',
       'Morning runs around Ulsoor Lake. Slow pace, good chats.', 'Always hunting the next great dosa.', 'Designer by day, FIFA sweat by night 🎮',
       'Trekking most weekends. Nandi Hills regular.', 'Looking for a doubles partner who doesn''t mind losing 😅', 'Book club, board games, bad puns.',
       'Gym 6am, then way too much coffee.', 'Concerts > everything. Indie and Bollywood.', 'Thrift finds and street food walks.',
       'Pickleball convert. Ask me about it.', 'WFH, so I''m always up for a co-working day.', 'Learning Kannada, happy to swap for Hindi or English.',
       'Cricket every Sunday, rain or shine.', 'Photographer. Golden hour walks, anyone?', 'Brunch enthusiast, professional overthinker.',
       'Yoga in the park and long walks.', 'Here to find my people IRL 👋', 'Chess (rapid, not blitz, I''m slow).', 'Road trips and good playlists.',
       'Carrom champion of my building. Probably.', 'Movies every Friday. First day first show if possible.', 'Engineer, cyclist, weekend baker.',
       'Just moved to Indiranagar, show me around!', 'Football 5-a-side, any position.', 'Café hopping and sketching.', 'Tennis twice a week, looking for rallies.',
       'Swimming laps before work. Coffee after.'])
select g,
       gen_random_uuid() as id,
       case when g % 2 = 0 then 'woman' else 'man' end as gender,
       (case when g % 2 = 0 then women.a else men.a end)[1 + (g / 2) % 30] || ' ' || last.a[1 + ((g / 2) * 7 + (g / 60) * 3) % 20] as name,
       bios.a[1 + (g * 11) % 30] as bio
from generate_series(1, 200) g, women, men, last, bios;

-- The signup trigger creates each profile and saves 3-6 random interests, like the app's sign-up does.
insert into auth.users(id, email, raw_user_meta_data)
select p.id, format('demo+%s@example.com', p.g),
       jsonb_build_object('full_name', p.name,
         'sports', (select jsonb_agg(slug) from (select slug from activities where id > -p.g order by random() limit 3 + p.g % 4) s))
from demo_seed.demo_people p;

-- Generated cartoon avatars (no real faces); every 8th person has none, like real users who skip it.
update profiles pr set bio = p.bio, gender = p.gender,
  avatar_url = case when p.g % 8 = 0 then null
                    else format('https://api.dicebear.com/9.x/notionists/png?seed=demo%s&size=256&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf', p.g) end
from demo_seed.demo_people p where pr.id = p.id;

-- Home areas within ~5 km, with the app's distance options.
insert into alert_areas(user_id, radius_km, area)
select p.id, (array[5, 10, 10, 25])[1 + floor(random() * 4)::int],
       st_setsrid(st_makepoint(round((c.lng + (random() - 0.5) * 0.09)::numeric, 2)::float8,
                               round((c.lat + (random() - 0.5) * 0.09)::numeric, 2)::float8), 4326)::geography
from demo_seed.demo_people p, demo_seed.centre c
on conflict (user_id) do update set area = excluded.area, radius_km = excluded.radius_km;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Plan templates: activity, title, place (approximate coordinates), spots, open to anyone, usual start hours
-- ---------------------------------------------------------------------------------------------------------------
drop table if exists demo_seed.tpl;
create table demo_seed.tpl as
select * from (values
  ('badminton','Evening doubles, need 2 more','Indiranagar Club courts',12.9716,77.6412,3,false,array[6,7,19,20]),
  ('badminton','Morning singles rally','Game Theory, Indiranagar',12.9784,77.6408,1,false,array[6,7]),
  ('badminton','Beginner-friendly doubles','Hudle Courts, Domlur',12.9610,77.6380,3,false,array[18,19,20]),
  ('football','5-a-side on turf, 3 spots','Turf Park, HAL 2nd Stage',12.9699,77.6499,9,false,array[19,20,21]),
  ('football','Morning 7-a-side','BRV Ground turf',12.9750,77.6150,13,false,array[7,8]),
  ('cricket','Box cricket, 6-a-side','Box Cricket Arena, Old Airport Rd',12.9600,77.6480,10,false,array[20,21]),
  ('tennis','Rally session, 1 hour','KSLTA courts, Cubbon Park',12.9780,77.5960,1,false,array[6,7,17]),
  ('pickleball','Pickleball doubles, all levels welcome','Pickle Pad, Indiranagar',12.9695,77.6440,3,false,array[7,18,19]),
  ('cafe-hopping','3 cafés on 12th Main','Third Wave Coffee, 12th Main',12.9712,77.6385,4,true,array[11,16]),
  ('street-food','VV Puram food street crawl','VV Puram Food Street',12.9480,77.5740,4,true,array[19,20]),
  ('brunch','Lazy brunch, long chats','Glen''s Bakehouse, Indiranagar',12.9719,77.6405,4,false,array[10,11]),
  ('new-restaurant','Trying the new ramen place','Naru Noodle Bar',12.9720,77.6380,3,false,array[19,20]),
  ('dessert-run','Late waffles run','The Belgian Waffle Co, 100 Ft Rd',12.9760,77.6410,3,true,array[21,22]),
  ('late-night-food','Midnight Maggi & chai','Chai Point, Indiranagar Metro',12.9784,77.6386,4,true,array[22,23]),
  ('running','Easy 5k around Ulsoor Lake','Ulsoor Lake main gate',12.9824,77.6219,5,true,array[6]),
  ('running','10k, steady pace','Cubbon Park, Queen''s statue',12.9763,77.5929,5,true,array[6]),
  ('gym','Leg day, need a spotter','Cult, Indiranagar',12.9790,77.6410,1,false,array[7,19]),
  ('cycling','Morning loop to Hebbal','Indiranagar Metro station',12.9784,77.6386,4,true,array[6]),
  ('yoga','Slow flow in the park','Defence Colony park',12.9750,77.6480,5,true,array[7,18]),
  ('walk','Evening walk & talk','Indiranagar Double Road',12.9690,77.6400,3,true,array[18,19]),
  ('coworking','Deep-work day, laptops out','Dyu Art Café, Koramangala',12.9360,77.6200,4,true,array[10,14]),
  ('study-session','CAT prep, mock + discussion','Starbucks, 100 Feet Road',12.9770,77.6405,4,true,array[10,16]),
  ('language-exchange','My Kannada for your Hindi','Matteo Coffea, Church Street',12.9750,77.6050,2,false,array[17,18]),
  ('concert','Indie night at The Humming Tree','The Humming Tree, 12th Main',12.9710,77.6390,4,false,array[19,20]),
  ('concert','Live gig at Phoenix','Phoenix Marketcity, Whitefield',12.9976,77.6969,3,false,array[18,19]),
  ('movie','Movie night, row J','PVR Forum, Koramangala',12.9346,77.6112,3,false,array[19,21]),
  ('movie','IMAX show, then dinner','INOX Garuda Mall',12.9702,77.6094,3,false,array[18,21]),
  ('thrifting','Commercial Street thrift haul','Commercial Street',12.9822,77.6083,3,false,array[11,16]),
  ('flea-market','Soul Sante flea market stroll','Soul Sante, Palace Grounds',12.9500,77.6400,4,true,array[12,15]),
  ('mall','Food court + window shopping','Phoenix Marketcity, Whitefield',12.9976,77.6969,3,false,array[16,18]),
  ('chess','Rapid games + coffee','Third Wave Coffee, 12th Main',12.9712,77.6385,1,false,array[17,18]),
  ('carrom','Carrom doubles, best of 3','Board Game Café, Indiranagar',12.9730,77.6420,3,false,array[18,19]),
  ('pool','8-ball, loser buys chai','The Pool House, Indiranagar',12.9760,77.6400,1,false,array[19,20]),
  ('bowling','2 games then dinner','Amoeba, Church Street',12.9757,77.6036,3,false,array[18,19]),
  ('ea-fc','EA FC 2v2 night','Gaming Lounge, HAL 2nd Stage',12.9700,77.6480,3,false,array[20,21]),
  ('call-of-duty','Warzone squad','Gaming Lounge, HAL 2nd Stage',12.9700,77.6480,3,false,array[21,22]),
  ('trek','Skandagiri night trek','Indiranagar Metro station',12.9784,77.6386,6,true,array[1,2]),
  ('sunrise-ride','Nandi Hills sunrise ride','Hebbal flyover, Shell pump',13.0350,77.5970,4,false,array[4,5]),
  ('day-trip','Day trip to Mysuru','Indiranagar Metro station',12.9784,77.6386,3,false,array[6,7]),
  ('photo-walk','Golden hour street photos','Church Street',12.9750,77.6050,5,true,array[16,17]),
  ('heritage-walk','Old Bangalore pete walk','KR Market entrance',12.9650,77.5770,5,true,array[7,8])
) t(slug, title, venue, lat, lng, slots, open_ended, hours);

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Plans: 150 upcoming (today to next week, lots tonight and this weekend) and 120 past ones for history,
--    "your regulars" and badges. New-plan alerts are off while seeding so nobody gets 150 notifications.
-- ---------------------------------------------------------------------------------------------------------------
alter table requests disable trigger on_request_created;
alter table messages disable trigger user;  -- no push notifications for seeded chat messages

drop table if exists demo_seed.demo_plans;
create table demo_seed.demo_plans as
with t as (select row_number() over () as n, * from demo_seed.tpl),
     slots as (
       select i, i <= 150 as upcoming,
              case when i <= 150 then (array[0, 2, 4, 6])[1 + ((i - 1) / (select count(*) from demo_seed.tpl))::int] + floor(random() * 2)::int
                   else -1 - floor(random() * 30)::int end as day_offset,
              1 + (i - 1) % (select count(*) from demo_seed.tpl) as tpl_n  -- every template used in turn, never twice on one day
       from generate_series(1, 270) i)
select gen_random_uuid() as id, s.i, s.upcoming, t.*,
       -- start time: the template's usual hour on that day, Bengaluru time, at :00 or :30
       ((current_date + s.day_offset) + make_interval(hours => t.hours[1 + floor(random() * array_length(t.hours, 1))::int],
                                                      mins => (floor(random() * 2) * 30)::int)) at time zone 'Asia/Kolkata' as starts_at
from slots s join t on t.n = s.tpl_n;
-- Upcoming plans whose time has already passed today move to the same time tomorrow.
update demo_seed.demo_plans set starts_at = starts_at + interval '1 day' where upcoming and starts_at < now() + interval '45 minutes';

insert into requests(id, host_id, activity_id, title, note, skill_level, starts_at, venue_name, location, has_pin, slots_total, open_ended,
                     women_only, status, created_at)
select d.id, h.id, a.id, d.title,
       (array[null, null, 'Splitting the cost, UPI works', 'Beginners totally welcome 🙌', 'Meet at the entrance', 'I''ll book once we have 3',
              'Bring water!', 'Parking is tight, metro is easier'])[1 + floor(random() * 8)::int],
       'Any', d.starts_at, d.venue,
       st_setsrid(st_makepoint(d.lng + (random() - 0.5) * 0.002, d.lat + (random() - 0.5) * 0.002), 4326)::geography, true,
       case when d.open_ended then 50 else d.slots end, d.open_ended,
       d.i % 17 = 0 and h.gender = 'woman',
       case when not d.upcoming and d.i % 15 = 0 then 'cancelled' else 'open' end,
       least(now(), d.starts_at) - make_interval(hours => 2 + floor(random() * 48)::int)
from demo_seed.demo_plans d
join activities a on a.slug = d.slug
cross join lateral (select p.id, p.gender from demo_seed.demo_people p where p.g > -d.i order by random() limit 1) h;

-- People who joined: limited plans 0 to all spots (some full), open plans 2-9 people. Never the host.
insert into participants(request_id, user_id, joined_at)
select r.id, p.id, r.created_at + make_interval(mins => 10 + floor(random() * 600)::int)
from requests r join demo_seed.demo_plans d on d.id = r.id
cross join lateral (
  select p.id from demo_seed.demo_people p
  where p.id <> r.host_id and (not r.women_only or p.gender = 'woman') and p.g > -d.i
  order by random()
  limit case when r.open_ended then 2 + floor(random() * 8)::int
             when random() < 0.12 then r.slots_total
             else floor(random() * r.slots_total)::int end) p;
update requests r set slots_filled = c.n,
  status = case when r.status = 'cancelled' then 'cancelled' when not r.open_ended and c.n >= r.slots_total then 'full' else 'open' end
from (select d.id, (select count(*) from participants x where x.request_id = d.id) n from demo_seed.demo_plans d) c
where c.id = r.id;

alter table requests enable trigger on_request_created;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Group chats: a few messages in most plans, from the host and people in it
-- ---------------------------------------------------------------------------------------------------------------
insert into messages(request_id, sender_id, body, created_at)
select r.id, who.id,
       (array['Hey all 👋','I''m in! 🙌','See you there!','Who''s bringing the ball?','Should I book the court?','Booked ✅',
              'Running 10 min late, start without me','Can we make it 30 min later?','Parking is near the gate','Is it veg-friendly?',
              'Splitting via UPI after','First time here, excited!','Let''s do this again next week 🔁','Anyone need a ride from the metro?',
              'Weather looks fine ☀️','Bringing a friend if that''s ok?','Same spot as last time?','Chai after? ☕'])[1 + floor(random() * 18)::int],
       least(now(), r.starts_at) - make_interval(mins => floor(random() * 600)::int + k * 7)
from requests r join demo_seed.demo_plans d on d.id = r.id
cross join lateral generate_series(1, 2 + abs(hashtext(r.id::text)) % 5) k   -- 2-6 messages, different per plan
cross join lateral (
  select m.uid as id from (select r.host_id uid union all select x.user_id from participants x where x.request_id = r.id) m
  where k > -1 order by random() limit 1) who
where r.status <> 'cancelled' and d.i % 5 <> 0;

-- Kudos for past plans.
insert into kudos(request_id, giver_id, receiver_id, tag)
select x.request_id, x.user_id, r.host_id, (array['mvp','good_vibes','on_time','carried','friendly'])[1 + floor(random() * 5)::int]
from participants x join requests r on r.id = x.request_id join demo_seed.demo_plans d on d.id = r.id
where not d.upcoming and r.status <> 'cancelled' and random() < 0.5
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. "I'm free right now": 15 people nearby, free for the next 1-4 hours
-- ---------------------------------------------------------------------------------------------------------------
insert into availability(user_id, until, activity_ids, note, area)
select p.id, now() + make_interval(hours => 1 + floor(random() * 4)::int),
       coalesce((select array_agg(s.activity_id) from (select activity_id from user_sports where user_id = p.id limit 3) s), '{}'),
       (array[null, 'Up for anything nearby', 'Have 2 rackets', 'Near 100 Ft Road', 'Coffee first?', 'Free till dinner'])[1 + floor(random() * 6)::int],
       st_setsrid(st_makepoint(round((c.lng + (random() - 0.5) * 0.06)::numeric, 2)::float8,
                               round((c.lat + (random() - 0.5) * 0.06)::numeric, 2)::float8), 4326)::geography
from (select * from demo_seed.demo_people order by random() limit 15) p, demo_seed.centre c
on conflict (user_id) do update set until = excluded.until, activity_ids = excluded.activity_ids, note = excluded.note, area = excluded.area;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. Crews with members and a few messages
-- ---------------------------------------------------------------------------------------------------------------
drop table if exists demo_seed.demo_crews;
create table demo_seed.demo_crews as
select gen_random_uuid() as id, c.* from (values
  ('Sunday Smashers','🏸','badminton'), ('Indiranagar Runners','🏃','running'), ('Board Game Nights','🎲','carrom'),
  ('Café Hoppers','☕','cafe-hopping'), ('Weekend Trekkers','🥾','trek'), ('FIFA Fridays','🎮','ea-fc')
) c(name, emoji, slug);

insert into crews(id, name, emoji, activity_id, owner_id)
select dc.id, dc.name, dc.emoji, a.id, o.id
from demo_seed.demo_crews dc join activities a on a.slug = dc.slug
cross join lateral (select p.id from demo_seed.demo_people p where p.g > -length(dc.name) order by random() limit 1) o;

insert into crew_members(crew_id, user_id)
select cr.id, cr.owner_id from crews cr join demo_seed.demo_crews dc on dc.id = cr.id
union
select dc.id, p.id from demo_seed.demo_crews dc
cross join lateral (select id from demo_seed.demo_people where g > -length(dc.name) order by random() limit 6 + floor(random() * 8)::int) p
on conflict do nothing;

insert into crew_messages(crew_id, sender_id, body, created_at)
select m.crew_id, m.user_id,
       (array['Same time next week?','Who''s in this weekend?','Great game yesterday 🔥','New spot opened near the metro, try it?',
              'I can host next time','Adding my friend to the crew 👋'])[1 + floor(random() * 6)::int],
       now() - make_interval(hours => floor(random() * 120)::int)
from crew_members m join demo_seed.demo_crews dc on dc.id = m.crew_id where random() < 0.5;

-- A few upcoming plans belong to crews.
update requests r set crew_id = cr.id
from demo_seed.demo_plans d, crews cr join demo_seed.demo_crews dc on dc.id = cr.id join activities a on a.id = cr.activity_id
where r.id = d.id and d.upcoming and a.slug = d.slug and d.i % 3 = 0;

alter table messages enable trigger user;  -- chat pushes back on
drop schema demo_seed cascade;

commit;

select (select count(*) from auth.users where email like 'demo+%@example.com') as people,
       (select count(*) from requests r join profiles p on p.id = r.host_id join auth.users u on u.id = p.id
          where u.email like 'demo+%@example.com' and r.starts_at > now() and r.status <> 'cancelled') as upcoming_plans,
       (select count(*) from requests r join auth.users u on u.id = r.host_id
          where u.email like 'demo+%@example.com' and r.starts_at <= now()) as past_plans,
       (select count(*) from availability a join auth.users u on u.id = a.user_id where u.email like 'demo+%@example.com') as free_now,
       (select count(*) from crews c join auth.users u on u.id = c.owner_id where u.email like 'demo+%@example.com') as crews;
