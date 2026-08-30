import { Directory, File, Paths } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import { AppControl, isAppTool, runAppTool } from "./app-tools";
import * as Clouds from "./clouds";
import { t } from "./i18n";
import { exportToDevice } from "./media";
import { CloudId } from "./clouds";

/**
 * File tools the model can call when local work is on.
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
  if (parts.some((p) => p === "..")) throw new Error(t("tool.err.dotdot"));
  if (/^[a-zA-Z]:/.test(rel) || rel.startsWith("/")) throw new Error(t("tool.err.relative"));
  return parts;
}

function fileAt(rel: string): File {
  const parts = safeSegments(rel);
  if (!parts.length) throw new Error(t("tool.err.noName"));
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

/** Rebuilt per call so the descriptions follow the interface language. */
export function fileTools(): ToolSpec[] {
  return [
  {
    type: "function",
    function: {
      name: "list_dir",
      description: t("tool.listDir.desc"),
      parameters: {
        type: "object",
        properties: { path: strProp(t("tool.listDir.path")) },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "make_dir",
      description: t("tool.makeDir.desc"),
      parameters: {
        type: "object",
        properties: { path: strProp(t("tool.makeDir.path")) },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: t("tool.writeFile.desc"),
      parameters: {
        type: "object",
        properties: {
          path: strProp(t("tool.writeFile.path")),
          content: strProp(t("tool.writeFile.content")),
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: t("tool.readFile.desc"),
      parameters: {
        type: "object",
        properties: { path: strProp(t("tool.readFile.path")) },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_path",
      description: t("tool.deletePath.desc"),
      parameters: {
        type: "object",
        properties: { path: strProp(t("tool.deletePath.path")) },
        required: ["path"],
      },
    },
  },
  ];
}

/** Human-readable one-liner for the chat transcript. */
export function toolLabel(name: string, args: Record<string, unknown>): string {
  const path = typeof args.path === "string" && args.path ? args.path : "/";
  switch (name) {
    case "list_dir":
      return t("tool.label.listDir", { path });
    case "make_dir":
      return t("tool.label.makeDir", { path });
    case "write_file":
      return t("tool.label.writeFile", { path });
    case "read_file":
      return t("tool.label.readFile", { path });
    case "delete_path":
      return t("tool.label.delete", { path });
    case "app_status":
      return t("tool.label.appStatus");
    case "app_connect_cloud":
      return t("tool.label.connectCloud", { name: typeof args.cloud === "string" ? args.cloud : "" });
    case "app_set_provider_key":
      return t("tool.label.providerKey", { name: typeof args.provider === "string" ? args.provider : "" });
    case "app_set_setting":
      return t("tool.label.setting", {
        name: typeof args.name === "string" ? args.name : "",
        value: args.value === true ? t("common.on") : t("common.off"),
      });
    case "app_use_model":
      return t("tool.label.useModel", { name: typeof args.model === "string" ? args.model : "" });
    case "web_search":
      return t("tool.label.search", { query: typeof args.query === "string" ? args.query : "" });
    case "fetch_url":
      return t("tool.label.fetch", { url: typeof args.url === "string" ? args.url : "" });
    case "disk_list":
      return t("tool.label.diskList", { path });
    case "disk_make_dir":
      return t("tool.label.diskMakeDir", { path });
    case "disk_write_file":
      return t("tool.label.diskWrite", { path });
    case "disk_read_file":
      return t("tool.label.diskRead", { path });
    case "disk_delete":
      return t("tool.label.diskDelete", { path });
    case "download_url":
      return t("tool.label.download", { url: typeof args.url === "string" ? args.url : path });
    case "save_to_device":
      return t("tool.label.saveToDevice", { path });
    default:
      return name;
  }
}


/* ---------------------------------------------------------------- web ---- */

export function webTools(): ToolSpec[] {
  return [
  {
    type: "function",
    function: {
      name: "web_search",
      description: t("tool.search.desc"),
      parameters: {
        type: "object",
        properties: { query: strProp(t("tool.search.query")) },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: t("tool.fetch.desc"),
      parameters: {
        type: "object",
        properties: { url: strProp(t("tool.fetch.url")) },
        required: ["url"],
      },
    },
  },
  ];
}

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
  if (!query.trim()) return t("tool.out.emptyQuery");
  const url = "https://duckduckgo.com/html/?q=" + encodeURIComponent(query);
  let res: Response;
  try {
    res = await expoFetch(url, { headers: { "User-Agent": UA, Accept: "text/html" } });
  } catch {
    return t("tool.err.noNetwork");
  }
  if (!res.ok) return t("tool.out.searchFailed", { status: res.status });
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
  return out.length ? out.join("\n") : t("common.nothingFound");
}

async function fetchUrl(url: string): Promise<string> {
  if (!/^https?:\/\//i.test(url)) return t("tool.err.needHttp");
  let res: Response;
  try {
    res = await expoFetch(url, { headers: { "User-Agent": UA } });
  } catch {
    return t("tool.err.pageFailed");
  }
  if (!res.ok) return t("tool.out.pageStatus", { status: res.status });
  const body = await res.text();
  const text = /<html|<body/i.test(body) ? stripHtml(body) : body;
  return text.length > 12000 ? text.slice(0, 12000) + "\n" + t("common.truncated") : text;
}

/* ----------------------------------------------------------- download ---- */

/**
 * Getting a file onto the phone proper. Android hands out no write access to
 * Downloads, so `save_to_device` opens the system folder picker and copies into
 * whatever the user chooses.
 */
export function downloadTools(): ToolSpec[] {
  return [
  {
    type: "function",
    function: {
      name: "download_url",
      description:
        t("tool.download.desc"),
      parameters: {
        type: "object",
        properties: {
          url: strProp(t("tool.download.url")),
          path: strProp(t("tool.download.path")),
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
        t("tool.saveToDevice.desc"),
      parameters: {
        type: "object",
        properties: {
          path: strProp(t("tool.saveToDevice.path")),
          name: strProp(t("tool.saveToDevice.name")),
        },
        required: ["path"],
      },
    },
  },
  ];
}

/* --------------------------------------------------------------- disk ---- */

export function diskTools(): ToolSpec[] {
  return [
  {
    type: "function",
    function: {
      name: "disk_list",
      description: t("tool.diskList.desc"),
      parameters: { type: "object", properties: { path: strProp(t("tool.diskList.path")), cloud: strProp(t("tool.diskList.cloud")) }, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "disk_make_dir",
      description: t("tool.diskMakeDir.desc"),
      parameters: { type: "object", properties: { path: strProp(t("tool.diskMakeDir.path")) }, required: ["path"] },
    },
  },
  {
    type: "function",
    function: {
      name: "disk_write_file",
      description: t("tool.diskWrite.desc"),
      parameters: {
        type: "object",
        properties: { path: strProp(t("tool.readFile.path")), content: strProp(t("tool.diskWrite.content")) },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "disk_read_file",
      description: t("tool.diskRead.desc"),
      parameters: { type: "object", properties: { path: strProp(t("tool.readFile.path")) }, required: ["path"] },
    },
  },
  {
    type: "function",
    function: {
      name: "disk_delete",
      description: t("tool.diskDelete.desc"),
      parameters: { type: "object", properties: { path: strProp(t("tool.diskDelete.path")) }, required: ["path"] },
    },
  },
  ];
}

/**
 * Resolves a tool path inside the active project's folder.
 *
 * The project used to be a label: the state note told the model where it was
 * working while the tools still counted from the storage root. So `""` listed
 * the root, the model got back folders it had never heard of, and lost track of
 * where it was. Paths are now relative to the project folder.
 *
 * A path that already carries the project prefix is left alone. The model has
 * no way to know which convention is in force, and it guesses both ways from
 * one turn to the next — prepending blindly would turn its correct guess into
 * `opencode-projects/LM/opencode-projects/LM/notes.txt`.
 */
export function within(base: string, rel: string): string {
  const p = String(rel || "").replace(/^\/+/, "");
  if (!base) return p;
  if (p === base || p.startsWith(base + "/")) return p;
  return p ? base + "/" + p : base;
}

export type ToolContext = {
  /**
   * Access tokens and workspace roots for every attached cloud, the legacy
   * Yandex Disk field included — the caller folds it in, so there is nothing
   * here that knows Yandex used to be special.
   */
  cloudTokens?: Record<string, string>;
  cloudRoots?: Record<string, string>;
  /** Storage the user picked for this work: "" for the device, else a cloud id. */
  preferredCloud?: string;
  /** Active project's folder, and where it lives: "" for the device, else a cloud id. */
  projectPath?: string;
  projectCloud?: string;
  /** Lets the model change the app's own configuration. */
  app?: AppControl;
};

export async function runTool(name: string, rawArgs: string, ctx: ToolContext = {}): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    return t("tool.err.badJson");
  }
  const askedPath = typeof args.path === "string" ? args.path : "";
  if (isAppTool(name)) return await runAppTool(name, args, ctx.app);

  // On-device tools work inside the project folder when the project lives on the
  // device; a project held in a cloud leaves them at the app's own root.
  const path = within(ctx.projectPath && ctx.projectCloud === "" ? ctx.projectPath : "", askedPath);

  try {
    switch (name) {
      case "list_dir": {
        const dir = dirAt(path);
        if (!dir.exists) return t("tool.out.noFolder", { path: path || "/" });
        const items = dir.list();
        if (!items.length) return t("tool.out.empty", { path: path || "/" });
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
        if (!/^https?:\/\//.test(url)) return t("tool.err.needLink");
        const rel = path || "downloads/" + (decodeURIComponent(url.split("?")[0].split("/").pop() || "file") || "file");
        const dest = fileAt(rel);
        const dir = dest.parentDirectory;
        if (!dir.exists) dir.create({ intermediates: true });
        await File.downloadFileAsync(url, dest, { idempotent: true } as never);
        return t("tool.out.downloaded", { path: rel, n: dest.size });
      }
      case "save_to_device": {
        const file = fileAt(path);
        if (!file.exists) return t("tool.out.noFile", { path });
        const name = typeof args.name === "string" && args.name ? args.name : undefined;
        const res = await exportToDevice(file, name);
        return res.saved
          ? t("tool.out.savedToDevice", { name: name || file.name })
          : t("tool.out.notSaved", { reason: String(res.reason) });
      }
      case "make_dir": {
        const dir = dirAt(path);
        if (dir.exists) return t("tool.out.exists", { path });
        dir.create({ intermediates: true });
        return t("tool.out.folderCreated", { path });
      }
      case "write_file": {
        const content = typeof args.content === "string" ? args.content : "";
        const file = fileAt(path);
        if (!file.exists) file.create({ intermediates: true, overwrite: true });
        file.write(content);
        return t("tool.out.fileWritten", { path, n: content.length });
      }
      case "read_file": {
        const file = fileAt(path);
        if (!file.exists) return t("tool.out.noFile", { path });
        const text = await file.text();
        return text.length > 8000 ? text.slice(0, 8000) + "\n" + t("common.truncated") : text;
      }
      case "delete_path": {
        const dir = dirAt(path);
        if (dir.exists) {
          dir.delete();
          return t("tool.out.folderDeleted", { path });
        }
        const file = fileAt(path);
        if (!file.exists) return t("tool.out.nothingAt", { path });
        file.delete();
        return t("tool.out.fileDeleted", { path });
      }
      case "web_search":
        return await webSearch(typeof args.query === "string" ? args.query : "");
      case "fetch_url":
        return await fetchUrl(typeof args.url === "string" ? args.url : "");

      case "disk_list":
      case "disk_make_dir":
      case "disk_write_file":
      case "disk_read_file":
      case "disk_delete": {
        const tokens = ctx.cloudTokens || {};
        const asked = typeof args.cloud === "string" ? (args.cloud as CloudId) : undefined;
        const preferred = ctx.preferredCloud && tokens[ctx.preferredCloud] ? (ctx.preferredCloud as CloudId) : undefined;
        const cloud = (asked && tokens[asked] ? asked : preferred || (Object.keys(tokens)[0] as CloudId)) || undefined;
        if (!cloud) return t("tool.out.noCloud");
        const token = tokens[cloud];
        const root = (ctx.cloudRoots || {})[cloud];
        // Only when the project actually lives in the cloud being addressed:
        // `cloud` may be another one the model named explicitly.
        const at = within(ctx.projectCloud === cloud ? ctx.projectPath || "" : "", askedPath);
        if (name === "disk_list") return (await Clouds.listFolder(cloud, token, at, root)).join("\n") || t("tool.out.emptyShort");
        if (name === "disk_make_dir") {
          await Clouds.makeFolder(cloud, token, at, root);
          return t("tool.out.cloudFolder", { cloud: Clouds.cloudName(cloud), path: at });
        }
        if (name === "disk_read_file") return await Clouds.downloadText(cloud, token, at, root);
        if (name === "disk_delete") {
          await Clouds.deletePath(cloud, token, at, root);
          return t("tool.out.cloudDeleted", { cloud: Clouds.cloudName(cloud), path: at });
        }
        const content = typeof args.content === "string" ? args.content : "";
        await Clouds.uploadText(cloud, token, at, content, root);
        return t("tool.out.cloudFile", { cloud: Clouds.cloudName(cloud), path: at });
      }

      default:
        return t("tool.err.unknown", { name });
    }
  } catch (e) {
    return t("tool.err.generic", { detail: e instanceof Error ? e.message : String(e) });
  }
}
