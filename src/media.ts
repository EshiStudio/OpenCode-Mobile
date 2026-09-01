import { Directory, File, Paths } from "expo-file-system";
import { t } from "./i18n";

/**
 * Picking, attaching and exporting files.
 *
 * expo-file-system ships the system pickers, so photos, documents and the
 * "save where I want" flow all go through the Android document UI — no extra
 * native module and no permission prompt of our own.
 */

export type Picked = {
  name: string;
  uri: string;
  mime: string;
  size: number;
  isImage: boolean;
};

const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "heic", "heif"];

/** Images the OpenAI-compatible vision APIs accept as a data URL. */
const VISION_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

export function isImageName(name: string, mime?: string): boolean {
  if (mime && mime.startsWith("image/")) return true;
  return IMAGE_EXT.includes(extOf(name));
}

function describe(f: File): Picked {
  const name = f.name || t("media.file");
  const mime = f.type || guessMime(name);
  return { name, uri: f.uri, mime, size: f.size || 0, isImage: isImageName(name, mime) };
}

export function guessMime(name: string): string {
  const e = extOf(name);
  if (VISION_MIME[e]) return VISION_MIME[e];
  if (IMAGE_EXT.includes(e)) return "image/" + e;
  if (e === "pdf") return "application/pdf";
  if (e === "json") return "application/json";
  if (e === "md" || e === "txt" || e === "csv" || e === "log") return "text/plain";
  return "application/octet-stream";
}

/** Photos and videos from the gallery, or any document — the picker filters by mime. */
export async function pickMedia(kind: "photo" | "media" | "file"): Promise<Picked[]> {
  const mimeTypes =
    kind === "photo" ? ["image/*"] : kind === "media" ? ["image/*", "video/*", "audio/*"] : ["*/*"];
  const res = await File.pickFileAsync({ multipleFiles: true, mimeTypes });
  if (res.canceled || !res.result) return [];
  return res.result.map(describe);
}

/**
 * A picked file lives in a temporary location the picker controls, so copy it
 * into our own cache before anything else refers to it.
 */
export async function keepLocally(p: Picked): Promise<Picked> {
  const box = new Directory(Paths.cache, "attachments");
  if (!box.exists) box.create({ intermediates: true });
  const dest = new File(box, `${Date.now()}-${sanitize(p.name)}`);
  try {
    await new File(p.uri).copy(dest, { overwrite: true } as never);
  } catch {
    return p;
  }
  return { ...p, uri: dest.uri };
}

/**
 * Copies a file somewhere it will still be there later. `keepLocally` uses the
 * cache, which is fine for a pending attachment but not for one that has to
 * keep showing in the chat history — the OS clears the cache whenever it likes.
 */
export async function keepForHistory(uri: string, name: string): Promise<string> {
  try {
    const box = new Directory(Paths.document, "attachments");
    if (!box.exists) box.create({ intermediates: true });
    const dest = new File(box, `${Date.now()}-${sanitize(name)}`);
    await new File(uri).copy(dest, { overwrite: true } as never);
    return dest.uri;
  } catch {
    // Better a link to the cache copy than nothing at all.
    return uri;
  }
}

function sanitize(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 60) || "file";
}

