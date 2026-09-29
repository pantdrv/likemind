-- Rename the "Outdoor" category to "Sports" (badminton and pickleball are often on indoor courts), and give
-- pickleball a ball icon instead of the pickle (there is no pickleball emoji; 🏓 is table tennis and 🎾 is tennis).
-- Only display name and icon change; slugs stay the same, so plans, interests, alerts and badges are unaffected.
-- Run in the Supabase SQL editor after 014_performance.sql. Safe to run more than once.

update categories set name = 'Sports' where slug = 'outdoor';
update activities set icon = '🥎' where slug = 'pickleball';
