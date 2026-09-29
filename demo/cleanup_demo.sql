-- Removes all demo data created by demo/seed_demo.sql: the demo people (demo+N@example.com) and, through the
-- database's cascade deletes, their plans, joins, chats, crews, alerts, "I'm free" status and interests.
-- Real accounts that joined demo plans keep their accounts; only the demo plans disappear from their lists.
-- Paste into the Supabase SQL editor and run.

delete from auth.users where email like 'demo+%@example.com';

-- In case a seed run stopped halfway: make sure new-plan alerts are on and the scratch tables are gone.
alter table requests enable trigger on_request_created;
alter table messages enable trigger user;
drop schema if exists demo_seed cascade;

select count(*) as demo_people_left from auth.users where email like 'demo+%@example.com';
