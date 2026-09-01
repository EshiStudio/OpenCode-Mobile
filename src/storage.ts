import AsyncStorage from "@react-native-async-storage/async-storage";
import { Lang } from "./i18n";
import * as SecureStore from "expo-secure-store";
import { Connection } from "./api";
import { Project, SessionInfo, StoredMessage } from "./types";

const K_HOST = "ocm.host";
const K_USER = "ocm.user";
const K_PASS = "ocm.pass";
const K_SAVED = "ocm.saved";
const K_THEME = "ocm.theme";

export type SavedConn = {
  host: string;
  username: string;
  hasPassword: boolean;
};

export async function loadConnection(): Promise<Connection | null> {
  try {
    const saved = await AsyncStorage.getItem(K_SAVED);
    if (!saved) return null;
    const conn = JSON.parse(saved);
    const password = await SecureStore.getItemAsync(K_PASS);
    if (!password) return null;
    return {
      host: conn.host,
      username: conn.username,
      password,
    };
  } catch {
    return null;
  }
}

export async function saveConnection(conn: Connection): Promise<void> {
  await AsyncStorage.setItem(K_SAVED, JSON.stringify({ host: conn.host, username: conn.username }));
  await SecureStore.setItemAsync(K_PASS, conn.password);
}

export async function loadSaved(): Promise<SavedConn | null> {
  const saved = await AsyncStorage.getItem(K_SAVED);
  if (!saved) return null;
  return JSON.parse(saved);
}

export async function clearConnection(): Promise<void> {
  await AsyncStorage.removeItem(K_SAVED);
  await SecureStore.deleteItemAsync(K_PASS);
}

export async function loadTheme(): Promise<"light" | "dark" | null> {
  const t = await AsyncStorage.getItem(K_THEME);
  return t === "dark" ? "dark" : t === "light" ? "light" : null;
}

export async function saveTheme(t: "light" | "dark"): Promise<void> {
  await AsyncStorage.setItem(K_THEME, t);
}

const K_LANG = "ocm.lang";

/** The interface language. Null means the user never chose one. */
export async function loadLang(): Promise<Lang | null> {
  const v = await AsyncStorage.getItem(K_LANG);
  return v === "ru" ? "ru" : v === "en" ? "en" : null;
}

export async function saveLang(l: Lang): Promise<void> {
  await AsyncStorage.setItem(K_LANG, l);
}

const K_CRASH = "ocm.crash";

export type CrashReport = {
  message: string;
  stack: string;
  when: number;
  fatal: boolean;
};

export async function saveCrash(report: CrashReport): Promise<void> {
  try {
    await AsyncStorage.setItem(K_CRASH, JSON.stringify(report));
  } catch {
    // ignore
  }
}

export async function loadCrash(): Promise<CrashReport | null> {
  try {
    const raw = await AsyncStorage.getItem(K_CRASH);
    return raw ? (JSON.parse(raw) as CrashReport) : null;
  } catch {
    return null;
  }
}

export async function clearCrash(): Promise<void> {
  await AsyncStorage.removeItem(K_CRASH);
}

const K_WATCH = "ocm.watch-task";

/**
 * The session a background task should poll for while the app is backgrounded,
 * so a completion notification can fire without the phone being open. Only
 * the connected server case applies — on-device work runs in this process, so
 * there is nothing left running once the app is backgrounded.
 */
export type WatchTask = { sessionID: string; directory?: string; title: string };

export async function loadWatchTask(): Promise<WatchTask | null> {
  try {
    const raw = await AsyncStorage.getItem(K_WATCH);
    return raw ? (JSON.parse(raw) as WatchTask) : null;
  } catch {
    return null;
  }
}

export async function saveWatchTask(task: WatchTask): Promise<void> {
  try {
    await AsyncStorage.setItem(K_WATCH, JSON.stringify(task));
  } catch {
    // best-effort
  }
}

export async function clearWatchTask(): Promise<void> {
  try {
    await AsyncStorage.removeItem(K_WATCH);
  } catch {
    // best-effort
  }
}

const K_SRV_CACHE = "ocm.server-cache";

/**
 * The last-synced view of a connected server: session list, projects, and the
 * messages of whichever session was open. Read on a cold start before the
 * server has answered, so a relaunch offline still shows something instead
 * of a blank chat; overwritten with fresh data as soon as it's reachable
 * again. Only the open session's messages are kept, not the whole history,
 * to keep this small.
 */
