-- Categories v2: the sports move into "Outdoor", plus new "PS5" and "Shopping" categories.
-- Run in the Supabase SQL editor after 002_sport_alerts.sql. Safe to run more than once.

update categories set slug='outdoor', name='Outdoor' where slug='sports';
insert into categories(slug,name) values ('ps5','PS5'), ('shopping','Shopping') on conflict (slug) do nothing;

insert into activities(category_id,slug,name,icon)
select c.id, v.slug, v.name, v.icon from categories c
join (values
  ('ps5','ea-fc','EA FC','⚽'), ('ps5','call-of-duty','Call of Duty','🎯'), ('ps5','gta-online','GTA Online','🚗'),
  ('ps5','fortnite','Fortnite','🪂'), ('ps5','tekken','Tekken','🥊'), ('ps5','nba-2k','NBA 2K','🏀'),
  ('shopping','mall','Mall hangout','🛍️'), ('shopping','thrifting','Thrifting','👕'), ('shopping','sneakers','Sneaker hunt','👟'),
  ('shopping','flea-market','Flea market','🧺'), ('shopping','groceries','Grocery run','🛒'), ('shopping','window-shopping','Window shopping','👀')
) as v(cat,slug,name,icon) on c.slug=v.cat
on conflict (slug) do nothing;

-- The register screen groups activities by category before the user is signed in.
drop policy if exists "public read" on categories;
create policy "public read" on categories for select to anon using (true);

-- Alert wording that fits every category, not just sports.
create or replace function notify_sport_followers() returns trigger language plpgsql security definer set search_path=public as $$
declare v_name text; v_icon text; v_host text;
begin
  select name, icon into v_name, v_icon from activities where id=new.activity_id;
  select full_name into v_host from profiles where id=new.host_id;
  insert into notifications(user_id, request_id, title, body)
  select s.user_id, new.id,
         format('%s New %s plan near you', v_icon, v_name),
         format('%s is looking for %s more at %s', v_host, new.slots_total, new.venue_name)
  from user_sports s join alert_areas z on z.user_id=s.user_id
  where s.activity_id=new.activity_id
    and s.user_id <> new.host_id
    and z.area is not null
    and st_dwithin(z.area, new.location, z.radius_km*1000)
    and not is_blocked_pair(s.user_id, new.host_id);
  return new;
end $$;
