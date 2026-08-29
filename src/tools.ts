import { Directory, File, Paths } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { AppControl, isAppTool, runAppTool } from "./app-tools";
import * as Clouds from "./clouds";
import { exportToDevice } from "./media";
import { CloudId } from "./clouds";

/**
 * File tools the model can call when "локальная работа" is on.
 *
 * Everything lives under a single workspace folder inside the app's own storage.
 * Android sandboxes apps, so this is the whole filesystem the app may touch
 * without the Storage Access Framework and a user-granted folder.
 */
const WORKSPACE = "workspace";

export function workspaceRoot(): Directory {
  return new Directory(Paths.document, WORKSPACE);
}

export function workspacePath(): string {
  return workspaceRoot().uri;
}

function ensureRoot(): Directory {
  const root = workspaceRoot();
  if (!root.exists) root.create({ intermediates: true });
  return root;
}

/** Reject anything that would climb out of the workspace. */
function safeSegments(rel: string): string[] {
  const parts = String(rel || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p && p !== ".");
  if (parts.some((p) => p === "..")) throw new Error("путь не должен содержать ..");
  if (/^[a-zA-Z]:/.test(rel) || rel.startsWith("/")) throw new Error("путь должен быть относительным");
  return parts;
}

function fileAt(rel: string): File {
  const parts = safeSegments(rel);
  if (!parts.length) throw new Error("не указано имя файла");
  return new File(ensureRoot(), ...parts);
}

function dirAt(rel: string): Directory {
  const parts = safeSegments(rel);
  return parts.length ? new Directory(ensureRoot(), ...parts) : ensureRoot();
}

export type ToolSpec = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

const strProp = (description: string) => ({ type: "string", description });

export const FILE_TOOLS: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "Показать содержимое папки в рабочей директории на устройстве.",
      parameters: {
        type: "object",
        properties: { path: strProp("Относительный путь папки. Пустая строка — корень.") },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "make_dir",
      description: "Создать папку (вместе с промежуточными) в рабочей директории.",
      parameters: {
        type: "object",
        properties: { path: strProp("Относительный путь новой папки, например notes/2026") },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Создать или перезаписать текстовый файл в рабочей директории.",
      parameters: {
        type: "object",
        properties: {
          path: strProp("Относительный путь файла, например notes/todo.md"),
          content: strProp("Полное содержимое файла"),
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Прочитать текстовый файл из рабочей директории.",
      parameters: {
        type: "object",
        properties: { path: strProp("Относительный путь файла") },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_path",
      description: "Удалить файл или папку в рабочей директории.",
      parameters: {
        type: "object",
        properties: { path: strProp("Относительный путь файла или папки") },
        required: ["path"],
      },
    },
  },
];

/** Human-readable one-liner for the chat transcript. */
export function toolLabel(name: string, args: Record<string, unknown>): string {
  const path = typeof args.path === "string" && args.path ? args.path : "/";
  switch (name) {
    case "list_dir":
      return `список файлов: ${path}`;
    case "make_dir":
      return `создана папка: ${path}`;
    case "write_file":
      return `записан файл: ${path}`;
    case "read_file":
      return `прочитан файл: ${path}`;
    case "delete_path":
      return `удалено: ${path}`;
    case "app_status":
      return "проверка настроек приложения";
    case "app_connect_cloud":
      return "подключение хранилища: " + (typeof args.cloud === "string" ? args.cloud : "");
    case "app_set_provider_key":
      return "сохранён ключ провайдера: " + (typeof args.provider === "string" ? args.provider : "");
    case "app_set_setting":
      return "настройка " + (typeof args.name === "string" ? args.name : "") + ": " + (args.value === true ? "вкл" : "выкл");
    case "app_use_model":
      return "выбрана модель: " + (typeof args.model === "string" ? args.model : "");
    case "web_search":
      return "поиск: " + (typeof args.query === "string" ? args.query : "");
    case "fetch_url":
      return "загружена страница: " + (typeof args.url === "string" ? args.url : "");
    case "disk_list":
      return "Диск, список: " + path;
    case "disk_make_dir":
      return "Диск, создана папка: " + path;
    case "disk_write_file":
      return "Диск, записан файл: " + path;
    case "disk_read_file":
      return "Диск, прочитан файл: " + path;
    case "download_url":
      return "Скачано: " + (typeof args.url === "string" ? args.url : path);
    case "save_to_device":
      return "Сохранено на устройство: " + path;
    default:
      return name;
  }
}


/* ---------------------------------------------------------------- web ---- */

export const WEB_TOOLS: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Поиск в интернете. Возвращает заголовки, ссылки и краткие описания.",
      parameters: {
        type: "object",
        properties: { query: strProp("Поисковый запрос") },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Загрузить страницу по URL и вернуть её текст.",
      parameters: {
        type: "object",
        properties: { url: strProp("Полный адрес, начиная с http:// или https://") },
        required: ["url"],
      },
    },
  },
];

