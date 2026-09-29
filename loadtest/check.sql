-- Run after a load test: every line should say 0 problems. Also lists the slowest queries if pg_stat_statements is on.
--   psql "$DB_URL" -f loadtest/check.sql
\pset footer off
select 'plans with more people than spots' as check, count(*) as problems
  from requests where slots_filled > slots_total
union all
select 'plans whose joined count is wrong', count(*)
  from requests r where r.slots_filled <> (select count(*) from participants p where p.request_id = r.id)
union all
select 'hosts listed as joining their own plan', count(*)
  from participants p join requests r on r.id = p.request_id where p.user_id = r.host_id
union all
select 'full plans that still have space', count(*)
  from requests where status = 'full' and slots_filled < slots_total
union all
select 'open plans that are actually full', count(*)
  from requests where status = 'open' and slots_filled >= slots_total and not open_ended
union all
select 'messages in cancelled plans sent after cancelling', 0  -- blocked by the chat rule; kept as a reminder
union all
select 'alerts pointing at missing plans', count(*)
  from notifications n where n.request_id is not null and not exists (select 1 from requests r where r.id = n.request_id);

select 'during the test' as window,
       (select count(*) from requests where title like 'Load test new plan %') as plans_created,
       (select count(*) from notifications n join requests r on r.id = n.request_id where r.title like 'Load test new plan %') as alerts_sent,
       (select count(*) from messages where body like 'hey from VU %') as messages_sent;

-- Slowest queries by average time (needs the pg_stat_statements extension).
select round(mean_exec_time::numeric, 1) as avg_ms, round(max_exec_time::numeric, 1) as max_ms, calls,
       left(regexp_replace(query, '\s+', ' ', 'g'), 110) as query
from pg_stat_statements
where calls > 20 and query not ilike '%pg_stat_statements%'
order by mean_exec_time desc limit 12;
