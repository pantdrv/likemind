// Per-activity wording for the "Start a plan" form, plus optional extra fields saved in requests.details.
// Lookup order: activity slug, then category defaults, then generic.

export type Extra = { key: string; label: string; emoji: string; options: string[] };
export type Copy = {
  titleLabel: string; titlePh: string; whenLabel: string; placeLabel: string; placePh: string;
  peopleLabel: string; vibeLabel: string | null; notePh: string; submit: string; extras: Extra[];
};

const TICKETS: Extra = { key: 'tickets', label: 'Tickets', emoji: '🎟', options: ['I have tickets for all', 'Buying together', 'Everyone buys their own'] };
const BOARD: Extra = { key: 'equipment', label: 'Board / set', emoji: '🎲', options: ["I'll bring it", 'Venue has one', 'Someone bring one'] };
const PS5_SETUP: Extra = { key: 'setup', label: 'Setup', emoji: '🎮', options: ['Console at the venue', "I'll bring my PS5", 'Bring your own controller'] };

const GENERIC: Copy = {
  titleLabel: 'Title (optional)', titlePh: 'Give your plan a name', whenLabel: 'When',
  placeLabel: 'Meeting place', placePh: 'Where are you meeting?', peopleLabel: 'How many more people?',
  vibeLabel: 'Vibe', notePh: 'Anything people should know?', submit: 'Post it 🚀', extras: [],
};

const CATEGORY: Record<string, Partial<Copy>> = {
  outdoor: {
    titlePh: 'e.g. evening game, need 1 more', placeLabel: 'Court / ground', placePh: 'e.g. City Sports Club, Court 2',
    peopleLabel: 'Players needed', vibeLabel: 'Skill vibe', notePh: 'e.g. bring your own gear, splitting the court fee',
  },
  indoor: {
    placeLabel: 'Where?', placePh: "Café, club, or someone's place", peopleLabel: 'Players needed', vibeLabel: 'Skill vibe',
    notePh: 'e.g. loser buys chai ☕',
  },
  entertainment: {
    placeLabel: 'Where?', placePh: 'e.g. Phoenix Marketcity', peopleLabel: 'How many joining?', vibeLabel: null,
    notePh: 'Anything people should know?', submit: 'Post it 🚀',
  },
};

const ACTIVITY: Record<string, Partial<Copy>> = {
  // Outdoor
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

// Chat suggestions ("Not sure what to say? Tap one"), shown with the generic ones in plan chats.
const QUICK_CATEGORY: Record<string, string[]> = {
  outdoor: ['Who has the ball/racket? 🎒', 'Splitting the court fee?', 'Which court exactly?'],
  entertainment: ['Booked yet? 🎟', 'Meet outside or inside?', 'Food before or after? 🍜'],
  indoor: ['Who is bringing what? 🎲', 'Best of 3?', 'Loser buys chai ☕'],
};
const QUICK_ACTIVITY: Record<string, string[]> = {
  movie: ['Booked seats? 🎟', 'Which row are we in?', 'Popcorn combo? 🍿'],
  concert: ['Which gate are we meeting at?', 'Got your tickets? 🎟', 'Eating before the show?'],
  cricket: ['Who has the bat and ball? 🏏', 'Tennis ball or leather?', 'Splitting the turf fee?'],
  football: ['Bibs or colours? 👕', 'Splitting the turf fee?', 'Studs or flats?'],
  chess: ['Blitz or rapid? ♟️', 'Bringing a clock?', "Who's bringing a board?"],
};
export const quickReplies = (activitySlug?: string, categorySlug?: string) =>
  QUICK_ACTIVITY[activitySlug ?? ''] ?? QUICK_CATEGORY[categorySlug ?? ''] ?? [];

export function planCopy(activitySlug?: string, categorySlug?: string): Copy {
  return { ...GENERIC, ...(CATEGORY[categorySlug ?? ''] ?? {}), ...(ACTIVITY[activitySlug ?? ''] ?? {}) };
}

// Tags for the plan page, e.g. "🗣 Hindi", "🎞 IMAX".
export function detailTags(activitySlug: string | undefined, categorySlug: string | undefined, details: Record<string, string> | null | undefined) {
  if (!details) return [];
  return planCopy(activitySlug, categorySlug).extras.filter((x) => details[x.key]).map((x) => `${x.emoji} ${details[x.key]}`);
}
