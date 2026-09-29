// Per-activity wording for the "Start a plan" form, plus optional extra fields saved in requests.details.
// Lookup order: activity slug, then category defaults, then generic.

export type Extra = { key: string; label: string; emoji: string; options: string[] };
export type Copy = {
  titleLabel: string; titlePh: string; whenLabel: string; placeLabel: string; placePh: string;
  peopleLabel: string; vibeLabel: string | null; notePh: string; submit: string; extras: Extra[];
  // Headcount: the stepper's starting number, and whether "open to anyone" (no limit) is on by default, offered, or not offered.
  slots: number; open: 'default' | 'allowed' | 'never';
  // Distance: default "within X km" on the activity page, and whether km is shown at all (trips only care about the meeting point).
  radius: number; showKm: boolean;
};

const TICKETS: Extra = { key: 'tickets', label: 'Tickets', emoji: '🎟', options: ['I have tickets for all', 'Buying together', 'Everyone buys their own'] };
const BOARD: Extra = { key: 'equipment', label: 'Board / set', emoji: '🎲', options: ["I'll bring it", 'Venue has one', 'Someone bring one'] };
const PS5_SETUP: Extra = { key: 'setup', label: 'Setup', emoji: '🎮', options: ['Console at the venue', "I'll bring my PS5", 'Bring your own controller'] };
// Food
const BUDGET: Extra = { key: 'budget', label: 'Budget', emoji: '💸', options: ['₹ Budget-friendly', '₹₹ Mid-range', '₹₹₹ Treat yourself'] };
const DIET: Extra = { key: 'diet', label: 'Food', emoji: '🥗', options: ['Veg', 'Non-veg', 'Both'] };
const BILL: Extra = { key: 'bill', label: 'Bill', emoji: '🧾', options: ['Split the bill', 'Each pays their own', "It's on me"] };
// Fitness
const RUN_DIST: Extra = { key: 'distance', label: 'Distance', emoji: '📏', options: ['3 km', '5 km', '10 km', 'Half marathon'] };
const PACE: Extra = { key: 'pace', label: 'Pace', emoji: '⏱', options: ['Easy, can chat', 'Steady', 'Fast'] };
const RIDE_DIST: Extra = { key: 'distance', label: 'Distance', emoji: '📏', options: ['Under 15 km', '15–40 km', '40 km+'] };
const GYM_FOCUS: Extra = { key: 'focus', label: 'Focus', emoji: '🎯', options: ['Upper body', 'Lower body', 'Full body', 'Cardio'] };
const MAT: Extra = { key: 'mat', label: 'Mat', emoji: '🧘', options: ['Bring your own mat', 'Mats at the venue', 'I have spares'] };
// Study
const WORK_VIBE: Extra = { key: 'vibe', label: 'Vibe', emoji: '🤫', options: ['Quiet focus', 'Chatty', 'Pomodoro breaks'] };
const WIFI: Extra = { key: 'wifi', label: 'Wi-Fi', emoji: '📶', options: ['Need Wi-Fi', "Don't need it"] };
const EXAM: Extra = { key: 'exam', label: 'Exam', emoji: '📝', options: ['JEE / NEET', 'CAT', 'GATE', 'UPSC', 'College exams', 'Other'] };
const LANG: Extra = { key: 'language', label: 'Practising', emoji: '🗣', options: ['English', 'Hindi', 'Kannada', 'Tamil', 'French', 'German', 'Japanese', 'Other'] };
// Trips
const TRANSPORT: Extra = { key: 'transport', label: 'Getting there', emoji: '🚦', options: ['🏍 Bikes', '🚗 Car', '🚌 Bus / train', '🚶 Meet there'] };
const COSTS: Extra = { key: 'costs', label: 'Costs', emoji: '💸', options: ['Split fuel & costs', 'Each pays their own', "It's on me"] };
const DIFFICULTY: Extra = { key: 'difficulty', label: 'Difficulty', emoji: '⛰', options: ['Easy', 'Moderate', 'Tough'] };