export type ServerCache = {
  sessions: SessionInfo[];
  projects: Project[];
  activeId: string | null;
  messages: Record<string, StoredMessage[]>;
};

export async function loadServerCache(): Promise<ServerCache | null> {
  try {
    const raw = await AsyncStorage.getItem(K_SRV_CACHE);
    return raw ? (JSON.parse(raw) as ServerCache) : null;
  } catch {
    return null;
  }
}

export async function saveServerCache(c: ServerCache): Promise<void> {
  try {
    await AsyncStorage.setItem(K_SRV_CACHE, JSON.stringify(c));
  } catch {
    // best-effort — a full disk or oversized payload just means no offline cache this time
  }
}

const K_REG = "ocm.registered";

export async function loadRegistered(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(K_REG);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export async function saveRegistered(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(K_REG, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

const K_SETTINGS = "ocm.settings";

export type AppSettings = {
  autoAllowPermissions: boolean;
  showReasoning: boolean;
  expandShell: boolean;
  expandEdit: boolean;
  localWork: boolean;
  keepAwake: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  autoAllowPermissions: false,
  showReasoning: true,
  expandShell: false,
  expandEdit: false,
  localWork: false,
  keepAwake: true,
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(K_SETTINGS);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(s: AppSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(K_SETTINGS, JSON.stringify(s));
  } catch {
    // ignore
  }
}

const K_PRESETS = "ocm.presets";

export type ProviderPreset = {
  id: string;
  baseURL: string;
  model: string;
  name?: string;
  label?: string;
  /** One-line pitch shown in the "popular providers" list. */
  desc?: string;
};

export async function loadPresets(): Promise<ProviderPreset[]> {
  try {
    const raw = await AsyncStorage.getItem(K_PRESETS);
    return raw ? (JSON.parse(raw) as ProviderPreset[]) : [];
  } catch {
    return [];
  }
}

export async function deleteKey(providerID: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync("ocm.key." + providerID);
  } catch {
    // ignore
  }
}

export async function savePresets(p: ProviderPreset[]): Promise<void> {
  try {
    await AsyncStorage.setItem(K_PRESETS, JSON.stringify(p));
  } catch {
    // ignore
  }
}

export async function loadKey(providerID: string): Promise<string> {
  try {
    return (await SecureStore.getItemAsync("ocm.key." + providerID)) || "";
  } catch {
    return "";
  }
}

export async function saveKey(providerID: string, key: string): Promise<void> {
  try {
    if (key) await SecureStore.setItemAsync("ocm.key." + providerID, key);
    else await SecureStore.deleteItemAsync("ocm.key." + providerID);
  } catch {
    // ignore
  }
}

const K_YD = "ocm.yandex";

export async function loadYandexToken(): Promise<string> {
  try {
    return (await SecureStore.getItemAsync(K_YD)) || "";
  } catch {
    return "";
  }
}

export async function saveYandexToken(token: string): Promise<void> {
  try {
    if (token) await SecureStore.setItemAsync(K_YD, token);
    else await SecureStore.deleteItemAsync(K_YD);
  } catch {
    // ignore
  }
}

/** One SecureStore entry per cloud, plus the workspace root it settled on. */
export async function loadCloudToken(id: string): Promise<string> {
  try {
    return (await SecureStore.getItemAsync("ocm.cloud." + id)) || "";
  } catch {
    return "";
  }
}

export async function saveCloudToken(id: string, token: string): Promise<void> {
  try {
    if (token) await SecureStore.setItemAsync("ocm.cloud." + id, token);
    else await SecureStore.deleteItemAsync("ocm.cloud." + id);
  } catch {
    // ignore
  }
}

export async function loadCloudRoots(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem("ocm.cloud-roots");
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export async function saveCloudRoots(v: Record<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem("ocm.cloud-roots", JSON.stringify(v));
  } catch {
    // ignore
  }
}

export type OAuthRecord = { access: string; refresh: string; expires: number };

/** Refresh tokens live in SecureStore; client ids are not secret. */
export async function loadOAuth(id: string): Promise<OAuthRecord | null> {
  try {
    const raw = await SecureStore.getItemAsync("ocm.oauth." + id);
    return raw ? (JSON.parse(raw) as OAuthRecord) : null;
  } catch {
    return null;
  }
}

export async function saveOAuth(id: string, rec: OAuthRecord | null): Promise<void> {
  try {
    if (rec) await SecureStore.setItemAsync("ocm.oauth." + id, JSON.stringify(rec));
    else await SecureStore.deleteItemAsync("ocm.oauth." + id);
  } catch {
    // ignore
  }
}

export async function loadClientIds(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem("ocm.client-ids");
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export async function saveClientIds(v: Record<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem("ocm.client-ids", JSON.stringify(v));
  } catch {
    // ignore
  }
}

const K_YD_ROOT = "ocm.yandex-root";

/** Workspace root on Yandex Disk: disk:/opencode or app:/opencode. */
export async function loadYandexRoot(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(K_YD_ROOT)) || "";
  } catch {
    return "";
  }
}

