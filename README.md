# Ritz-Weaselton

Hosted Marriott corporate rate comparison prototype with a warmer Ritz-adjacent UI.

## Run locally

1. `cd /Users/jag/Code/ritz-weaselton`
2. `npm install`
3. `npm start`
4. Open `http://localhost:3001`

## How it works now

- The browser is only the interface.
- Search requests go to the app's own API routes.
- Those API routes call Marriott's live site backend directly for each corp code.
- Preferences, presets, favourites, and recent history are stored per browser in `localStorage`.
- No Chrome tabs or AppleScript are used in the hosted path.

## Production search queue

Large comparisons are processed one corporate code at a time through Vercel Queues, so the browser request returns immediately and progress can survive reloads. Before deploying this version, connect **Upstash Redis** through the Vercel Marketplace and make sure these project environment variables are available to Preview and Production:

- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, or the Vercel Upstash integration's automatically injected `*_KV_REST_API_URL` / `*_KV_REST_API_TOKEN` names.

Search jobs and results are retained for 24 hours. Vercel Queues uses the project runtime identity; it does not require a committed token.

## Notes

- The hosted prototype is Vercel-friendly and uses root API routes plus the `v2/` static front end.
- `npm start` runs the root hosted dev server. The older `v2/server.js` remains available as a local fallback during the transition.