const GENERIC: Copy = {
  titleLabel: 'Title', titlePh: 'Give your plan a name', whenLabel: 'When',
  placeLabel: 'Meeting place', placePh: 'Where are you meeting?', peopleLabel: 'How many more people?',
  vibeLabel: 'Vibe', notePh: 'Anything people should know?', submit: 'Post it 🚀', extras: [],
  slots: 2, open: 'allowed', radius: 10, showKm: true,
};

const CATEGORY: Record<string, Partial<Copy>> = {
  outdoor: {
    titlePh: 'e.g. evening game, need 1 more', placeLabel: 'Court / ground', placePh: 'e.g. City Sports Club, Court 2',
    peopleLabel: 'Players needed', vibeLabel: 'Skill vibe', notePh: 'e.g. bring your own gear, splitting the court fee',
    slots: 3, open: 'never',
  },
  indoor: {
    placeLabel: 'Where?', placePh: "Café, club, or someone's place", peopleLabel: 'Players needed', vibeLabel: 'Skill vibe',
    notePh: 'e.g. loser buys chai ☕', slots: 1, open: 'never',
  },
  food: {
    titleLabel: "What are we eating?", titlePh: 'e.g. best dosa in town', placeLabel: 'Place', placePh: "e.g. Rameshwaram Cafe, Indiranagar",
    peopleLabel: 'How many joining?', vibeLabel: null, notePh: "e.g. I'll book a table, come hungry", submit: 'Post food plan 🍜',
    extras: [BUDGET, DIET, BILL], slots: 3, open: 'allowed', radius: 10,
  },
  fitness: {
    titleLabel: "What's the workout?", titlePh: 'e.g. easy morning run', placeLabel: 'Meeting point', placePh: 'e.g. Cubbon Park main gate',
    peopleLabel: 'How many joining?', vibeLabel: 'Intensity', notePh: 'e.g. bring water, coffee after 🙌', submit: 'Post it 💪',
    slots: 2, open: 'default', radius: 5,
  },
  study: {
    titleLabel: 'What are you working on?', titlePh: 'e.g. DSA prep, 2 hours', placeLabel: 'Café / library', placePh: 'e.g. Third Wave Coffee, HSR',
    peopleLabel: 'How many seats?', vibeLabel: null, notePh: 'e.g. power sockets near the window', submit: 'Post session 📚',
    extras: [WORK_VIBE, WIFI], slots: 3, open: 'default', radius: 5,
  },
  explore: {
    titleLabel: 'Where are we going?', titlePh: 'e.g. Nandi Hills sunrise', whenLabel: 'Leaving at', placeLabel: 'Meeting point', placePh: 'e.g. Hebbal flyover, Shell petrol pump',
    peopleLabel: 'How many joining?', vibeLabel: null, notePh: 'e.g. carry a jacket, breakfast on the way', submit: 'Post trip 🏕',
    extras: [TRANSPORT, COSTS], slots: 3, open: 'default', radius: 50, showKm: false,
  },
  entertainment: {
    placeLabel: 'Where?', placePh: 'e.g. Phoenix Marketcity', peopleLabel: 'How many joining?', vibeLabel: null,
    notePh: 'Anything people should know?', submit: 'Post it 🚀', slots: 2, open: 'allowed', radius: 25,
  },
};

