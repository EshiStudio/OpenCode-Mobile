import * as Dropbox from "./dropbox";
import * as Drive from "./gdrive";
import * as Yandex from "./yandex";

/** Cloud storages the app can attach to. */
export type CloudId = "yandex" | "gdrive" | "dropbox";

export const CLOUDS: Array<{ id: CloudId; name: string; hint: string }> = [
  {
    id: "yandex",
    name: "Яндекс Диск",
    hint: "OAuth-токен с правами cloud_api:disk. Токен живёт год.",
  },
  {
    id: "gdrive",
    name: "Google Drive",
    hint: "Access token с областью drive.file. Живёт около часа.",
  },
  {
    id: "dropbox",
    name: "Dropbox",
    hint: "Access token из App Console. Живёт около четырёх часов.",
  },
];

export function cloudName(id: CloudId): string {
  return CLOUDS.find((c) => c.id === id)?.name || id;
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
