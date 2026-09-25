# Playmate: find people nearby to play with

React Native (Expo + TypeScript) app with a Supabase backend.
Includes: register/login, three categories (Outdoor: cricket, football, tennis, pickleball, badminton; Entertainment: concert, movie,
shopping; Indoor & Board games: chess, pool, table tennis, carrom, bowling, PS5 games),
nearby requests, raise a request, instant accept (no host approval), group chat, push notifications,
ratings, and safety (report and block).

## Sport alerts
Players pick their sports at signup (editable in Profile). When someone raises a request, a database trigger creates a
notification for every player of that sport whose alert area is within their chosen distance (5–50 km) of the venue.
They appear live in the Alerts tab (works in Expo Go) and are sent as push once the `notifications` webhook is set up.

## Profiles
Up to 6 profile photos (first = main) and 30 "moments" tagged with an activity, stored in the public `photos` Storage bucket
(each user can only write to their own folder). Images are resized on the phone to max 1280px before upload. Other players see
your photos, bio, interests and moments via `public_profile()`, opened from plans and alerts; blocked pairs can't see each other.

## Engagement features (008_engagement.sql)
- Home: "Happening near you" feed (your interests), featured events, people who are "free right now", weekly challenges,
  streak, your regulars (2+ plans together) and popular spots.
- "I'm free": show nearby people with matching interests that you're up for something for 1–4 hours; they can invite you.
- Plans: share via WhatsApp, "⚡ same as last time", "🔁 run it back" (copies a past plan and invites its squad),
  check-in at the pin (within 300 m, from 30 min before to 3 h after start) feeding a show-up score, shared plan album,
  kudos tags, chat quick replies / emoji reactions / polls, women-only plans, crew plans.
- Crews: lasting groups with a join code, crew chat and crew plans (the whole crew is alerted).
- Profiles: verified badge, streak, badges, kudos counts, show-up score, "done N plans with you", invite to a plan.
- Venue pages: plans and photos grouped by venue name.

Admin tasks (in the Supabase Table editor / SQL editor):
- Verify someone: check their selfie in Storage > `verification`, then `update profiles set verification_status = 'verified' where id = '…';`
  (or `'rejected'`).
- Feature an event: `update requests set featured_label = '🏆 FIFA Cup' where id = '…';`
- Share links: deploy `supabase/functions/open` with JWT verification off so WhatsApp links open the app.

Local SQL testing: every migration was run twice and smoke-tested against Postgres 17 + PostGIS with stubbed auth/storage.

## Privacy model
- Your exact GPS position is never stored. For sport alerts, an approximate area rounded to about 1 km is saved,
  readable only by you and used only to decide which alerts you get.
- Others see only an approximate distance (rounded to 0.5 km) and the venue name the host typed.
- The map pin is optional (set by place search, a pasted Google Maps link, or tapping the map). The exact pin and its Google Maps
  link go to the host, joined players and players who picked that activity; others see a ~1 km area circle.
  Plans without a pin store only the host's area rounded to ~1 km, used for nearby search and never shown on a map.

## Setup (about 15 minutes)
1. **Supabase**: create a project at supabase.com. In *SQL Editor* paste and run `supabase/schema.sql`, then `supabase/002_sport_alerts.sql`, `supabase/003_categories.sql`, `supabase/004_optional_pin.sql`, `supabase/005_otp_login.sql`, `supabase/006_share_spot.sql`, `supabase/007_profile_photos.sql`, `supabase/008_engagement.sql`, `supabase/009_categories_v3.sql` and `supabase/010_plan_details.sql`.
   Login is email + password or "Continue with Google". For Google: create an OAuth client (type *Web application*) in Google Cloud
   with redirect URI `https://<project>.supabase.co/auth/v1/callback`, paste its Client ID and Secret into *Authentication > Sign In / Providers > Google*,
   and add `exp://**` and `playmate://**` to *Authentication > URL Configuration > Redirect URLs*.
   In *Authentication > Providers > Email* switch off "Confirm email" while developing.
2. `cp .env.example .env` and fill in the project URL and anon key (Settings > API).
3. `npm install` then `npx expo install --fix` (aligns package versions to your Expo SDK).
4. `npx expo start`, then scan the QR with Expo Go. Chat, maps and location work in Expo Go.
   Add two accounts on two devices/emulators to test joining and chat.

## Push notifications
Remote push needs a development build on a real device (not Expo Go):
1. `npm i -g eas-cli && eas login && eas init` (copy the projectId into `app.json > extra.eas.projectId`).
2. `supabase functions deploy notify --no-verify-jwt`
3. In Supabase *Database > Webhooks* create three webhooks calling the `notify` function on INSERT for tables `participants`, `messages` and `notifications`.
4. Android needs an FCM key uploaded to EAS, iOS needs an Apple Developer account (`eas credentials`).

## Maps
Set Google Maps API keys in `app.json` (`ios.config.googleMapsApiKey`, `android.config.googleMaps.apiKey`) for store builds.

## Publish
`eas build -p android --profile production` / `eas build -p ios --profile production`, then `eas submit -p android|ios`.
Update the bundle id / package name in `app.json` first. Both stores require a privacy policy URL, and because the app has
user-generated content (chat), report and block are already built in to satisfy Apple's guidelines.

## Extending to concerts, movies, etc.
Insert a row in `categories` and rows in `activities`; the Home screen renders them automatically.
Per-activity form wording and extra fields (saved in `requests.details`) live in `lib/planCopy.ts`: add an entry there for a new activity.

## Structure
```
app/            screens (expo-router): (auth) login/register, (tabs) home/my games/profile, sport/[slug], request/new, request/[id]
components/     Button/Input/Chip, RequestCard, Chat (realtime), RatePeople
lib/            supabase client, auth, location, notifications, safety actions
supabase/       schema.sql (tables, RLS, RPCs), 002_sport_alerts.sql, 003_categories.sql, 004_optional_pin.sql, 005_otp_login.sql, 006_share_spot.sql, 007_profile_photos.sql (photos bucket), 008_engagement.sql, 009_categories_v3.sql, 010_plan_details.sql,
                functions/notify (push sender), functions/open (share-link redirect)
```

## Known Phase 1 limits
No profile photo upload, no email-verification screen, no in-app moderation dashboard (reports land in the `reports` table),
and no automatic archiving of past games. This prototype was written without running it on a device, so expect small fixes on first run.
