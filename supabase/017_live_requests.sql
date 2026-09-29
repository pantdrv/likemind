-- Live join requests: request / accept / decline / withdraw show up instantly for the host and the requester.
-- Withdrawing becomes a status change (not a delete) so it can be sent live to just the people involved.
-- Run in the Supabase SQL editor after 016_join_requests.sql. Safe to run more than once.

alter table join_requests drop constraint if exists join_requests_status_check;
alter table join_requests add constraint join_requests_status_check check (status in ('pending', 'accepted', 'declined', 'withdrawn'));

create or replace function cancel_join_request(p_request uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  update join_requests set status = 'withdrawn', decided_at = now()
  where request_id = p_request and user_id = auth.uid() and status = 'pending';
  delete from notifications n using requests r
  where r.id = p_request and n.user_id = r.host_id and n.request_id = p_request and n.actor_id = auth.uid() and n.kind = 'join_request';
end $$;

-- Send join-request changes live. Row-level security still applies: each change only reaches the requester and the host.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'join_requests') then
    alter publication supabase_realtime add table join_requests;
  end if;
end $$;