export async function saveYandexRoot(v: string): Promise<void> {
  try {
    await AsyncStorage.setItem(K_YD_ROOT, v);
  } catch {
    // ignore
  }
}

const K_REPO = "ocm.update-repo";

/** GitHub repo (owner/name) checked for new releases. */
export async function loadUpdateRepo(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(K_REPO)) || "";
  } catch {
    return "";
  }
}

export async function saveUpdateRepo(v: string): Promise<void> {
  try {
    await AsyncStorage.setItem(K_REPO, v);
  } catch {
    // ignore
  }
}

const K_PMODELS = "ocm.provider-models";

/** Model ids fetched from each provider's /models endpoint, keyed by provider id. */
export async function loadProviderModels(): Promise<Record<string, string[]>> {
  try {
    const raw = await AsyncStorage.getItem(K_PMODELS);
    return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

export async function saveProviderModels(m: Record<string, string[]>): Promise<void> {
  try {
    await AsyncStorage.setItem(K_PMODELS, JSON.stringify(m));
  } catch {
    // ignore
  }
}

const K_LOCAL = "ocm.local";

/**
 * An attachment kept with the message it was sent in. The picker's copy lives
 * in the cache, which the OS is free to clear, so anything that has to survive
 * in the history is copied into documents first.
 */
export type LocalAttachment = {
  kind: "image" | "file";
  name: string;
  /** file:// location of our own copy. */
  uri: string;
  mime?: string;
};

export type LocalSessionMsg = {
  role: "user" | "assistant";
  content: string;
  files?: LocalAttachment[];
};

/**
 * A workspace: a real folder, on the device or in a connected cloud, that a
 * group of sessions belongs to. opencode organises work by project directory;
 * picking a directory on a phone is awkward, so a project here is created by
 * name and the folder is made for it.
 */
export type LocalProject = {
  id: string;
  /** Folder name, and what the project is called in the UI. */
  name: string;
  /** "" for the device, otherwise the cloud id holding the folder. */
  cloud: string;
  /** Where the folder ended up, for display and for the tools to write into. */
  path: string;
  when: number;
};

export type LocalState = {
  sessions: Array<{ id: string; title: string; when: number; projectID?: string }>;
  messages: Record<string, LocalSessionMsg[]>;
  projects: LocalProject[];
  /** Project the sessions list is scoped to; "" means every session. */
  activeProject: string;
  presetID: string;
  model: string;
  /** Model chosen per provider, so switching providers restores the right one. */
  modelByPreset: Record<string, string>;
};

export const DEFAULT_LOCAL: LocalState = {
  sessions: [],
  messages: {},
  projects: [],
  activeProject: "",
  presetID: "deepseek",
  model: "deepseek-chat",
  modelByPreset: {},
};

export async function loadLocal(): Promise<LocalState> {
  try {
    const raw = await AsyncStorage.getItem(K_LOCAL);
    return raw ? { ...DEFAULT_LOCAL, ...(JSON.parse(raw) as Partial<LocalState>) } : { ...DEFAULT_LOCAL };
  } catch {
    return { ...DEFAULT_LOCAL };
  }
}

export async function saveLocal(s: LocalState): Promise<void> {
  try {
    await AsyncStorage.setItem(K_LOCAL, JSON.stringify(s));
  } catch {
    // ignore
  }
}