const UA =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36";

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "\'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/(\s*\n\s*){2,}/g, "\n")
    .trim();
}

async function webSearch(query: string): Promise<string> {
  if (!query.trim()) return "Пустой запрос";
  const url = "https://duckduckgo.com/html/?q=" + encodeURIComponent(query);
  let res: Response;
  try {
    res = await expoFetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  } catch {
    return "Ошибка: нет доступа к сети";
  }
  if (!res.ok) return "Поиск вернул ошибку " + res.status;
  const html = await res.text();
  const out: string[] = [];
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 8) {
    let href = m[1];
    const enc = href.match(/uddg=([^&]+)/);
    if (enc) href = decodeURIComponent(enc[1]);
    const title = stripHtml(m[2]);
    if (title) out.push(out.length + 1 + ". " + title + "\n   " + href);
  }
  return out.length ? out.join("\n") : "Ничего не найдено";
}

async function fetchUrl(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) return "Ошибка: адрес должен начинаться с http:// или https://";
  let res: Response;
  try {
    res = await expoFetch(url, { headers: { "User-Agent": UA } });
  } catch {
    return "Ошибка: не удалось загрузить страницу";
  }
  if (!res.ok) return "Страница ответила " + res.status;
  const body = await res.text();
  const text = /<html|<body/i.test(body) ? stripHtml(body) : body;
  return text.length > 12000 ? text.slice(0, 12000) + "\n…обрезано" : text;
}

/* ----------------------------------------------------------- download ---- */

/**
 * Getting a file onto the phone proper. Android hands out no write access to
 * Downloads, so `save_to_device` opens the system folder picker and copies into
 * whatever the user chooses.
 */
export const DOWNLOAD_TOOLS: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "download_url",
      description:
        "Скачать файл по ссылке в рабочую папку приложения. Возвращает относительный путь, который потом можно передать в save_to_device.",
      parameters: {
        type: "object",
        properties: {
          url: strProp("Прямая ссылка на файл, начиная с http:// или https://"),
          path: strProp("Куда сохранить внутри рабочей папки, например downloads/report.pdf"),
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_to_device",
      description:
        "Сохранить файл из рабочей папки в память устройства. Пользователь сам выберет папку (например Загрузки) в системном окне.",
      parameters: {
        type: "object",
        properties: {
          path: strProp("Относительный путь файла в рабочей папке"),
          name: strProp("Имя, под которым сохранить (необязательно)"),
        },
        required: ["path"],
      },
    },
  },
];

/* --------------------------------------------------------------- disk ---- */

export const DISK_TOOLS: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "disk_list",
      description: "Показать содержимое папки в рабочей папке на Яндекс Диске.",
      parameters: { type: "object", properties: { path: strProp("Относительный путь, пусто — корень"), cloud: strProp("yandex, gdrive или dropbox") }, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "disk_make_dir",
      description: "Создать папку на Яндекс Диске внутри рабочей папки.",
      parameters: { type: "object", properties: { path: strProp("Относительный путь папки") }, required: ["path"] },
    },
  },
  {
    type: "function",
    function: {
      name: "disk_write_file",
      description: "Сохранить текстовый файл на Яндекс Диск в рабочую папку.",
      parameters: {
        type: "object",
        properties: { path: strProp("Относительный путь файла"), content: strProp("Содержимое файла") },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "disk_read_file",
      description: "Прочитать текстовый файл с Яндекс Диска из рабочей папки.",
      parameters: { type: "object", properties: { path: strProp("Относительный путь файла") }, required: ["path"] },
    },
  },
];

export type ToolContext = {
  yandexToken?: string;
  yandexRoot?: string;
  /** Access tokens and workspace roots for every attached cloud. */
  cloudTokens?: Record<string, string>;
  cloudRoots?: Record<string, string>;
  /** Storage the user picked for this work: "" for the device, else a cloud id. */
  preferredCloud?: string;
  /** Lets the model change the app's own configuration. */
  app?: AppControl;
};

