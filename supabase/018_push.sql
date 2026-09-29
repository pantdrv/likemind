-- Phone push notifications: every new alert (notifications) and group-chat message (messages) calls the `notify`
-- Edge Function, which re-reads the row and sends the push. Only the table name and row id are sent.
-- Replaces the dashboard "Database Webhooks" from the README (delete those if you created them, or you'd get doubles).
-- Run in the Supabase SQL editor after 017_live_requests.sql. Safe to run more than once.
-- If you use a different Supabase project, change the project address in the URL below.

create extension if not exists pg_net with schema extensions;

create or replace function send_push() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://yqjxiqbuzwqpqzyipkze.supabase.co/functions/v1/notify',
    body := jsonb_build_object('table', TG_TABLE_NAME, 'id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb);
  return new;
exception when others then
  return new;  -- a push problem must never stop the alert or message itself
end $$;

drop trigger if exists push_on_notification on notifications;
create trigger push_on_notification after insert on notifications for each row execute function send_push();
drop trigger if exists push_on_message on messages;
create trigger push_on_message after insert on messages for each row execute function send_push();
