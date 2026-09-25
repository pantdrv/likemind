// `npm run dev`: starts a free Cloudflare quick tunnel to Metro and then Expo, so phones can load the app
// from any network (replacement for `expo start --tunnel`, whose ngrok tunnel keeps failing).
// Needs cloudflared: `brew install cloudflared`. Extra args are passed to `expo start`, e.g. `npm run dev -- --clear`.
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT) || 8081;
const tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
tunnel.on('error', () => {
  console.error('cloudflared not found. Install it with: brew install cloudflared');
  process.exit(1);
});

let expo;
const stop = () => { tunnel.kill(); expo?.kill(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const timer = setTimeout(() => { console.error('Cloudflare tunnel did not start within 45s. Check your internet and try again.'); stop(); process.exit(1); }, 45_000);
let log = '';
const onOutput = (chunk) => {
  if (expo) return;
  log += chunk.toString();
  const url = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
  if (!url) return;
  clearTimeout(timer);
  console.log(`\nTunnel ready: ${url}\n`);
  expo = spawn('npx', ['expo', 'start', '--port', String(PORT), ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, EXPO_PACKAGER_PROXY_URL: url },
  });
  expo.on('exit', (code) => { tunnel.kill(); process.exit(code ?? 0); });
};
tunnel.stdout.on('data', onOutput);
tunnel.stderr.on('data', onOutput);
tunnel.on('exit', (code) => { if (!expo) { console.error(`cloudflared exited (${code}).\n${log.slice(-800)}`); process.exit(1); } });