const ACTIVITY: Record<string, Partial<Copy>> = {
  // Sports (slug "outdoor")
  cricket: { titlePh: 'e.g. box cricket, 6-a-side', placeLabel: 'Ground / turf', placePh: 'e.g. Turf Park, Box 2', notePh: 'e.g. bring a bat, splitting the turf fee' },
  football: { titlePh: 'e.g. 5-a-side turf game', placeLabel: 'Turf / ground', placePh: 'e.g. Hudle Turf, Koramangala', notePh: 'e.g. wear studs, splitting the turf fee' },
  tennis: { titlePh: 'e.g. singles rally, 1 hour', placeLabel: 'Court', notePh: 'e.g. bring balls, I have a spare racket' },
  pickleball: { titlePh: 'e.g. doubles, beginners welcome', placeLabel: 'Court', notePh: 'e.g. paddles available at the court' },
  badminton: { titlePh: 'e.g. evening doubles, need 1 more', placeLabel: 'Court', placePh: 'e.g. Smash Arena, Court 2', notePh: 'e.g. bring your own racket, shuttles on me' },

  // Entertainment
  movie: {
    titleLabel: 'Which movie?', titlePh: 'e.g. Dune: Part Three', whenLabel: 'Show time', placeLabel: 'Theatre', placePh: 'e.g. PVR Orion Mall',
    peopleLabel: 'How many seats to fill?', notePh: 'e.g. booked row J, popcorn is a must 🍿', submit: 'Post movie plan 🎬',
    extras: [
      { key: 'language', label: 'Language', emoji: '🗣', options: ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Other'] },
      { key: 'format', label: 'Format', emoji: '🎞', options: ['2D', '3D', 'IMAX', '4DX'] },
      TICKETS,
    ],
  },
  concert: {
    titleLabel: "Who's playing?", titlePh: 'e.g. Prateek Kuhad', whenLabel: 'Meet-up time', placeLabel: 'Venue', placePh: 'e.g. Jio World Garden',
    peopleLabel: 'How many joining?', notePh: 'e.g. meet at Gate 2, grabbing food before', submit: 'Post concert plan 🎤', extras: [TICKETS],
  },
  mall: { titleLabel: "What's the plan?", titlePh: 'e.g. food court + window shopping', placeLabel: 'Mall', placePh: 'e.g. Phoenix Marketcity' },
  thrifting: { titleLabel: "What's the mission?", titlePh: 'e.g. thrift haul, vintage jackets', placeLabel: 'Store / market', placePh: 'e.g. Commercial Street' },
  sneakers: { titleLabel: "What's the mission?", titlePh: 'e.g. new drop at Superkicks', placeLabel: 'Store', placePh: 'e.g. Superkicks, Indiranagar' },
  'flea-market': { titleLabel: "What's the plan?", titlePh: 'e.g. Sunday flea market stroll', placeLabel: 'Market', placePh: 'e.g. Sunday Soul Sante' },
  groceries: { titleLabel: "What's the plan?", titlePh: 'e.g. weekly grocery run', placeLabel: 'Store', placePh: 'e.g. D-Mart, HSR Layout' },
  'window-shopping': { titleLabel: "What's the plan?", titlePh: 'e.g. just vibing at the mall', placeLabel: 'Mall / street', placePh: 'e.g. Brigade Road' },

  // Food & Cafés
  'cafe-hopping': { titleLabel: 'Which cafés?', titlePh: 'e.g. 3 cafés in Koramangala', placeLabel: 'First stop' },
  'street-food': { titleLabel: 'Which street?', titlePh: 'e.g. VV Puram food street', placePh: 'e.g. VV Puram, Basavanagudi' },
  brunch: { titlePh: 'e.g. lazy Sunday brunch', placePh: "e.g. Glen's Bakehouse" },
  'new-restaurant': { titleLabel: 'Which place?', titlePh: 'e.g. that new ramen spot', placeLabel: 'Restaurant' },
  'dessert-run': { titleLabel: "What's the craving?", titlePh: 'e.g. waffles or gelato', placePh: 'e.g. Corner House, Residency Road' },
  'late-night-food': { titleLabel: "What's the craving?", titlePh: 'e.g. midnight Maggi run', placePh: 'e.g. Empire, Church Street' },

  // Fitness
  running: { titleLabel: 'What kind of run?', titlePh: 'e.g. easy 5k, sunrise', extras: [RUN_DIST, PACE] },
  gym: { titleLabel: "What's the session?", titlePh: 'e.g. leg day, need a spotter', placeLabel: 'Gym', placePh: "e.g. Cult, Indiranagar", extras: [GYM_FOCUS] },
  cycling: { titleLabel: "What's the ride?", titlePh: 'e.g. Sunday morning loop', extras: [RIDE_DIST, PACE] },
  yoga: { titlePh: 'e.g. slow flow in the park', extras: [MAT] },
  swimming: { titlePh: 'e.g. laps before work', placeLabel: 'Pool', placePh: 'e.g. Kensington pool, Ulsoor' },
  walk: { titlePh: 'e.g. evening walk around the lake', placePh: 'e.g. Sankey Tank gate 1' },

  // Study & Work
  coworking: { titlePh: 'e.g. deep-work block, laptops out' },
  'study-session': { titleLabel: 'What are you studying?', titlePh: 'e.g. semester exams, economics', placePh: 'e.g. State Central Library' },
  'exam-prep': { titleLabel: 'What are you preparing?', titlePh: 'e.g. mock test + discussion', extras: [EXAM, WORK_VIBE] },
  hackathon: { titleLabel: 'Which hackathon / project?', titlePh: 'e.g. need a designer for a 48h hack', placeLabel: 'Where?', placePh: 'e.g. venue or café to plan' },
  'language-exchange': { titleLabel: 'Which languages?', titlePh: 'e.g. my Kannada for your French', placeLabel: 'Café', extras: [LANG] },

  // Trips & Explore
  trek: { titleLabel: 'Which trek?', titlePh: 'e.g. Skandagiri night trek', extras: [TRANSPORT, DIFFICULTY, COSTS] },
  'sunrise-ride': { titleLabel: 'Where to?', titlePh: 'e.g. Nandi Hills sunrise' },
  'day-trip': { titleLabel: 'Where to?', titlePh: 'e.g. Mysuru palace + food' },
  'heritage-walk': { titleLabel: 'Which walk?', titlePh: 'e.g. old Bangalore pete walk', placePh: 'e.g. KR Market entrance', submit: 'Post walk 🏛️', extras: [] },
  'photo-walk': { titleLabel: "What's the theme?", titlePh: 'e.g. street photography, golden hour', placePh: 'e.g. Church Street', submit: 'Post walk 📸', extras: [] },
  'road-trip': { titleLabel: 'Where to?', titlePh: 'e.g. Coorg, 2 days', whenLabel: 'Leaving at' },

  // Indoor & Board games
  chess: { titleLabel: 'What kind of games?', titlePh: 'e.g. 10-min rapid, a few rounds', placePh: 'e.g. Dialogues Café', extras: [BOARD] },
  carrom: { titleLabel: 'What kind of games?', titlePh: 'e.g. doubles, best of 3', extras: [BOARD] },
  pool: { titleLabel: 'What kind of games?', titlePh: 'e.g. 8-ball, loser pays the table', placeLabel: 'Pool hall / club', placePh: 'e.g. Tipsy Bull' },
  'table-tennis': { titleLabel: 'What kind of games?', titlePh: 'e.g. doubles rally', placeLabel: 'Venue', placePh: 'e.g. Community centre TT room', notePh: 'e.g. bring your own bat' },
  bowling: { titleLabel: "What's the plan?", titlePh: 'e.g. 2 games, then food', placeLabel: 'Bowling alley', placePh: 'e.g. Amoeba, Church Street' },
  'ea-fc': { titleLabel: 'Game mode', titlePh: 'e.g. 2v2 FUT / Pro Clubs', placeLabel: 'Where are we playing?', placePh: "Gaming café or someone's place", extras: [PS5_SETUP] },
  'call-of-duty': { titleLabel: 'Game mode', titlePh: 'e.g. Warzone squad', placeLabel: 'Where are we playing?', placePh: "Gaming café or someone's place", extras: [PS5_SETUP] },
  'gta-online': { titleLabel: 'Game mode', titlePh: 'e.g. heists, need a crew', placeLabel: 'Where are we playing?', placePh: "Gaming café or someone's place", extras: [PS5_SETUP] },
  fortnite: { titleLabel: 'Game mode', titlePh: 'e.g. zero build squads', placeLabel: 'Where are we playing?', placePh: "Gaming café or someone's place", extras: [PS5_SETUP] },
  tekken: { titleLabel: 'Game mode', titlePh: 'e.g. 1v1 first-to-5 sets', placeLabel: 'Where are we playing?', placePh: "Gaming café or someone's place", extras: [PS5_SETUP] },
  'nba-2k': { titleLabel: 'Game mode', titlePh: 'e.g. 2v2 park', placeLabel: 'Where are we playing?', placePh: "Gaming café or someone's place", extras: [PS5_SETUP] },
};

// Headcount per activity: [starting number of spots, open to anyone?]. Fixed-size games never offer "open";
// walks, crawls, runs and study sessions start open; things limited by seats or tables offer it but start with a number.
const HEADCOUNT: Record<string, [number, Copy['open']]> = {
  cricket: [10, 'never'], football: [9, 'never'], tennis: [1, 'never'], pickleball: [3, 'never'], badminton: [3, 'never'],
  concert: [3, 'allowed'], movie: [3, 'never'], mall: [2, 'allowed'], thrifting: [2, 'allowed'], sneakers: [2, 'allowed'],
  'flea-market': [3, 'default'], groceries: [1, 'allowed'], 'window-shopping': [2, 'default'],
  chess: [1, 'never'], pool: [1, 'never'], 'table-tennis': [1, 'never'], carrom: [3, 'never'], bowling: [3, 'never'],
  'ea-fc': [1, 'never'], 'call-of-duty': [3, 'never'], 'gta-online': [3, 'never'], fortnite: [3, 'never'], tekken: [1, 'never'], 'nba-2k': [1, 'never'],
  'cafe-hopping': [3, 'default'], 'street-food': [3, 'default'], brunch: [3, 'allowed'], 'new-restaurant': [3, 'allowed'],
  'dessert-run': [2, 'default'], 'late-night-food': [3, 'default'],
  running: [3, 'default'], gym: [1, 'never'], cycling: [3, 'default'], yoga: [3, 'default'], swimming: [1, 'allowed'], walk: [2, 'default'],
  coworking: [3, 'default'], 'study-session': [3, 'default'], 'exam-prep': [3, 'default'], hackathon: [3, 'never'], 'language-exchange': [1, 'allowed'],
  trek: [5, 'default'], 'sunrise-ride': [3, 'allowed'], 'day-trip': [3, 'allowed'], 'heritage-walk': [5, 'default'], 'photo-walk': [5, 'default'], 'road-trip': [3, 'allowed'],
};

// Distance per activity where it differs from its category: [search radius in km, show km?].
// Category defaults: fitness & study 5 km, sports/games/food 10 km, entertainment 25 km, trips 50 km without km.
const DISTANCE: Record<string, [number, boolean]> = {
  cycling: [10, true], running: [10, true],                       // people ride or run a bit further
  'dessert-run': [5, true], 'cafe-hopping': [5, true],             // quick, local
  mall: [10, true], groceries: [5, true], 'window-shopping': [10, true], thrifting: [10, true], sneakers: [10, true],
  'heritage-walk': [25, true], 'photo-walk': [25, true],           // city walks: km still useful
};

export function planCopy(activitySlug?: string, categorySlug?: string): Copy {
  let merged = { ...GENERIC, ...(CATEGORY[categorySlug ?? ''] ?? {}), ...(ACTIVITY[activitySlug ?? ''] ?? {}) };
  const hc = HEADCOUNT[activitySlug ?? ''];
  if (hc) merged = { ...merged, slots: hc[0], open: hc[1] };
  const dist = DISTANCE[activitySlug ?? ''];
  if (dist) merged = { ...merged, radius: dist[0], showKm: dist[1] };
  return merged;
}

// Tags for the plan page, e.g. "🗣 Hindi", "🎞 IMAX".
export function detailTags(activitySlug: string | undefined, categorySlug: string | undefined, details: Record<string, string> | null | undefined) {
  if (!details) return [];
  return planCopy(activitySlug, categorySlug).extras.filter((x) => details[x.key]).map((x) => `${x.emoji} ${details[x.key]}`);
}
