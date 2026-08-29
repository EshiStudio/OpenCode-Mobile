import { fetch as expoFetch } from "expo/fetch";
import { t } from "./i18n";

/**
 * Dropbox API v2 client.
 *
 * Paths are plain strings rooted at the app's workspace folder, so this maps
 * closely onto the Yandex client.
 */
const RPC = "https://api.dropboxapi.com/2";
const CONTENT = "https://content.dropboxapi.com/2";

export const ROOT = "/opencode";

export class DropboxError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function full(rel: string): string {
  const clean = String(rel || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p && p !== ".")
    .join("/");
  if (clean.includes("..")) throw new DropboxError(0, t("tool.err.dotdot"));
  return clean ? ROOT + "/" + clean : ROOT;
}

async function rpc(token: string, path: string, body: unknown): Promise<Response> {
  try {
    return await expoFetch(RPC + path, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new DropboxError(0, t("disk.dropbox.noNetwork"));
  }
}

async function fail(res: Response, fallback: string): Promise<never> {
  let detail = fallback;
  try {
    const t = await res.text();
    if (t) detail = t.slice(0, 200);
  } catch {
    // keep fallback
  }
  if (res.status === 401) throw new DropboxError(401, t("disk.dropbox.tokenRejected"));
  throw new DropboxError(res.status, detail);
}

export async function makeFolder(token: string, rel: string): Promise<void> {
  const res = await rpc(token, "/files/create_folder_v2", { path: full(rel), autorename: false });
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  // Already existing is the expected outcome when reconnecting.
  if (text.includes("path/conflict")) return;
  if (res.status === 401) throw new DropboxError(401, t("disk.dropbox.tokenRejected"));
  throw new DropboxError(res.status, text.slice(0, 200) || t("disk.dropbox.mkdirFailed"));
}

export async function connect(token: string): Promise<{ root: string }> {
  await makeFolder(token, "");
  return { root: ROOT };
}

export async function listFolder(token: string, rel: string): Promise<string[]> {
  const res = await rpc(token, "/files/list_folder", { path: full(rel) });
  if (!res.ok) await fail(res, t("disk.dropbox.readFolderFailed"));
  const j = await res.json();
  const entries: Array<{ name: string; [".tag"]: string }> = j?.entries || [];
  return entries.map((e) => (e[".tag"] === "folder" ? e.name + "/" : e.name));
}

export async function uploadText(token: string, rel: string, content: string): Promise<void> {
  const arg = JSON.stringify({ path: full(rel), mode: "overwrite", mute: true });
  let res: Response;
  try {
    res = await expoFetch(CONTENT + "/files/upload", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Dropbox-API-Arg": arg,
        "Content-Type": "application/octet-stream",
      },
      body: content,
    });
  } catch {
    throw new DropboxError(0, t("disk.dropbox.uploadAborted"));
  }
  if (!res.ok) await fail(res, t("disk.dropbox.uploadRejected"));
}

export async function downloadText(token: string, rel: string): Promise<string> {
  let res: Response;
  try {
    res = await expoFetch(CONTENT + "/files/download", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Dropbox-API-Arg": JSON.stringify({ path: full(rel) }),
      },
    });
  } catch {
    throw new DropboxError(0, t("disk.dropbox.noNetwork"));
  }
  if (!res.ok) await fail(res, t("disk.dropbox.readFileFailed"));
  return await res.text();
}

export async function deletePath(token: string, rel: string): Promise<void> {
  const res = await rpc(token, "/files/delete_v2", { path: full(rel) });
  if (!res.ok) await fail(res, t("disk.dropbox.deleteFailed"));
}
