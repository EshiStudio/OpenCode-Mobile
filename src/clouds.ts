import * as Dropbox from "./dropbox";
import { t } from "./i18n";
import * as Drive from "./gdrive";
import * as Yandex from "./yandex";

/** Cloud storages the app can attach to. */
export type CloudId = "yandex" | "gdrive" | "dropbox";

export const CLOUD_IDS: CloudId[] = ["yandex", "gdrive", "dropbox"];

/**
 * Names and hints are resolved on call, not at import: the language is loaded
 * from storage after the modules are evaluated, so a frozen list would stay
 * in whatever language happened to be the default.
 */
export function cloudName(id: CloudId): string {
  if (id === "yandex") return t("cloud.yandex");
  if (id === "gdrive") return "Google Drive";
  if (id === "dropbox") return "Dropbox";
  return id;
}

export function cloudHint(id: CloudId): string {
  return t("cloud." + id + ".hint");
}

export function clouds(): Array<{ id: CloudId; name: string; hint: string }> {
  return CLOUD_IDS.map((id) => ({ id, name: cloudName(id), hint: cloudHint(id) }));
}

/** Connects, creating the shared workspace folder. Returns the root it settled on. */
export async function connect(id: CloudId, token: string): Promise<{ root: string }> {
  if (id === "yandex") return await Yandex.connect(token);
  if (id === "gdrive") return await Drive.connect(token);
  return await Dropbox.connect(token);
}

export async function listFolder(id: CloudId, token: string, rel: string, root?: string): Promise<string[]> {
  if (id === "yandex") return await Yandex.listFolder(token, rel, root);
  if (id === "gdrive") return await Drive.listFolder(token, rel);
  return await Dropbox.listFolder(token, rel);
}

export async function makeFolder(id: CloudId, token: string, rel: string, root?: string): Promise<void> {
  if (id === "yandex") return await Yandex.makeFolder(token, rel, root);
  if (id === "gdrive") return await Drive.makeFolder(token, rel);
  return await Dropbox.makeFolder(token, rel);
}

export async function uploadText(
  id: CloudId,
  token: string,
  rel: string,
  content: string,
  root?: string,
): Promise<void> {
  if (id === "yandex") return await Yandex.uploadText(token, rel, content, root);
  if (id === "gdrive") return await Drive.uploadText(token, rel, content);
  return await Dropbox.uploadText(token, rel, content);
}

export async function downloadText(id: CloudId, token: string, rel: string, root?: string): Promise<string> {
  if (id === "yandex") return await Yandex.downloadText(token, rel, root);
  if (id === "gdrive") return await Drive.downloadText(token, rel);
  return await Dropbox.downloadText(token, rel);
}
