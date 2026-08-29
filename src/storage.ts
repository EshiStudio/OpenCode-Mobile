import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Connection } from "./api";

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
};

export const DEFAULT_SETTINGS: AppSettings = {
  autoAllowPermissions: false,
  showReasoning: true,
  expandShell: false,
  expandEdit: false,
  localWork: false,
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
};

export async function loadPresets(): Promise<ProviderPreset[]> {
  try {
    const raw = await AsyncStorage.getItem(K_PRESETS);
    return raw ? (JSON.parse(raw) as ProviderPreset[]) : [];
  } catch {
    return [];
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

const K_LOCAL = "ocm.local";

export type LocalSessionMsg = { role: "user" | "assistant"; content: string };

export type LocalState = {
  sessions: Array<{ id: string; title: string; when: number }>;
  messages: Record<string, LocalSessionMsg[]>;
  presetID: string;
  model: string;
};

export const DEFAULT_LOCAL: LocalState = { sessions: [], messages: {}, presetID: "deepseek", model: "deepseek-chat" };

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
