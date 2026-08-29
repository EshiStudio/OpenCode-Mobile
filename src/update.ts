import * as Application from "expo-application";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { Linking, Platform } from "react-native";
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

/**
 * Version of the running build, read from the native manifest rather than kept
 * by hand. A hand-written constant drifts from the APK the moment a release is
 * cut from a stale build, and the app then offers an update to a version it is
 * already running, forever.
 *
 * Empty only where there is no native manifest (web); the update check bails
 * out in that case instead of comparing against a made-up version.
 */
export const APP_VERSION = Application.nativeApplicationVersion || "";

/** Same, but safe to show in the UI. */
export const APP_VERSION_LABEL = APP_VERSION || "unknown";

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
  if (!APP_VERSION) return null;
  return isNewer(rel.version, APP_VERSION) ? rel : null;
}

/**
 * Downloads the release APK and hands it to the system installer.
 *
 * Opening the URL instead just sends the user to a browser and leaves them to
 * find the file — which is what the header button and the settings button used
 * to do. Android still shows its own install prompt; that step cannot be
 * skipped for a sideloaded app.
 *
 * Falls back to opening the release page when there is no APK attached, on
 * iOS, or if the download fails.
 */
export async function installUpdate(
  rel: { apkUrl: string; pageUrl: string; version: string },
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const openPage = () => Linking.openURL(rel.pageUrl || rel.apkUrl).catch(() => {});

  if (Platform.OS !== "android" || !rel.apkUrl) {
    await openPage();
    return;
  }

  try {
    const target = `${FileSystem.documentDirectory}update-${rel.version}.apk`;
    const task = FileSystem.createDownloadResumable(rel.apkUrl, target, {}, (p) => {
      if (p.totalBytesExpectedToWrite > 0) {
        onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
      }
    });
    const done = await task.downloadAsync();
    if (!done?.uri) throw new Error("no file");

    const contentUri = await FileSystem.getContentUriAsync(done.uri);
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      // FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK
      flags: 1 | 268435456,
      type: "application/vnd.android.package-archive",
    });
  } catch {
    await openPage();
  }
}
