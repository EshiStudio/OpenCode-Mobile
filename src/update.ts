import { fetch as expoFetch } from "expo/fetch";
import { t } from "./i18n";

/**
 * Update check against GitHub Releases.
 *
 * The app is sideloaded, so there is no store to do this for us: we ask GitHub
 * for the newest release, compare its tag with the version baked into this
 * build, and hand the APK URL to the system downloader. Android always asks the
 * user to confirm the install — that step cannot be skipped for sideloaded apps.
 */

/** Version of this build. Kept in step with `version` in app.json. */
export const APP_VERSION = "1.3.2";

export type Release = {
  version: string;
  notes: string;
  apkUrl: string;
  pageUrl: string;
  published: string;
};

/** "v1.2.3" / "1.2.3" -> [1, 2, 3] */
function parts(v: string): number[] {
  return String(v || "")
    .replace(/^v/i, "")
    .split(/[.\-+]/)
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n));
}

/** True when `a` is a strictly newer version than `b`. */
export function isNewer(a: string, b: string): boolean {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d > 0;
  }
  return false;
}

/** `owner/repo`, tolerating a pasted GitHub URL. */
export function normalizeRepo(input: string): string {
  const s = String(input || "").trim();
  const m = s.match(/github\.com\/([^/\s]+\/[^/\s#?]+)/i);
  const repo = (m ? m[1] : s).replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
  return /^[^/\s]+\/[^/\s]+$/.test(repo) ? repo : "";
}

export async function fetchLatest(repoInput: string): Promise<Release> {
  const repo = normalizeRepo(repoInput);
  if (!repo) throw new Error(t("update.needRepo"));

  let res: Response;
  try {
    res = await expoFetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
  } catch {
    throw new Error(t("update.noNetwork"));
  }
  if (res.status === 404) throw new Error(t("update.noReleases"));
  if (res.status === 403) throw new Error(t("update.rateLimited"));
  if (!res.ok) throw new Error(t("update.httpError", { status: res.status }));

  const j = await res.json();
  const assets: Array<{ name: string; browser_download_url: string }> = j?.assets || [];
  const apk = assets.find((a) => /\.apk$/i.test(a.name));
  return {
    version: String(j?.tag_name || j?.name || "").replace(/^v/i, ""),
    notes: String(j?.body || "").trim(),
    apkUrl: apk?.browser_download_url || "",
    pageUrl: String(j?.html_url || ""),
    published: String(j?.published_at || ""),
  };
}

/** Returns the release when it is newer than this build, otherwise null. */
export async function checkForUpdate(repo: string): Promise<Release | null> {
  const rel = await fetchLatest(repo);
  if (!rel.version) throw new Error(t("update.noTag"));
  return isNewer(rel.version, APP_VERSION) ? rel : null;
}
