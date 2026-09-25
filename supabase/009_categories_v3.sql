-- Categories v3: Outdoor, Entertainment (concert, movie + the shopping activities) and Indoor & Board games
-- (chess, table games + the PS5 games). Existing plans, interests and alerts keep working: activities only move category.
-- Run in the Supabase SQL editor after 008_engagement.sql. Safe to run more than once.

alter table categories add column if not exists sort int not null default 100;
alter table activities add column if not exists sort int not null default 100;

-- The PS5 category becomes "Indoor & Board games"; Entertainment is new.
update categories set slug = 'indoor', name = 'Indoor & Board games' where slug = 'ps5';
insert into categories(slug, name) values ('indoor', 'Indoor & Board games'), ('entertainment', 'Entertainment') on conflict (slug) do nothing;

-- Shopping activities move into Entertainment; the empty Shopping category is removed.
update activities set category_id = (select id from categories where slug = 'entertainment')
where category_id = (select id from categories where slug = 'shopping');
delete from categories c where c.slug = 'shopping' and not exists(select 1 from activities a where a.category_id = c.id);

-- Chess is a board game.
update activities set category_id = (select id from categories where slug = 'indoor') where slug = 'chess';

insert into activities(category_id, slug, name, icon)
select c.id, v.slug, v.name, v.icon from categories c
join (values
  ('entertainment','concert','Concert','🎤'), ('entertainment','movie','Movie','🎬'),
  ('indoor','pool','Pool / Snooker','🎱'), ('indoor','table-tennis','Table tennis','🏓'),
  ('indoor','carrom','Carrom','🪙'), ('indoor','bowling','Bowling','🎳')
) as v(cat, slug, name, icon) on c.slug = v.cat
on conflict (slug) do update set category_id = excluded.category_id;

update activities set icon = '🥒' where slug = 'pickleball';   -- 🏓 now belongs to table tennis

-- Display order (lower first).
update categories c set sort = v.sort from (values ('outdoor',1), ('entertainment',2), ('indoor',3)) as v(slug, sort) where c.slug = v.slug;
update activities a set sort = v.sort from (values
  ('cricket',1), ('football',2), ('tennis',3), ('pickleball',4), ('badminton',5),
  ('concert',1), ('movie',2), ('mall',3), ('thrifting',4), ('sneakers',5), ('flea-market',6), ('groceries',7), ('window-shopping',8),
  ('chess',1), ('pool',2), ('table-tennis',3), ('carrom',4), ('bowling',5),
  ('ea-fc',6), ('call-of-duty',7), ('gta-online',8), ('fortnite',9), ('tekken',10), ('nba-2k',11)
) as v(slug, sort) where a.slug = v.slug;

-- Badges: "Controller certified" and "Shopaholic" now count their activities, since those categories changed.
create or replace function user_stats(p_user uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_done int; v_hosted int; v_night int; v_early int; v_cats int; v_all_cats int; v_out int; v_ps5 int; v_shop int;
  v_streak int; v_kudos jsonb; v_mvp int; v_due int; v_checked int; v_badges jsonb;
begin
  select count(*), count(*) filter (where d.hosted),
         count(*) filter (where extract(hour from d.starts_at at time zone 'Asia/Kolkata') >= 21),
         count(*) filter (where extract(hour from d.starts_at at time zone 'Asia/Kolkata') < 8),
         count(distinct c.id),
         count(*) filter (where c.slug = 'outdoor'),
         count(*) filter (where a.slug in ('ea-fc','call-of-duty','gta-online','fortnite','tekken','nba-2k')),
         count(*) filter (where a.slug in ('mall','thrifting','sneakers','flea-market','groceries','window-shopping'))
    into v_done, v_hosted, v_night, v_early, v_cats, v_out, v_ps5, v_shop
    from plans_done_by(p_user) d join activities a on a.id = d.activity_id join categories c on c.id = a.category_id;
  select count(*) into v_all_cats from categories;
  v_streak := week_streak(p_user);
  select coalesce(jsonb_object_agg(tag, n), '{}'::jsonb) into v_kudos
    from (select tag, count(*) n from kudos where receiver_id = p_user group by tag) k;
  v_mvp := coalesce((v_kudos->>'mvp')::int, 0);
  select count(*), count(ci.user_id) into v_due, v_checked
    from requests r left join check_ins ci on ci.request_id = r.id and ci.user_id = p_user
    where r.checkin_enabled and r.status <> 'cancelled' and r.starts_at + interval '3 hours' < now()
      and ((r.host_id = p_user and r.slots_filled > 0) or exists(select 1 from participants x where x.request_id = r.id and x.user_id = p_user));
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'emoji', b.emoji, 'label', b.label) order by b.ord), '[]'::jsonb) into v_badges
  from (values
    (1, 'first_plan', '🎉', 'First plan', v_done >= 1),
    (2, 'regular', '🔁', 'Regular', v_done >= 10),
    (3, 'host', '👑', 'Host with the most', v_hosted >= 5),
    (4, 'on_fire', '🔥', 'On fire', v_streak >= 4),
    (5, 'night_owl', '🦉', 'Night owl', v_night >= 3),
    (6, 'early_bird', '🌅', 'Early bird', v_early >= 3),
    (7, 'explorer', '🧭', 'Explorer', v_all_cats > 0 and v_cats >= v_all_cats),
    (8, 'court_regular', '🏸', 'Court regular', v_out >= 5),
    (9, 'gamer', '🎮', 'Controller certified', v_ps5 >= 5),
    (10, 'shopaholic', '🛍️', 'Shopaholic', v_shop >= 5),
    (11, 'mvp', '🏆', 'Certified MVP', v_mvp >= 5),
    (12, 'reliable', '✅', 'Always shows up', v_due >= 5 and v_checked >= 0.9 * v_due)
  ) as b(ord, id, emoji, label, earned) where b.earned;
  return jsonb_build_object('plans_done', v_done, 'hosted', v_hosted, 'streak', v_streak, 'kudos', v_kudos,
    'badges', v_badges, 'show_up', jsonb_build_object('checked', v_checked, 'due', v_due));
end $$;
