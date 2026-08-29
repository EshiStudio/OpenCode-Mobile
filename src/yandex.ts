import { fetch as expoFetch } from "expo/fetch";

/**
 * Yandex Disk REST client.
 *
 * Everything the app writes lives under a single root folder, created when the
 * token is connected, so projects never scatter across the user's whole disk.
 */
const API = "https://cloud-api.yandex.net/v1/disk";

/** Preferred root, and the fallback when the token only has app-folder rights. */
export const DISK_ROOT = "disk:/opencode";
export const APP_ROOT = "app:/opencode";

/** Tokens are sometimes pasted as the whole redirect URL. */
export function extractToken(input: string): string {
  const s = String(input || "").trim();
  const m = s.match(/access_token=([^&\s#]+)/);
  return (m ? m[1] : s).trim();
}

function headers(token: string): Record<string, string> {
  return { Authorization: "OAuth " + token, Accept: "application/json" };
}

export class DiskError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call(token: string, path: string, init?: { method?: string; body?: string }): Promise<Response> {
  let res: Response;
  try {
    res = await expoFetch(API + path, {
      method: init?.method || "GET",
      headers: init?.body ? { ...headers(token), "Content-Type": "application/json" } : headers(token),
      body: init?.body,
    });
  } catch {
    throw new DiskError(0, "Нет связи с Яндекс Диском");
  }
  return res;
}

async function message(res: Response, fallback: string): Promise<string> {
  try {
    const j = await res.json();
    return j?.message || j?.description || fallback;
  } catch {
    return fallback;
  }
}

/** Creates a folder, treating "already exists" as success. */
export async function ensureFolder(token: string, path: string): Promise<void> {
  const res = await call(token, "/resources?path=" + encodeURIComponent(path), { method: "PUT" });
  if (res.ok || res.status === 409) return;
  if (res.status === 401) throw new DiskError(401, "Токен отклонён (401): он неверный или истёк. Выпустите новый.");
  if (res.status === 403) throw new DiskError(403, await message(res, "Недостаточно прав (403)"));
  throw new DiskError(res.status, await message(res, "Не удалось создать папку " + path));
}

/**
 * Connects and picks a workspace root.
 *
 * A token with only `cloud_api:disk.app_folder` may not touch `disk:/`, so fall
 * back to the app folder rather than failing outright.
 */
export async function connect(token: string): Promise<{ root: string }> {
  try {
    await ensureFolder(token, DISK_ROOT);
    return { root: DISK_ROOT };
  } catch (e) {
    if (e instanceof DiskError && e.status === 403) {
      await ensureFolder(token, APP_ROOT);
      return { root: APP_ROOT };
    }
    throw e;
  }
}

function full(rel: string, root: string = DISK_ROOT): string {
  const clean = String(rel || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p && p !== ".")
    .join("/");
  if (clean.includes("..")) throw new DiskError(0, "путь не должен содержать ..");
  return clean ? root + "/" + clean : root;
}

export async function listFolder(token: string, rel: string, root?: string): Promise<string[]> {
  const res = await call(token, "/resources?limit=200&path=" + encodeURIComponent(full(rel, root)));
  if (res.status === 404) throw new DiskError(404, "Папки нет: " + (rel || "/"));
  if (!res.ok) throw new DiskError(res.status, await message(res, "Ошибка чтения папки"));
  const j = await res.json();
  const items = j?._embedded?.items || [];
  return items.map((it: { name: string; type: string }) => (it.type === "dir" ? it.name + "/" : it.name));
}

export async function uploadText(token: string, rel: string, content: string, root?: string): Promise<void> {
  const path = full(rel, root);
  const res = await call(token, "/resources/upload?overwrite=true&path=" + encodeURIComponent(path));
  if (!res.ok) throw new DiskError(res.status, await message(res, "Не удалось получить ссылку на загрузку"));
  const { href } = await res.json();
  if (!href) throw new DiskError(0, "Яндекс не вернул ссылку на загрузку");
  let put: Response;
  try {
    put = await expoFetch(href, { method: "PUT", body: content });
  } catch {
    throw new DiskError(0, "Загрузка прервалась");
  }
  if (!put.ok) throw new DiskError(put.status, "Загрузка отклонена (" + put.status + ")");
}

export async function downloadText(token: string, rel: string, root?: string): Promise<string> {
  const res = await call(token, "/resources/download?path=" + encodeURIComponent(full(rel, root)));
  if (res.status === 404) throw new DiskError(404, "Файла нет: " + rel);
  if (!res.ok) throw new DiskError(res.status, await message(res, "Не удалось получить ссылку на скачивание"));
  const { href } = await res.json();
  const file = await expoFetch(href);
  if (!file.ok) throw new DiskError(file.status, "Скачивание отклонено (" + file.status + ")");
  return await file.text();
}

export async function makeFolder(token: string, rel: string, root?: string): Promise<void> {
  // Yandex creates only one level at a time, so walk the path.
  const base = root || DISK_ROOT;
  const parts = full(rel, base).slice(base.length + 1).split("/").filter(Boolean);
  let acc = base;
  await ensureFolder(token, acc);
  for (const p of parts) {
    acc += "/" + p;
    await ensureFolder(token, acc);
  }
}

export async function deletePath(token: string, rel: string, root?: string): Promise<void> {
  const res = await call(token, "/resources?permanently=false&path=" + encodeURIComponent(full(rel, root)), {
    method: "DELETE",
  });
  if (res.ok || res.status === 202 || res.status === 204) return;
  if (res.status === 404) throw new DiskError(404, "Ничего нет по пути: " + rel);
  throw new DiskError(res.status, await message(res, "Не удалось удалить"));
}