export async function runTool(name: string, rawArgs: string, ctx: ToolContext = {}): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    return "Ошибка: аргументы не разобрались как JSON";
  }
  const path = typeof args.path === "string" ? args.path : "";
  if (isAppTool(name)) return await runAppTool(name, args, ctx.app);

  try {
    switch (name) {
      case "list_dir": {
        const dir = dirAt(path);
        if (!dir.exists) return `Папки нет: ${path || "/"}`;
        const items = dir.list();
        if (!items.length) return `Пусто: ${path || "/"}`;
        return items
          .map((it) => {
            const isDir = it instanceof Directory;
            const nm = it.uri.replace(/\/$/, "").split("/").pop() || "";
            return isDir ? `${nm}/` : nm;
          })
          .join("\n");
      }
      case "download_url": {
        const url = typeof args.url === "string" ? args.url : "";
        if (!/^https?:\/\//.test(url)) return "Ошибка: нужна ссылка http:// или https://";
        const rel = path || "downloads/" + (decodeURIComponent(url.split("?")[0].split("/").pop() || "file") || "file");
        const dest = fileAt(rel);
        const dir = dest.parentDirectory;
        if (!dir.exists) dir.create({ intermediates: true });
        await File.downloadFileAsync(url, dest, { idempotent: true } as never);
        return `Скачано в ${rel} (${dest.size} байт)`;
      }
      case "save_to_device": {
        const file = fileAt(path);
        if (!file.exists) return `Файла нет: ${path}`;
        const name = typeof args.name === "string" && args.name ? args.name : undefined;
        const res = await exportToDevice(file, name);
        return res.saved ? `Сохранено на устройство: ${name || file.name}` : `Не сохранено: ${res.reason}`;
      }
      case "make_dir": {
        const dir = dirAt(path);
        if (dir.exists) return `Уже существует: ${path}`;
        dir.create({ intermediates: true });
        return `Папка создана: ${path}`;
      }
      case "write_file": {
        const content = typeof args.content === "string" ? args.content : "";
        const file = fileAt(path);
        if (!file.exists) file.create({ intermediates: true, overwrite: true });
        file.write(content);
        return `Файл записан: ${path} (${content.length} символов)`;
      }
      case "read_file": {
        const file = fileAt(path);
        if (!file.exists) return `Файла нет: ${path}`;
        const text = await file.text();
        return text.length > 8000 ? text.slice(0, 8000) + "\n…обрезано" : text;
      }
      case "delete_path": {
        const dir = dirAt(path);
        if (dir.exists) {
          dir.delete();
          return `Папка удалена: ${path}`;
        }
        const file = fileAt(path);
        if (!file.exists) return `Ничего нет по пути: ${path}`;
        file.delete();
        return `Файл удалён: ${path}`;
      }
      case "web_search":
        return await webSearch(typeof args.query === "string" ? args.query : "");
      case "fetch_url":
        return await fetchUrl(typeof args.url === "string" ? args.url : "");

      case "disk_list":
      case "disk_make_dir":
      case "disk_write_file":
      case "disk_read_file": {
        const tokens = ctx.cloudTokens || {};
        const asked = typeof args.cloud === "string" ? (args.cloud as CloudId) : undefined;
        const preferred = ctx.preferredCloud && tokens[ctx.preferredCloud] ? (ctx.preferredCloud as CloudId) : undefined;
        const cloud = (asked && tokens[asked] ? asked : preferred || (Object.keys(tokens)[0] as CloudId)) || undefined;
        if (!cloud) return "Ни одно облако не подключено. Подключите его в Настройках → Серверы.";
        const token = tokens[cloud];
        const root = (ctx.cloudRoots || {})[cloud];
        if (name === "disk_list") return (await Clouds.listFolder(cloud, token, path, root)).join("\n") || "Пусто";
        if (name === "disk_make_dir") {
          await Clouds.makeFolder(cloud, token, path, root);
          return "Папка создана в " + Clouds.cloudName(cloud) + ": " + path;
        }
        if (name === "disk_read_file") return await Clouds.downloadText(cloud, token, path, root);
        const content = typeof args.content === "string" ? args.content : "";
        await Clouds.uploadText(cloud, token, path, content, root);
        return "Файл сохранён в " + Clouds.cloudName(cloud) + ": " + path;
      }

      default:
        return `Неизвестный инструмент: ${name}`;
    }
  } catch (e) {
    return "Ошибка: " + (e instanceof Error ? e.message : String(e));
  }
}
