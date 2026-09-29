-- Removes everything the load test created (users with emails loadtest+N@example.com; their plans, joins,
-- messages, alerts and interests go with them through the database's cascade deletes).
--   psql "$DB_URL" -f loadtest/cleanup.sql
\set ON_ERROR_STOP on
delete from auth.users where email like 'loadtest+%';
select count(*) as loadtest_users_left from auth.users where email like 'loadtest+%';
