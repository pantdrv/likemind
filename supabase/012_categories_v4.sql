-- Categories v4: Food & Cafés, Fitness, Study & Work and Trips & Explore, for everyday plans between games and movies.
-- Run in the Supabase SQL editor after 011_plan_changes.sql. Safe to run more than once.

insert into categories(slug, name) values
  ('food', 'Food & Cafés'), ('fitness', 'Fitness'), ('study', 'Study & Work'), ('explore', 'Trips & Explore')
on conflict (slug) do update set name = excluded.name;

insert into activities(category_id, slug, name, icon)
select c.id, v.slug, v.name, v.icon from categories c
join (values
  ('food','cafe-hopping','Café hopping','☕'), ('food','street-food','Street food crawl','🌮'), ('food','brunch','Brunch','🥞'),
  ('food','new-restaurant','Try a new place','🍽️'), ('food','dessert-run','Dessert run','🍨'), ('food','late-night-food','Late-night food','🍜'),
  ('fitness','running','Running','🏃'), ('fitness','gym','Gym buddy','🏋️'), ('fitness','cycling','Cycling','🚴'),
  ('fitness','yoga','Yoga','🧘'), ('fitness','swimming','Swimming','🏊'), ('fitness','walk','Walk & talk','🚶'),
  ('study','coworking','Co-working','💻'), ('study','study-session','Study session','📚'), ('study','exam-prep','Exam prep','📝'),
  ('study','hackathon','Hackathon buddy','🧑‍💻'), ('study','language-exchange','Language exchange','🗣️'),
  ('explore','trek','Trek','🥾'), ('explore','sunrise-ride','Sunrise ride','🌅'), ('explore','day-trip','Day trip','🗺️'),
  ('explore','heritage-walk','Heritage walk','🏛️'), ('explore','photo-walk','Photo walk','📸'), ('explore','road-trip','Road trip','🛣️')
) as v(cat, slug, name, icon) on c.slug = v.cat
on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name, icon = excluded.icon;

-- Display order: everyday categories near the top.
update categories c set sort = v.sort from (values
  ('outdoor',1), ('food',2), ('entertainment',3), ('fitness',4), ('indoor',5), ('explore',6), ('study',7)
) as v(slug, sort) where c.slug = v.slug;
update activities a set sort = v.sort from (values
  ('cafe-hopping',1), ('street-food',2), ('brunch',3), ('new-restaurant',4), ('dessert-run',5), ('late-night-food',6),
  ('running',1), ('gym',2), ('cycling',3), ('yoga',4), ('swimming',5), ('walk',6),
  ('coworking',1), ('study-session',2), ('exam-prep',3), ('hackathon',4), ('language-exchange',5),
  ('trek',1), ('sunrise-ride',2), ('day-trip',3), ('heritage-walk',4), ('photo-walk',5), ('road-trip',6)
) as v(slug, sort) where a.slug = v.slug;

-- Badges: with 7 categories, "Explorer" now means plans in 4 different categories (it used to need every category).
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
    (7, 'explorer', '🧭', 'Explorer', v_cats >= least(4, v_all_cats)),
    (8, 'court_regular', '🏸', 'Court regular', v_out >= 5),
    (9, 'gamer', '🎮', 'Controller certified', v_ps5 >= 5),
    (10, 'shopaholic', '🛍️', 'Shopaholic', v_shop >= 5),
    (11, 'mvp', '🏆', 'Certified MVP', v_mvp >= 5),
    (12, 'reliable', '✅', 'Always shows up', v_due >= 5 and v_checked >= 0.9 * v_due)
  ) as b(ord, id, emoji, label, earned) where b.earned;
  return jsonb_build_object('plans_done', v_done, 'hosted', v_hosted, 'streak', v_streak, 'kudos', v_kudos,
    'badges', v_badges, 'show_up', jsonb_build_object('checked', v_checked, 'due', v_due));
end $$;
