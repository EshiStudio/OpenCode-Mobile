import * as Network from "expo-network";

/**
 * Finds an `opencode serve` on the local Wi-Fi network, the way a Wi-Fi
 * settings screen finds networks: sweep the subnet, list what answers.
 *
 * There is no way to do this without credentials and still learn anything
 * useful about the server — `/global/health` requires the same Basic Auth as
 * every other route (checked live: 401 with no body). What *is* safe to read
 * without a password is the shape of that refusal: opencode's auth
 * middleware answers every path, known or not, with
 * `WWW-Authenticate: Basic realm="Secure Area"` before routing even runs.
 * That header is a fingerprint — enough to say "an opencode server is here"
 * without asking it for anything a stranger shouldn't get for free. This is
 * deliberately the opposite of the port-41112 plugin from earlier today, which
 * handed out the whole config, keys included, to anyone who asked.
 */

/** The port `opencode serve --hostname 0.0.0.0` uses by convention here. */
export const SERVER_PORT = 41111;

const PER_HOST_TIMEOUT_MS = 800;
const CONCURRENCY = 24;

export type FoundServer = { host: string; port: number };

/** The phone's own subnet base, e.g. "192.168.1" from "192.168.1.42". */
export async function ownSubnet(): Promise<string | null> {
  try {
    const ip = await Network.getIpAddressAsync();
    const parts = (ip || "").split(".");
    if (parts.length !== 4 || parts[0] === "0") return null;
    return parts.slice(0, 3).join(".");
  } catch {
    return null;
  }
}

/**
 * Whether the phone is on Wi-Fi. A scan on mobile data would sweep the
 * carrier's own subnet — reachable, answering nothing, and slow for no
 * reason — so callers check this first and ask for Wi-Fi instead of scanning.
 */
export async function isOnWifi(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.type === Network.NetworkStateType.WIFI && !!state.isConnected;
  } catch {
    return false;
  }
}

/** True if this response is an opencode server refusing an unauthenticated request. */
function looksLikeOpencode(res: Response): boolean {
  if (res.status !== 401) return false;
  const challenge = res.headers.get("www-authenticate") || "";
  return /^basic\b/i.test(challenge.trim());
}

/**
 * Sweeps `<subnet>.1` through `<subnet>.254` at {@link SERVER_PORT}.
 *
 * `onProgress` fires after every host, for a scan bar; `signal` cancels the
 * remaining batches — the caller aborts when the user backs out.
 */
export async function scanForServers(
  subnet: string,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<FoundServer[]> {
  const hosts = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
  const found: FoundServer[] = [];
  let done = 0;

  for (let i = 0; i < hosts.length; i += CONCURRENCY) {
    if (signal?.aborted) break;
    const batch = hosts.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (host) => {
        try {
          const res = await fetch(`http://${host}:${SERVER_PORT}/global/health`, {
            signal: anySignal(signal, PER_HOST_TIMEOUT_MS),
          });
          if (looksLikeOpencode(res)) found.push({ host, port: SERVER_PORT });
        } catch {
          // No route, connection refused, or timed out — true for almost
          // every address on a /24; not an error worth surfacing.
        } finally {
          done++;
          onProgress?.(done, hosts.length);
        }
      }),
    );
  }
  return found;
}

/** A signal that fires on a timeout or when `outer` aborts, whichever comes first. */
function anySignal(outer: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  outer?.addEventListener("abort", () => {
    clearTimeout(timer);
    ac.abort();
  });
  return ac.signal;
}
