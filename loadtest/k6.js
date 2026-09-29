// Load test: many people using the app at once, making the same API calls as the app.
//   k6 run -e BASE=http://127.0.0.1:3399 -e TOKENS=./tokens.json -e VUS=1000 loadtest/k6.js
// For a Supabase TEST project: -e BASE=https://<ref>.supabase.co/rest/v1 -e APIKEY=<anon key>
// Each virtual user = one test user: opens Home, then browses (60%), joins a plan (15%), chats (15%)
// or creates a plan (10%), pausing a few seconds between actions like a person would.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://127.0.0.1:3399';
const APIKEY = __ENV.APIKEY || '';
const VUS = Number(__ENV.VUS || 1000);
const RAMP = __ENV.RAMP || '3m', HOLD = __ENV.HOLD || '5m';
const LAT = Number(__ENV.LAT || 12.97), LNG = Number(__ENV.LNG || 77.59);
const users = new SharedArray('users', () => JSON.parse(open(__ENV.TOKENS || './tokens.json')));

// Refusals the app expects and explains to the person (plan got full, already started…), not failures.
const expectedRefusals = new Counter('expected_refusals');
const unexpectedErrors = new Counter('unexpected_errors');
const plansCreated = new Counter('plans_created');
const joins = new Counter('joins');
const messagesSent = new Counter('messages_sent');

export const options = {
  scenarios: {
    people: {
      executor: 'ramping-vus', startVUs: 0, gracefulRampDown: '30s',
      stages: [{ duration: RAMP, target: VUS }, { duration: HOLD, target: VUS }, { duration: '1m', target: 0 }],
    },
  },
  thresholds: {
    unexpected_errors: ['count<10'],
    'http_req_duration{kind:read}': ['p(95)<1000'],
    'http_req_duration{kind:write}': ['p(95)<1500'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  const res = http.get(`${BASE}/activities?select=slug`, { headers: headers(users[0].token) });
  check(res, { 'activities loaded': (r) => r.status === 200 });
  return { slugs: res.json().map((a) => a.slug) };
}

function headers(token) {
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (APIKEY) h.apikey = APIKEY;
  return h;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const think = (min, max) => sleep(min + Math.random() * (max - min));

let logged = 0; // per virtual user: print the first few unexpected errors, not thousands

// Sends a request; 2xx is fine, a 400 carrying one of our own "plain English" refusals is expected,
// anything else is counted (and the first few printed) as an unexpected error.
function call(method, path, body, token, kind, name, extraHeaders = {}) {
  const params = { headers: { ...headers(token), ...extraHeaders }, tags: { kind, name }, responseCallback: http.expectedStatuses({ min: 200, max: 299 }, 400) };
  const res = http.request(method, `${BASE}${path}`, body === null ? null : JSON.stringify(body), params);
  if (res.status >= 200 && res.status < 300) return res;
  const msg = (() => { try { return res.json().message || ''; } catch (e) { return res.body || ''; } })();
  if (res.status === 400 && /no longer open|already started|host of this|not available|women only|Pick a time|fit you in|was cancelled/i.test(msg)) {
    expectedRefusals.add(1, { name });
  } else {
    unexpectedErrors.add(1, { name });
    if (logged++ < 3) console.warn(`${name} -> ${res.status} ${String(msg).slice(0, 200)}`);
  }
  return res;
}

const rpc = (fn, args, token, kind = 'read') => call('POST', `/rpc/${fn}`, args, token, kind, fn);

export default function (data) {
  const me = users[(__VU - 1) % users.length];
  const t = me.token;
  const pos = { p_lat: LAT + (Math.random() - 0.5) * 0.2, p_lng: LNG + (Math.random() - 0.5) * 0.2 };

  // Home: the same calls the Home screen makes.
  call('GET', '/categories?select=id,slug,name,activities(id,slug,name,icon)&order=sort', null, t, 'read', 'categories');
  rpc('my_week', {}, t);
  rpc('my_regulars', {}, t);
  const feedRes = rpc('nearby_requests', { ...pos, p_radius_km: 50, p_interests_only: true }, t);
  rpc('free_nearby', { ...pos, p_radius_km: 15 }, t);
  const feed = feedRes.status === 200 ? feedRes.json() : [];
  think(2, 5);

  const roll = Math.random();
  if (roll < 0.6) {
    // Browse: an activity's page, a plan, My plans.
    const list = rpc('nearby_requests', { ...pos, p_radius_km: pick([5, 10, 25]), p_slug: pick(data.slugs) }, t);
    think(1, 3);
    const plans = list.status === 200 ? list.json() : [];
    const target = plans.length ? pick(plans) : feed.length ? pick(feed) : null;
    if (target) rpc('request_detail', { p_id: target.id }, t);
    think(2, 4);
    rpc('my_requests', {}, t);
  } else if (roll < 0.75) {
    // Join: tap "I'm in" on a plan from Home, then open it.
    const candidates = feed.filter((r) => !r.is_host && !r.has_joined);
    if (candidates.length) {
      const target = pick(candidates);
      const res = rpc('join_request', { p_request: target.id }, t, 'write');
      if (res.status >= 200 && res.status < 300) joins.add(1);
      think(1, 2);
      rpc('request_detail', { p_id: target.id }, t);
    }
  } else if (roll < 0.9) {
    // Chat: open one of my plans' chat, send a message, reload.
    const mine = rpc('my_requests', {}, t);
    const open = mine.status === 200 ? mine.json().filter((r) => r.status !== 'cancelled') : [];
    if (open.length) {
      const plan = pick(open);
      const chat = `/messages?select=id,body,kind,poll_options,sender_id,created_at,profiles!messages_sender_id_fkey(full_name),message_reactions!message_reactions_message_id_fkey(emoji,user_id),poll_votes!poll_votes_message_id_fkey(option,user_id)&request_id=eq.${plan.id}&order=created_at.desc&limit=200`;
      call('GET', chat, null, t, 'read', 'chat_load');
      think(2, 5);
      const sent = call('POST', '/messages', { request_id: plan.id, sender_id: me.id, body: `hey from VU ${__VU}` }, t, 'write', 'chat_send', { Prefer: 'return=minimal' });
      if (sent.status >= 200 && sent.status < 300) messagesSent.add(1);
      call('GET', chat, null, t, 'read', 'chat_load');
    }
  } else {
    // Create a plan (this also fans out alerts to nearby people into the activity).
    const starts = new Date(Date.now() + (1 + Math.random() * 7 * 24) * 3600 * 1000).toISOString();
    const open = Math.random() < 0.3;
    const res = rpc('create_request', {
      p_slug: pick(data.slugs), p_title: `Load test new plan ${__VU}-${__ITER}`, p_note: null, p_skill: 'Any', p_starts: starts,
      p_venue: `Venue ${Math.floor(Math.random() * 300)}`, p_lat: pos.p_lat, p_lng: pos.p_lng, p_slots: 2 + Math.floor(Math.random() * 5),
      p_has_pin: true, p_women_only: false, p_crew_id: null, p_details: {}, p_open_ended: open,
    }, t, 'write');
    if (res.status >= 200 && res.status < 300) plansCreated.add(1);
  }
  think(3, 8);
}
