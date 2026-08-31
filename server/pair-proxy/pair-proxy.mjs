// Sits in front of `opencode serve` and hands out a fresh 6-character
// pairing code per connection attempt instead of the long-lived password.
//
// Flow:
//   1. Phone POSTs { pushToken } to /pair (no auth -- that's the point,
//      nothing to type yet). We generate a code, remember it for CODE_TTL_MS,
//      and push it to that Expo push token.
//   2. Phone connects to the real opencode server *through this proxy*
//      using that code as the password. We swap it for the real
//      OPENCODE_SERVER_PASSWORD before forwarding, so `opencode serve`
//      itself never has to know about codes at all.
//   3. The code stays valid for the whole TTL window, not just once --
//      Basic auth is resent on every request for the life of the session
//      (the event stream alone is one long-lived connection), so a
//      single-use code would lock the client out after its first request.
//
// Everything else passes through untouched -- a client that already knows
// the real long-term password (a saved connection reconnecting) keeps
// working exactly as before.

import http from "node:http";

const LISTEN_PORT = Number(process.env.PAIR_PROXY_PORT || 41113);
const UPSTREAM_HOST = process.env.UPSTREAM_HOST || "127.0.0.1";
const UPSTREAM_PORT = Number(process.env.UPSTREAM_PORT || 41111);
const REAL_USERNAME = process.env.OPENCODE_SERVER_USERNAME || "opencode";
const REAL_PASSWORD = process.env.OPENCODE_SERVER_PASSWORD;
// The code has to stay valid for the whole session, not just the first
// request (see translateAuth) -- this is really "how long before you
// have to pair again", not "how long to type the code in". Default: a
// working day.
const CODE_TTL_MS = Number(process.env.PAIR_CODE_TTL_MS || 8 * 60 * 60 * 1000);

if (!REAL_PASSWORD) {
  console.error("OPENCODE_SERVER_PASSWORD is not set -- this proxy needs the real password to forward requests with.");
  process.exit(1);
}

// One pairing attempt at a time is plenty for a single-user home setup.
let pending = null; // { code, expires, used }

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L -- easy to misread

function generateCode() {
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}

async function sendPush(pushToken, code) {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      to: pushToken,
      title: "Код для подключения",
      body: code,
      data: { code },
      priority: "high",
      sound: "default",
    }),
  });
  const data = await res.json().catch(() => null);
  const ticket = data?.data;
  if (ticket?.status === "error") {
    throw new Error(`Expo push rejected: ${ticket.message || JSON.stringify(ticket)}`);
  }
  return ticket;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function json(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": buf.length });
  res.end(buf);
}

/** Swaps a valid one-time code for the real password in a Basic auth header. */
function translateAuth(header) {
  if (!header || !header.startsWith("Basic ")) return header;
  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return header;
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return header;
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);

  // Basic auth is stateless and resent on *every* request, not just the
  // first -- a session sends dozens of these (the event stream alone is
  // one long-lived connection, plus a request per action). Single-using
  // the code here would authenticate the very first request and then
  // lock the client out of everything after it. The code stays valid
  // for its whole TTL instead; that window is the actual security
  // boundary; see CODE_TTL_MS.
  if (!pending || Date.now() > pending.expires || pass !== pending.code) {
    return header; // not (or no longer) a valid pairing code -- pass through as-is
  }
  return "Basic " + Buffer.from(`${REAL_USERNAME}:${REAL_PASSWORD}`).toString("base64");
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/pair") {
    try {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const pushToken = body.pushToken;
      if (!pushToken || typeof pushToken !== "string") {
        return json(res, 400, { error: "pushToken is required" });
      }
      const code = generateCode();
      pending = { code, expires: Date.now() + CODE_TTL_MS };
      // Printed regardless of whether the push actually lands: notification
      // permission can be denied, delivery can just fail, and there needs
      // to be a way to read the code by hand in that case too.
      console.log(`[pair] code: ${code}  (valid ${CODE_TTL_MS / 60000} min)`);
      await sendPush(pushToken, code);
      console.log(`[pair] push sent`);
      return json(res, 202, { expiresInSeconds: CODE_TTL_MS / 1000 });
    } catch (e) {
      console.error("[pair] failed:", e instanceof Error ? e.message : e);
      return json(res, 502, { error: "could not send push notification" });
    }
  }

  // Everything else: proxy straight through to the real server, swapping
  // the Authorization header if it carries a live pairing code.
  const headers = { ...req.headers, authorization: translateAuth(req.headers.authorization) };
  delete headers.host;

  const upstreamReq = http.request(
    {
      host: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      method: req.method,
      path: req.url,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res); // streamed, not buffered -- keeps /event (SSE) alive
    },
  );
  upstreamReq.on("error", (e) => {
    console.error("[proxy] upstream error:", e.message);
    if (!res.headersSent) json(res, 502, { error: "upstream unreachable" });
    else res.end();
  });
  req.pipe(upstreamReq);
});

server.listen(LISTEN_PORT, "0.0.0.0", () => {
  console.log(`pair-proxy listening on http://0.0.0.0:${LISTEN_PORT}`);
  console.log(`  forwarding to opencode serve at http://${UPSTREAM_HOST}:${UPSTREAM_PORT}`);
  console.log(`  unauthenticated pairing endpoint: POST /pair { pushToken }`);
});
