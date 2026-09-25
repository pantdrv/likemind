// Supabase Edge Function: turns a normal https link (clickable in WhatsApp) into an app deep link.
// GET /functions/v1/open?to=<playmate://... or exp://...>  ->  302 redirect to that app link.
// Deploy with JWT verification OFF (anyone who taps a shared link must reach it).
// Only app schemes are allowed, so this can't be abused as an open redirect to websites.
Deno.serve((req) => {
  const to = new URL(req.url).searchParams.get('to') ?? '';
  if (!/^(playmate|exp|exps):\/\//.test(to)) return new Response('Invalid link', { status: 400 });
  return new Response(null, { status: 302, headers: { Location: to } });
});
