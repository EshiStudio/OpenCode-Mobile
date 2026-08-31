# pair-proxy

Optional companion for `opencode serve`. Sits in front of it and hands out a
fresh 6-character pairing code, delivered as a push notification, instead of
making you type the real server password.

Nothing about it is required — the app connects to `opencode serve` directly
with a plain password just fine. This is only for the "pick a computer off
the scan, get a code by push, type it in" flow.

## How it works

1. The phone POSTs `{ pushToken }` to `/pair` (no auth — that's the point,
   nothing to type yet). The proxy generates a code, remembers it for a
   while, and pushes it to that Expo push token.
2. The phone connects to `opencode serve` *through this proxy*, using the
   code as the password. The proxy swaps it for the real
   `OPENCODE_SERVER_PASSWORD` before forwarding — `opencode serve` itself
   never has to know pairing codes exist.
3. The code stays valid for its whole TTL (`PAIR_CODE_TTL_MS`, default 8
   hours), not just the first request — Basic auth is resent on every
   request for the life of a session, so a single-use code would lock the
   client out immediately after connecting.
4. Everything that isn't `/pair` passes straight through, so a client that
   already has the real password (a saved connection reconnecting) keeps
   working exactly as before, without going through this proxy at all if
   you point it at `opencode serve`'s own port instead.

The code is also printed to this process's own console on every `/pair`
call, as a fallback for when the push doesn't arrive (notifications off,
delivery failure) — read it there and type it in by hand.

## Running it

```bash
cd server/pair-proxy
OPENCODE_SERVER_USERNAME=opencode \
OPENCODE_SERVER_PASSWORD=your-real-password \
UPSTREAM_HOST=127.0.0.1 \
UPSTREAM_PORT=41111 \
PAIR_PROXY_PORT=41113 \
node pair-proxy.mjs
```

Point the phone at `http://<computer-address>:41113` instead of
`opencode serve`'s own port when using the scan-and-pick flow — picking a
computer in the app already does this automatically.

## Sending real push notifications

Requires two things, both free:

1. **A Firebase project** with an Android app registered under this app's
   package name (`com.anonymous.opencodemobile`). Download
   `google-services.json` from it and place it at the root of the mobile
   app's repo (`../../google-services.json` from here) — see the main
   README's "Connecting to a computer" section.
2. **An Expo/EAS account**, with that same Firebase project's *service
   account key* (Firebase console → Project settings → Service accounts →
   Generate new private key) uploaded via:
   ```
   npx eas-cli credentials
   ```
   → Android → Google Service Account → "Manage your Google Service
   Account Key for Push Notifications (FCM V1)" → set one up, point it at
   the downloaded service account JSON.

Without this, `/pair` still works and still prints the code to the
console — the push just won't be delivered, and `sendPush` will throw
(logged, not fatal).

## Env vars

| Variable | Default | What it does |
| --- | --- | --- |
| `PAIR_PROXY_PORT` | `41113` | Port this proxy listens on |
| `UPSTREAM_HOST` | `127.0.0.1` | Where the real `opencode serve` is |
| `UPSTREAM_PORT` | `41111` | Its port |
| `OPENCODE_SERVER_USERNAME` | `opencode` | Must match `opencode serve`'s own |
| `OPENCODE_SERVER_PASSWORD` | *(required)* | Must match `opencode serve`'s own — this is what a valid code gets swapped for |
| `PAIR_CODE_TTL_MS` | `28800000` (8h) | How long a generated code stays valid |
