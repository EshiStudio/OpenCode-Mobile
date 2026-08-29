import { fetch as expoFetch } from "expo/fetch";
import { t } from "./i18n";

/**
 * Google Drive v3 client.
 *
 * Drive addresses everything by file id rather than path, so each call resolves
 * the workspace folder (and any nested folders) to ids first.
 */
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export const ROOT = "opencode";

export class DriveError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call(token: string, url: string, init?: { method?: string; body?: string; type?: string }): Promise<Response> {
  try {
    return await expoFetch(url, {
      method: init?.method || "GET",
      headers: {
        Authorization: "Bearer " + token,
        ...(init?.body ? { "Content-Type": init.type || "application/json" } : {}),
      },
      body: init?.body,
    });
  } catch {
    throw new DriveError(0, t("disk.gdrive.noNetwork"));
  }
}

async function fail(res: Response, fallback: string): Promise<never> {
  if (res.status === 401) throw new DriveError(401, t("disk.gdrive.tokenRejected"));
  if (res.status === 403) throw new DriveError(403, t("disk.gdrive.forbidden"));
  let detail = fallback;
  try {
    const j = await res.json();
    detail = j?.error?.message || fallback;
  } catch {
    // keep fallback
  }
  throw new DriveError(res.status, detail);
}

function segments(rel: string): string[] {
  const parts = String(rel || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p && p !== ".");
  if (parts.some((p) => p === "..")) throw new DriveError(0, t("tool.err.dotdot"));
  return parts;
}

async function findChild(token: string, parent: string, name: string, folderOnly: boolean): Promise<string | null> {
  const q = [
    `name='${name.replace(/'/g, "\\'")}'`,
    `'${parent}' in parents`,
    "trashed=false",
    ...(folderOnly ? [`mimeType='${FOLDER_MIME}'`] : []),
  ].join(" and ");
  const res = await call(token, `${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`);
  if (!res.ok) await fail(res, t("disk.gdrive.searchFailed"));
  const j = await res.json();
  return j?.files?.[0]?.id || null;
}

async function createFolder(token: string, parent: string, name: string): Promise<string> {
  const res = await call(token, `${API}/files?fields=id`, {
    method: "POST",
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] }),
  });
  if (!res.ok) await fail(res, t("disk.gdrive.mkdirFailed"));
  const j = await res.json();
  return j.id as string;
}

/** Resolves (creating when asked) the folder chain under the workspace root. */
async function folderId(token: string, rel: string, create: boolean): Promise<string> {
  let parent = "root";
  for (const name of [ROOT, ...segments(rel)]) {
    let id = await findChild(token, parent, name, true);
    if (!id) {
      if (!create) throw new DriveError(404, t("disk.gdrive.noFolder", { name }));
      id = await createFolder(token, parent, name);
    }
    parent = id;
  }
  return parent;
}

export async function connect(token: string): Promise<{ root: string }> {
  await folderId(token, "", true);
  return { root: ROOT };
}

export async function makeFolder(token: string, rel: string): Promise<void> {
  await folderId(token, rel, true);
}

export async function listFolder(token: string, rel: string): Promise<string[]> {
  const id = await folderId(token, rel, false);
  const q = `'${id}' in parents and trashed=false`;
  const res = await call(token, `${API}/files?q=${encodeURIComponent(q)}&fields=files(name,mimeType)&pageSize=200`);
  if (!res.ok) await fail(res, t("disk.gdrive.readFolderFailed"));
  const j = await res.json();
  const files: Array<{ name: string; mimeType: string }> = j?.files || [];
  return files.map((f) => (f.mimeType === FOLDER_MIME ? f.name + "/" : f.name));
}

function split(rel: string): { dir: string; name: string } {
  const parts = segments(rel);
  const name = parts.pop() || "";
  if (!name) throw new DriveError(0, t("tool.err.noName"));
  return { dir: parts.join("/"), name };
}

export async function uploadText(token: string, rel: string, content: string): Promise<void> {
  const { dir, name } = split(rel);
  const parent = await folderId(token, dir, true);
  const existing = await findChild(token, parent, name, false);

  const boundary = "ocm" + Date.now();
  const meta = existing ? { name } : { name, parents: [parent] };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(meta) +
    `\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n` +
    content +
    `\r\n--${boundary}--`;

  const url = existing
    ? `${UPLOAD}/files/${existing}?uploadType=multipart`
    : `${UPLOAD}/files?uploadType=multipart`;
  const res = await call(token, url, {
    method: existing ? "PATCH" : "POST",
    body,
    type: `multipart/related; boundary=${boundary}`,
  });
  if (!res.ok) await fail(res, t("disk.gdrive.uploadRejected"));
}

export async function downloadText(token: string, rel: string): Promise<string> {
  const { dir, name } = split(rel);
  const parent = await folderId(token, dir, false);
  const id = await findChild(token, parent, name, false);
  if (!id) throw new DriveError(404, t("disk.gdrive.noFile", { path: rel }));
  const res = await call(token, `${API}/files/${id}?alt=media`);
  if (!res.ok) await fail(res, t("disk.gdrive.readFileFailed"));
  return await res.text();
}

export async function deletePath(token: string, rel: string): Promise<void> {
  const { dir, name } = split(rel);
  const parent = await folderId(token, dir, false);
  const id = await findChild(token, parent, name, false);
  if (!id) throw new DriveError(404, t("disk.gdrive.nothingAt", { path: rel }));
  const res = await call(token, `${API}/files/${id}`, { method: "DELETE" });
  if (!res.ok) await fail(res, t("disk.gdrive.deleteFailed"));
}
