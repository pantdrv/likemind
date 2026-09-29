-- Profiles show what someone is free for and their note, not just "free till 8 PM".
-- Run in the Supabase SQL editor after 018_push.sql. Safe to run more than once.

create or replace function public_profile(p_user uuid) returns jsonb language plpgsql security definer stable set search_path=public as $$
declare v jsonb;
begin
  if auth.uid() is null or is_blocked_pair(auth.uid(), p_user) then return null; end if;
  select jsonb_build_object(
    'id', p.id, 'name', p.full_name, 'bio', p.bio, 'avatar_url', p.avatar_url,
    'rating', p.rating_avg, 'rating_count', p.rating_count, 'member_since', p.created_at, 'is_me', p.id = auth.uid(),
    'verified', p.verification_status = 'verified',
    'stats', user_stats(p.id),
    'plans_done', (select count(*) from plans_done_by(p.id)),
    'played_together', coalesce((select pp.times from plan_people(auth.uid()) pp where pp.user_id = p.id), 0),
    'free_until', (select a.until from availability a where a.user_id = p.id and a.until > now()),
    'free_note', (select a.note from availability a where a.user_id = p.id and a.until > now()),
    'free_for', coalesce((select jsonb_agg(jsonb_build_object('name', ac.name, 'icon', ac.icon) order by ac.sort)
        from availability a join activities ac on ac.id = any(a.activity_ids) where a.user_id = p.id and a.until > now()), '[]'::jsonb),
    'interests', coalesce((select jsonb_agg(jsonb_build_object('slug', a.slug, 'name', a.name, 'icon', a.icon, 'category', c.slug) order by a.id)
                  from user_sports s join activities a on a.id = s.activity_id join categories c on c.id = a.category_id where s.user_id = p.id), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'path', u.path) order by u.position, u.id)
                  from user_photos u where u.user_id = p.id and u.kind = 'profile'), '[]'::jsonb),
    'moments', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'path', u.path, 'caption', u.caption, 'activity_name', a.name, 'activity_icon', a.icon) order by u.created_at desc)
                  from user_photos u left join activities a on a.id = u.activity_id where u.user_id = p.id and u.kind = 'moment'), '[]'::jsonb)
  ) into v from profiles p where p.id = p_user;
  return v;
end $$;
