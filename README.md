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

## Notes

- The hosted prototype is Vercel-friendly and uses root API routes plus the `v2/` static front end.
- `npm start` runs the root hosted dev server. The older `v2/server.js` remains available as a local fallback during the transition.
