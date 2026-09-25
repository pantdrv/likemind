-- OTP login (email or phone, no password). Run in the Supabase SQL editor after 004_optional_pin.sql. Safe to run more than once.
-- Phone-only users have no email, so the default name falls back to 'Player' instead of failing the signup.

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into profiles(id, full_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'full_name',''), nullif(split_part(coalesce(new.email,''),'@',1),''), 'Player'));
  if jsonb_typeof(new.raw_user_meta_data->'sports') = 'array' then
    insert into user_sports(user_id, activity_id)
    select new.id, a.id from activities a
    where a.slug in (select jsonb_array_elements_text(new.raw_user_meta_data->'sports'));
  end if;
  return new;
end $$;