/** A data URL for the vision APIs. Returns null when the format is not one they take. */
export async function imageDataUrl(p: Picked): Promise<string | null> {
  const e = extOf(p.name);
  const mime = VISION_MIME[e] || (p.mime.startsWith("image/") ? p.mime : "");
  if (!mime) return null;
  try {
    const b64 = await new File(p.uri).base64();
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}

const TEXT_EXT = [
  "txt", "md", "markdown", "json", "csv", "tsv", "log", "yml", "yaml", "xml", "html", "css",
  "js", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "kt", "swift", "c", "h", "cpp",
  "sh", "bat", "ini", "toml", "env", "sql", "gradle",
];

/** Whether reading the file as text will produce something worth sending. */
export function isTextual(name: string, mime?: string): boolean {
  if (mime && (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml")) return true;
  return TEXT_EXT.includes(extOf(name));
}

/** Head of a text file, for attaching source code or notes to the prompt. */
export async function textPreview(p: Picked, limit = 12000): Promise<string | null> {
  try {
    const body = await new File(p.uri).text();
    return body.length > limit ? body.slice(0, limit) + t("media.truncated") : body;
  } catch {
    return null;
  }
}

export type SaveResult = { saved: boolean; where?: string; reason?: string };

/**
 * Hands a file to the user: they pick the folder (Downloads, an SD card, a cloud
 * app), and we copy into it. Android gives no write access to Downloads without
 * this, so the picker is not an extra step — it is the only way.
 */
export async function exportToDevice(source: File, name?: string): Promise<SaveResult> {
  if (!source.exists) return { saved: false, reason: t("media.noFile") };
  let target: Directory;
  try {
    target = await Directory.pickDirectoryAsync();
  } catch {
    return { saved: false, reason: t("media.noFolder") };
  }
  if (!target) return { saved: false, reason: t("media.noFolder") };
  const dest = new File(target, sanitize(name || source.name));
  try {
    await source.copy(dest, { overwrite: true } as never);
  } catch (e) {
    return { saved: false, reason: e instanceof Error ? e.message : t("media.saveFailed") };
  }
  return { saved: true, where: target.uri };
}

/** Downloads a URL into the app cache and returns the file. */
export async function downloadToCache(url: string, name?: string): Promise<File> {
  const box = new Directory(Paths.cache, "downloads");
  if (!box.exists) box.create({ intermediates: true });
  const guessed = name || decodeURIComponent(url.split("?")[0].split("/").pop() || "download");
  const dest = new File(box, sanitize(guessed));
  return File.downloadFileAsync(url, dest, { idempotent: true } as never);
}

/** Downloads a URL and immediately offers it to the user's storage of choice. */
export async function downloadToDevice(url: string, name?: string): Promise<SaveResult> {
  let file: File;
  try {
    file = await downloadToCache(url, name);
  } catch (e) {
    return { saved: false, reason: e instanceof Error ? e.message : t("media.downloadFailed") };
  }
  return exportToDevice(file, name);
}

/** Writes text into the app cache under a given filename, for exporting or handing off content that only ever existed in memory (a file read from a server, a cloud drive, or another device's disk). */
async function writeTextToCache(content: string, name: string): Promise<File> {
  const box = new Directory(Paths.cache, "text-exports");
  if (!box.exists) box.create({ intermediates: true });
  const dest = new File(box, sanitize(name));
  if (dest.exists) dest.delete();
  dest.create({ intermediates: true } as never);
  dest.write(content);
  return dest;
}

/** The tap-to-view file's "Save to device" action: no local File to hand off, only text already read into memory. */
export async function saveTextToDevice(content: string, name: string): Promise<SaveResult> {
  let file: File;
  try {
    file = await writeTextToCache(content, name);
  } catch (e) {
    return { saved: false, reason: e instanceof Error ? e.message : t("media.saveFailed") };
  }
  return exportToDevice(file, name);
}

const MIME_BY_EXT: Record<string, string> = {
  md: "text/markdown",
  mdx: "text/markdown",
  json: "application/json",
  html: "text/html",
  htm: "text/html",
  xml: "application/xml",
  csv: "text/csv",
  pdf: "application/pdf",
};

/** The tap-to-view file's "Open in another app" action: writes the in-memory text out, then hands the OS a content:// URI to route to whatever app claims its type. */
export async function openTextExternally(content: string, name: string): Promise<{ opened: boolean; reason?: string }> {
  let file: File;
  try {
    file = await writeTextToCache(content, name);
  } catch (e) {
    return { opened: false, reason: e instanceof Error ? e.message : t("media.saveFailed") };
  }
  try {
    const [{ getContentUriAsync }, IntentLauncher] = await Promise.all([
      import("expo-file-system/legacy"),
      import("expo-intent-launcher"),
    ]);
    const contentUri = await getContentUriAsync(file.uri);
    const ext = name.split(".").pop()?.toLowerCase() || "";
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri,
      // FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK
      flags: 1 | 268435456,
      type: MIME_BY_EXT[ext] || "text/plain",
    });
    return { opened: true };
  } catch (e) {
    return { opened: false, reason: e instanceof Error ? e.message : t("media.openFailed") };
  }
}

export function humanSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return t("size.b", { n: bytes });
  if (bytes < 1024 * 1024) return t("size.kb", { n: Math.round(bytes / 1024) });
  return t("size.mb", { n: (bytes / (1024 * 1024)).toFixed(1) });
}
