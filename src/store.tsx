import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { Api, ApiError, Connection } from "./api";
import {
  AppSettings,
  DEFAULT_LOCAL,
  DEFAULT_SETTINGS,
  loadKey,
  loadLocal,
  loadPresets,
  loadProviderModels,
  loadUpdateRepo,
  loadYandexRoot,
  loadCloudToken,
  loadCloudRoots,
  loadOAuth,
  loadClientIds,
  OAuthRecord,
  loadRegistered,
  loadSettings,
  loadYandexToken,
  LocalSessionMsg,
  LocalAttachment,
  LocalState,
  ProviderPreset,
  deleteKey,
  saveKey,
  saveLocal,
  savePresets,
  saveProviderModels,
  saveUpdateRepo,
  saveYandexRoot,
  saveCloudToken,
  saveCloudRoots,
  saveOAuth,
  saveClientIds,
  saveRegistered,
  saveSettings,
  saveYandexToken,
  saveWatchTask,
  clearWatchTask,
  loadServerCache,
  saveServerCache,
} from "./storage";
import { diskTools, downloadTools, fileTools, webTools, runTool, toolLabel } from "./tools";
import { appTools, AppControl } from "./app-tools";
import { t } from "./i18n";
import { extractToken } from "./yandex";
import {
  CloudId,
  CLOUD_IDS,
  cloudName,
  connect as cloudConnect,
  makeFolder as cloudMakeFolder,
  listFolder as cloudListFolder,
  downloadText as cloudDownloadText,
} from "./clouds";
import { isTextual } from "./media";
import { Directory, File, Paths } from "expo-file-system";
import { keepForHistory } from "./media";
import { OAuthCloud, refresh as oauthRefresh, signIn, stale } from "./oauth";
import { APP_VERSION_LABEL, checkForUpdate, Release } from "./update";
import { presetName } from "./local-ai";
import {
  streamChat,
  systemPrompt,
  capabilityNote,
  LocalAIError,
  allPresets,
  findPreset,
  listModels,
  BUILTIN_IDS,
  LocalMsg,
} from "./local-ai";
import {
  EFFORT_NAMES,
  EffortVariant,
  MsgInfo,
  PermissionRequest,
  Part,
  Project,
  ProviderWithModels,
  ServerEvent,
  SessionInfo,
  SessionStatus,
  StoredMessage,
} from "./types";

export type Attachment = {
  kind: "link" | "file" | "image";
  name: string;
  /** Inline content sent with the prompt: link text, or the head of a text file. */
  text?: string;
  url?: string;
  /** Path inside the workspace, when the file came from the project tree. */
  path?: string;
  /** file:// location on the device, when the file came from a picker. */
  uri?: string;
  mime?: string;
  size?: number;
};

export type StoreState = {
  connected: boolean;
  connecting: boolean;
  error: string | null;
  serverVersion?: string;
  sessions: SessionInfo[];
  statuses: Record<string, SessionStatus>;
  activeId: string | null;
  messages: Record<string, StoredMessage[]>;
  models: ProviderWithModels[];
  projects: Project[];
  /** Server project the sessions list is scoped to; "" means every session. */
  activeServerProject: string;
  setActiveServerProject: (id: string) => void;
  modelId: string | null;
  providerId: string | null;
  variants: EffortVariant[];
  variant: EffortVariant;
  permissions: PermissionRequest[];
  busy: boolean;
  attachments: Attachment[];
  addAttachments: (list: Attachment[]) => void;
  removeAttachment: (index: number) => void;
  clearAttachments: () => void;
  findFiles: (q: string) => Promise<string[]>;
  /** Reads a file from the connected server's project directory, for tapping a file path in a message. */
  readFile: (path: string, directory?: string) => Promise<{ type: "text" | "binary"; content: string; mimeType?: string } | null>;
  registered: string[];
  onlyWeb: boolean;
  setOnlyWeb: (b: boolean) => void;
  registerSession: (id: string) => void;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  isLocal: boolean;
  /**
   * There's an actual connected-server session to fall back to while
   * offline: currently connected, or cached sessions from a prior
   * connection. A saved server address that has never actually connected
   * (or a fresh account with no sessions yet) does NOT count — those installs
   * should keep behaving exactly like local-only ones, not go blank.
   */
  hasServer: boolean;
  local: LocalState;
  /** User-added providers only, as persisted. */
  presets: ProviderPreset[];
  /** Built-in providers merged with the user-added ones — what the UI should list. */
  providers: ProviderPreset[];
  keys: Record<string, string>;
  /** Model ids each provider reported, keyed by provider id. */
  providerModels: Record<string, string[]>;
  /** Ask a provider for its model list and cache the answer. */
  fetchProviderModels: (id: string) => Promise<string[]>;
  yandexToken: string;
  /** GitHub repo watched for releases, and the newest one when it is ahead. */
  yandexRoot: string;
  /** Access tokens and workspace roots for each attached cloud storage. */
  cloudTokens: Record<string, string>;
  cloudRoots: Record<string, string>;
  connectCloud: (id: CloudId, token: string) => Promise<string>;
  /** Client ids for the OAuth clouds, and the account sign-in flow. */
  clientIds: Record<string, string>;
  setClientId: (id: string, value: string) => Promise<void>;
  /** Where work is stored: "" for the device, otherwise a cloud id. */
  preferredCloud: string;
  setPreferredCloud: (id: string) => void;
  signInCloud: (id: OAuthCloud) => Promise<string>;
  updateRepo: string;
  update: Release | null;
  appVersion: string;
  setUpdateRepo: (v: string) => Promise<void>;
  checkUpdate: () => Promise<Release | null>;
  /** Patch a provider. An omitted field is left untouched (an empty key clears it). */
  saveProvider: (id: string, patch: { key?: string; model?: string }) => Promise<void>;
  saveCustomPreset: (p: ProviderPreset) => Promise<void>;
  removeProvider: (id: string) => Promise<void>;
  setLocalPreset: (id: string) => void;
  setLocalModel: (model: string) => void;
  saveYandex: (token: string) => Promise<string>;
  localAbort: () => void;
  clearError: () => void;
  connect: (conn: Connection) => Promise<void>;
  disconnect: () => void;
  openSession: (id: string) => Promise<void>;
  closeSession: () => void;
  createNew: () => Promise<string>;
  send: (text: string, attach?: Attachment[]) => Promise<void>;
  abort: () => void;
  /**
   * Asks the server to undo everything done after `messageID`. Rejects on a
   * device-only session — there is no checkout to roll back.
   */
  revertTo: (messageID: string) => Promise<void>;
  /** Creates the project's folder, then the project. Rejects if the folder cannot be made. */
  createProject: (name: string, cloud: string) => Promise<string>;
  /** Folder names already on a cloud's opencode-projects/ that aren't registered as a project on this device yet. */
  listUnregisteredCloudProjects: (cloud: string) => Promise<string[]>;
  /** Registers one of those discovered folders as a project without creating anything. */
  importCloudProject: (name: string, cloud: string) => Promise<string>;
  /** Forgets a project. The folder and its files are left alone. */
  removeProject: (id: string) => void;
  /** Scopes the sessions list to a project; "" shows all of them. */
  setActiveProject: (id: string) => void;
  respondPermission: (p: PermissionRequest, response: "allow" | "deny", remember?: boolean) => void;
  setModel: (providerID: string, modelID: string) => void;
  setVariant: (v: EffortVariant) => void;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;
  refresh: () => Promise<void>;
  refreshMessages: (sessionID: string) => Promise<void>;
  closeMessage: (sessionId: string, messageId: string) => void;
};

const Ctx = createContext<StoreState | null>(null);

export function useStore(): StoreState {
  const s = useContext(Ctx);
  if (!s) throw new Error("no store");
  return s;
}

/** Everything a project creates lives under one folder, device or cloud alike. */
const PROJECT_DIR = "opencode-projects";

/** Folder names have to survive both a filesystem and three cloud APIs. */
function folderName(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 60);
}

/**
 * Walks a device project's folder for the `@` picker. Stops well short of a
 * huge tree (node_modules, build output) — this only needs to offer a
 * plausible file, not enumerate everything.
 */
function collectLocalFiles(dir: Directory, prefix: string, out: string[], limit: number, depth: number): void {
  if (out.length >= limit || depth > 8) return;
  let items: ReturnType<Directory["list"]>;
  try {
    items = dir.list();
  } catch {
    return;
  }
  for (const it of items) {
    if (out.length >= limit) return;
    const nm = it.name || it.uri.replace(/\/$/, "").split("/").pop() || "";
    if (!nm || nm.startsWith(".") || nm === "node_modules") continue;
    const rel = prefix ? `${prefix}/${nm}` : nm;
    if (it instanceof Directory) collectLocalFiles(it, rel, out, limit, depth + 1);
    else out.push(rel);
  }
}

/**
 * The cloud-drive counterpart of collectLocalFiles: a `listFolder` call per
 * directory, so it's one network round trip per level rather than one big
 * tree fetch — kept shallower and smaller than the on-device walk since it's
 * network-bound.
 */
async function collectCloudFiles(
  cloudId: CloudId,
  token: string,
  root: string | undefined,
  rel: string,
  prefix: string,
  out: string[],
  limit: number,
  depth: number,
): Promise<void> {
  if (out.length >= limit || depth > 4) return;
  let items: string[];
  try {
    items = await cloudListFolder(cloudId, token, rel, root);
  } catch {
    return;
  }
  for (const raw of items) {
    if (out.length >= limit) return;
    const isDir = raw.endsWith("/");
    const nm = isDir ? raw.slice(0, -1) : raw;
    if (!nm || nm.startsWith(".")) continue;
    const relChild = rel ? `${rel}/${nm}` : nm;
    const prefixChild = prefix ? `${prefix}/${nm}` : nm;
    if (isDir) await collectCloudFiles(cloudId, token, root, relChild, prefixChild, out, limit, depth + 1);
    else out.push(prefixChild);
  }
}

/** The legacy Yandex field wins only when the newer per-cloud list hasn't attached one of its own. */
function cloudCredential(s: { yandexToken: string; yandexRoot: string; cloudTokens: Record<string, string>; cloudRoots: Record<string, string> }, id: CloudId) {
  const token = s.cloudTokens[id] || (id === "yandex" ? s.yandexToken : "");
  const root = s.cloudRoots[id] || (id === "yandex" ? s.yandexRoot : "");
  return { token, root };
}

export function StoreProvider({
  children,
  conn,
  onConnectionFailure,
}: {
  children: React.ReactNode;
  conn: Connection | null;
  onConnectionFailure?: (e: unknown) => void;
}) {
  const api = useMemo(() => (conn ? new Api(conn) : null), [conn]);
  const [state, setState] = useState({
    connected: false,
    connecting: false,
    error: null as string | null,
    serverVersion: undefined as string | undefined,
    sessions: [] as SessionInfo[],
    statuses: {} as Record<string, SessionStatus>,
    activeId: null as string | null,
    messages: {} as Record<string, StoredMessage[]>,
    models: [] as ProviderWithModels[],
    projects: [] as Project[],
    activeServerProject: "",
    modelId: null as string | null,
    providerId: null as string | null,
    variants: ["default", "low", "high", "max"] as EffortVariant[],
    variant: "max" as EffortVariant,
    permissions: [] as PermissionRequest[],
    attachments: [] as Attachment[],
    busy: false,
    registered: [] as string[],
    onlyWeb: true,
    settings: { ...DEFAULT_SETTINGS },
    local: { ...DEFAULT_LOCAL },
    presets: [] as ProviderPreset[],
    keys: {} as Record<string, string>,
    providerModels: {} as Record<string, string[]>,
    yandexToken: "",
    yandexRoot: "",
    cloudTokens: {} as Record<string, string>,
    cloudRoots: {} as Record<string, string>,
    clientIds: {} as Record<string, string>,
    preferredCloud: "",
    oauth: {} as Record<string, OAuthRecord>,
    updateRepo: "",
    update: null as Release | null,
  });

  const apiRef = useRef(api);
  apiRef.current = api;
  const settingsRef = useRef<AppSettings>({ ...DEFAULT_SETTINGS });
  /** Latest state for callbacks that must not re-create on every change. */
  const stateRef = useRef(state);
  stateRef.current = state;
  const subRef = useRef<AbortController | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedCacheRef = useRef(false);
  const saveCacheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const knownRef = useRef({ messages: {} as Record<string, Record<string, StoredMessage>>, order: {} as Record<string, string[]> });

  // Background execution has no real hook here — the agent already runs on
  // the connected server, not this process. What backgrounding the app can
  // still do is arrange for a later background fetch to notice the reply
  // landed and fire a notification (see background.ts); coming back to the
  // foreground drops that watch since the normal 2s poll picks up again.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        const s = stateRef.current;
        if (!s.connected || !s.activeId) return;
        const st = s.statuses[s.activeId];
        const busy = !!st && (st.type === "busy" || st.type === "retry");
        if (!busy) return;
        const sess = s.sessions.find((x) => x.id === s.activeId);
        saveWatchTask({
          sessionID: s.activeId,
          directory: sess?.directory,
          title: sess ? sessionTitle(sess) : s.activeId,
        }).catch(() => {});
      } else if (next === "active") {
        clearWatchTask().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  const mergeMessage = useCallback((sessionID: string, msg: StoredMessage) => {
    knownRef.current.messages[sessionID] = knownRef.current.messages[sessionID] || {};
    knownRef.current.messages[sessionID][msg.info.id] = msg;
    setState((s) => {
      const msgs = [...(s.messages[sessionID] || [])];
      const idx = msgs.findIndex((m) => m.info.id === msg.info.id);
      if (idx >= 0) msgs[idx] = msg;
      else msgs.push(msg);
      knownRef.current.order[sessionID] = msgs.map((m) => m.info.id);
      return { ...s, messages: { ...s.messages, [sessionID]: msgs } };
    });
  }, []);

  /** A cheap fingerprint of a message list: cheaper than a deep-equal, and
   * good enough to skip a re-render when nothing actually changed (this
   * runs on a 2s poll while a chat is open, see chat.tsx). */
  const messagesFingerprint = (list: StoredMessage[]) =>
    list.map((m) => `${m.info.id}:${m.parts.length}:${m.info.time?.completed || 0}`).join("|");

  const refreshMessages = useCallback(
    async (sessionID: string) => {
      if (!apiRef.current) return;
      const list = await apiRef.current.getMessages(sessionID);
      const prev = knownRef.current.order[sessionID]
        ? messagesFingerprint((knownRef.current.order[sessionID] || []).map((id) => knownRef.current.messages[sessionID][id]).filter(Boolean))
        : null;
      const next = messagesFingerprint(list);
      knownRef.current.messages[sessionID] = {};
      list.forEach((m) => (knownRef.current.messages[sessionID][m.info.id] = m));
      knownRef.current.order[sessionID] = list.map((m) => m.info.id);
      // The busy/thinking indicator otherwise depends entirely on
      // "session.idle" arriving over the same unreliable event stream --
      // a live reply had visibly finished (last message is a completed
      // assistant turn) while the spinner kept going for however long the
      // next reconnect took. The message list already carries that
      // completion timestamp, so read idle off it directly instead of
      // waiting on a second, separate signal.
      const last = list[list.length - 1];
      const settled = last?.info.role === "assistant" && !!last.info.time?.completed;
      if (prev === next && !settled) return;
      setState((s) => {
        const messages = prev === next ? s.messages : { ...s.messages, [sessionID]: list };
        if (!settled || s.statuses[sessionID]?.type === "idle") {
          return { ...s, messages };
        }
        const statuses = { ...s.statuses, [sessionID]: { type: "idle" } as SessionStatus };
        return {
          ...s,
          messages,
          statuses,
          busy: Object.values(statuses).some((st) => st.type === "busy" || st.type === "retry"),
        };
      });
    },
    [],
  );

  const applyEvent = useCallback(
    (ev: ServerEvent) => {
      const p = ev.properties as Record<string, unknown> & {
        sessionID?: string;
      };
      const sid = typeof p?.sessionID === "string" ? p.sessionID : undefined;
      switch (ev.type) {
        case "session.updated": {
          const info = p.info as SessionInfo;
          if (info) {
            setState((s) => ({
              ...s,
              sessions: s.sessions.map((x) => (x.id === info.id ? { ...x, ...info } : x)),
            }));
          }
          break;
        }
        case "session.status":
          if (sid && p.status) {
            setState((s) => ({
              ...s,
              statuses: { ...s.statuses, [sid]: p.status as SessionStatus },
              busy: Object.values({ ...s.statuses, [sid]: p.status as SessionStatus }).some(
                (st) => st.type === "busy" || st.type === "retry",
              ),
            }));
          }
          break;
        case "session.idle":
          if (sid) {
            setState((s) => ({
              ...s,
              statuses: { ...s.statuses, [sid]: { type: "idle" } as SessionStatus },
              busy: false,
            }));
            refreshMessages(sid);
            apiRef.current?.getSession(sid).then((info) => {
              setState((s) => ({
                ...s,
                sessions: s.sessions.map((x) => (x.id === sid ? { ...x, ...info } : x)),
              }));
            });
          }
          break;
        case "session.error":
          if (sid) {
            setState((s) => {
              const msgs = [...(s.messages[sid] || [])];
              const last = msgs[msgs.length - 1];
              if (last && last.info.role === "assistant" && !last.info.time?.completed) {
                msgs[msgs.length - 1] = { ...last, info: { ...last.info, error: String(p.error || t("message.error")) } };
              }
              return { ...s, messages: { ...s.messages, [sid]: msgs }, statuses: { ...s.statuses, [sid]: { type: "idle" } as SessionStatus } };
            });
          }
          break;
        case "message.updated": {
          const info = p.info as MsgInfo | undefined;
          if (sid && info) {
            const cur = knownRef.current.messages[info.sessionID]?.[info.id];
            if (cur) {
              mergeMessage(sid, { ...cur, info: { ...cur.info, ...info } });
            }
            // new user message — comes before user part events; add shell
            else if (info.role === "user") {
              mergeMessage(sid, { info, parts: [] });
            }
          }
          break;
        }
        case "message.part.updated": {
          const part = p.part as Part | undefined;
          const mid = (p.messageID as string) || "";
          if (sid && mid && part) {
            setState((s) => {
              const cur = knownRef.current.messages[sid]?.[mid];
              if (!cur) return s;
              let next: StoredMessage;
              const idx = cur.parts.findIndex((x) => x.id === part.id);
              if (idx >= 0) {
                const parts = [...cur.parts];
                parts[idx] = mergePart(parts[idx], part);
                next = { ...cur, parts };
              } else {
                next = { ...cur, parts: [...cur.parts, part] };
              }
              knownRef.current.messages[sid][mid] = next;
              const msgs = [...(s.messages[sid] || [])];
              const mi = msgs.findIndex((m) => m.info.id === mid);
              if (mi >= 0) msgs[mi] = next;
              return { ...s, messages: { ...s.messages, [sid]: msgs } };
            });
          }
          break;
        }
        case "message.part.removed": {
          const mid = (p.messageID as string) || "";
          const pid = (p.partID as string) || "";
          if (sid && mid && pid) {
            setState((s) => {
              const cur = knownRef.current.messages[sid]?.[mid];
              if (!cur) return s;
              const next = { ...cur, parts: cur.parts.filter((x) => x.id !== pid) };
              knownRef.current.messages[sid][mid] = next;
              const msgs = [...(s.messages[sid] || [])];
              const mi = msgs.findIndex((m) => m.info.id === mid);
              if (mi >= 0) msgs[mi] = next;
              return { ...s, messages: { ...s.messages, [sid]: msgs } };
            });
          }
          break;
        }
        case "message.removed": {
          const mid = (p.messageID as string) || "";
          if (sid && mid) {
            setState((s) => {
              delete knownRef.current.messages[sid]?.[mid];
              const msgs = (s.messages[sid] || []).filter((m) => m.info.id !== mid);
              return { ...s, messages: { ...s.messages, [sid]: msgs } };
            });
          }
          break;
        }
        case "permission.updated": {
          const perm = p as unknown as PermissionRequest;
          if (settingsRef.current.autoAllowPermissions) {
            apiRef.current?.respondPermission(perm.sessionID, perm.id, "allow", false).catch(() => {});
            break;
          }
          setState((s) => ({ ...s, permissions: [...s.permissions.filter((x) => x.id !== perm.id), perm] }));
          break;
        }
      }
    },
    [mergeMessage, refreshMessages],
  );

  const connect = useCallback(
    async (c: Connection) => {
      if (!apiRef.current) return;
      setState((s) => ({ ...s, connecting: true, error: null, permissions: [] }));
      subRef.current?.abort();
      try {
        const h = await apiRef.current.health();
        const [providers, projects] = await Promise.all([
          apiRef.current.listProviders().catch(() => ({ providers: [] as ProviderWithModels[], default: {} as Record<string, string> })),
          apiRef.current.listProjects().catch(() => []),
        ]);

        // The session list is scoped to a directory — with none, the server
        // answers only for wherever it was launched from, not "every project."
        // A project with real history in it (twelve sessions, measured) comes
        // back empty until asked by its own worktree. So it is asked once per
        // project and merged, deduped by id in case a session ever matches more
        // than one project's scope.
        const perProject = await Promise.all(
          projects
            .filter((p) => p.worktree)
            .map((p) =>
              Promise.all([
                apiRef.current!.listSessions(p.worktree).catch(() => [] as SessionInfo[]),
                apiRef.current!.getSessionStatus(p.worktree).catch(() => ({}) as Record<string, SessionStatus>),
              ]),
            ),
        );
        const sessionsByID = new Map<string, SessionInfo>();
        const statuses: Record<string, SessionStatus> = {};
        for (const [list, st] of perProject) {
          for (const s of list) sessionsByID.set(s.id, s);
          Object.assign(statuses, st);
        }
        const sessions = [...sessionsByID.values()];
        const normalizedModels: ProviderWithModels[] = (providers.providers || []).map((p) => ({
          id: p.id,
          name: p.name,
          models: Object.values(
            (p.models as unknown as Record<
              string,
              { id: string; providerID?: string; name: string; capabilities?: { reasoning?: boolean; attachment?: boolean }; cost?: { input?: number; output?: number } }
            >) || {},
          ).map((m) => ({
            id: m.id,
            providerID: p.id,
            name: m.name,
            reasoning: Boolean(m.capabilities?.reasoning),
            attachment: Boolean(m.capabilities?.attachment),
            free: /free/i.test(m.name) || (Number(m.cost?.input ?? 1) === 0 && Number(m.cost?.output ?? 1) === 0),
          })),
        }));
        const sorted = sessions.sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0));
        const lastModel = sorted.find((x) => x.model?.id)?.model;
        setState((s) => ({
          ...s,
          connected: true,
          connecting: false,
          serverVersion: h.version,
          sessions: sorted,
          statuses,
          models: normalizedModels,
          projects,
          busy: Object.values(statuses).some((st) => st.type === "busy" || st.type === "retry"),
          modelId: lastModel?.id || null,
          providerId: lastModel?.providerID || null,
          variant: (lastModel?.variant as EffortVariant) || s.variant,
        }));
        // stream with auto-reconnect
        const ac = new AbortController();
        subRef.current = ac;
        (async () => {
          while (!ac.signal.aborted) {
            try {
              await apiRef.current?.streamEvents((ev) => applyEvent(ev), ac.signal);
            } catch (e) {
              if (!ac.signal.aborted) {
                setState((s) => ({ ...s, error: t("store.reconnecting") }));
              }
            }
            if (ac.signal.aborted) break;
            await new Promise((r) => setTimeout(r, 3000));
            if (!ac.signal.aborted) setState((s) => ({ ...s, error: null }));
          }
        })();
      } catch (e) {
        // A saved address that has never actually connected (or hasn't in a
        // very long time) retries silently forever in the background — most
        // installs have no server at all, and surfacing "can't reach the
        // server" on every 5s retry for an address nobody is using right now
        // was just noise. Only a session that was actually live is worth
        // interrupting the view for when it drops.
        const hadRealSession = stateRef.current.sessions.length > 0;
        setState((s) => ({
          ...s,
          connected: false,
          connecting: false,
          error: hadRealSession ? (e instanceof ApiError ? e.message : t("store.connectFailed")) : null,
        }));
        onConnectionFailure?.(e);
        // A wrong password needs the user; a dropped Wi-Fi bar or a server
        // that's asleep doesn't — keep whatever sessions/messages are
        // already loaded and quietly try again once it's back.
        const authFailure = e instanceof ApiError && e.status === 401;
        if (!authFailure) {
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            if (lastConnRef.current === c) connect(c);
          }, hadRealSession ? 5000 : 20000);
        }
      }
    },
    [applyEvent, onConnectionFailure],
  );

  const disconnect = useCallback(() => {
    subRef.current?.abort();
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setState((s) => ({
      ...s,
      connected: false,
      sessions: [],
      statuses: {},
      messages: {},
      permissions: [],
      activeId: null,
      projects: [],
      activeServerProject: "",
    }));
  }, []);

  const closeSession = useCallback(() => {
    setState((s) => ({ ...s, activeId: null }));
  }, []);

  const openSession = useCallback(
    async (id: string) => {
      setState((s) => ({ ...s, activeId: id, error: null }));
      // Always re-fetch on open, even if this session was seen before this
      // app run: the cached copy may predate messages sent from another
      // device (PC, or this same phone in an earlier live-update failure)
      // that no push event ever arrived to apply.
      if (state.connected && apiRef.current) {
        await refreshMessages(id);
      }
    },
    [state.connected, refreshMessages],
  );

  const registerSession = useCallback((id: string) => {
    setState((s) => {
      if (s.registered.includes(id)) return s;
      const registered = [...s.registered, id];
      saveRegistered(registered);
      return { ...s, registered };
    });
  }, []);

  const registerRef = useRef<(id: string) => void>(() => {});
  registerRef.current = registerSession;

  const createNew = useCallback(async () => {
    if (!state.connected) {
      const sid = "loc_" + Date.now();
      setState((s) => {
        const local: LocalState = {
          ...s.local,
          sessions: [
            { id: sid, title: t("chat.newSession"), when: Date.now(), projectID: s.local.activeProject || undefined },
            ...s.local.sessions,
          ],
        };
        saveLocal(local);
        return { ...s, activeId: sid, local };
      });
      return sid;
    }
    if (!apiRef.current) throw new Error("no api");
    const scoped = state.projects.find((p) => p.id === state.activeServerProject);
    const s = await apiRef.current.createSession(undefined, scoped?.worktree);
    setState((st) => ({
      ...st,
      sessions: [s, ...st.sessions],
      statuses: { ...st.statuses, [s.id]: { type: "idle" } as SessionStatus },
    }));
    registerRef.current(s.id);
    return s.id;
  }, [state.connected, state.activeServerProject, state.projects]);

  const send = useCallback(
    async (text: string, attach?: Attachment[]) => {
      const files = attach || [];
      if (!state.connected) {
        // A server is configured but currently unreachable — and there's an
        // actual connected session in view (real cached sessions, not just a
        // saved-but-never-used address): don't silently reroute the message
        // to on-device inference under a brand new local session, that's a
        // different provider answering a question meant for the connected
        // one with no sign anything switched. A saved address that has never
        // actually connected (or an empty account) falls through to local
        // sending as always — most installs have no server at all.
        if (apiRef.current && state.sessions.length > 0) {
          setState((s) => ({ ...s, error: t("store.offlineSendBlocked") }));
          return;
        }
        let sid = state.activeId;
        if (!sid) {
          sid = "loc_" + Date.now();
          const id = sid;
          setState((s) => {
            const local: LocalState = {
              ...s.local,
              sessions: [
                { id, title: text.slice(0, 34) || t("chat.newSession"), when: Date.now() },
                ...s.local.sessions,
              ],
            };
            saveLocal(local);
            return { ...s, activeId: id, local };
          });
        }
        await sendLocal(text, sid, files);
        return;
      }
      if (!apiRef.current) return;
      let sid = state.activeId;
      if (!sid) {
        sid = await createNew();
        setState((st) => ({ ...st, activeId: sid }));
      }
      if (!sid) return;
      const parts: Array<{ type: string; text?: string; url?: string; mime?: string; filename?: string }> = [];
      for (const a of files) {
        if (a.kind === "link" && a.url) {
          parts.push({ type: "source-url", url: a.url, text: undefined, mime: undefined });
        } else if (a.kind === "image" && a.uri) {
          // The server takes a file part by url; a data: url keeps it self-contained.
          // The field is `mime`, not `mediaType` -- the server rejects the whole
          // prompt with a 400 otherwise, which is why photo/media sends silently
          // never went anywhere.
          parts.push({ type: "file", url: a.text || a.uri, mime: a.mime || "image/jpeg", filename: a.name });
        } else if (a.text) {
          parts.push({ type: "text", text: t("store.fileWithBody", { name: a.name, text: a.text || "" }) });
        } else if (a.path || a.uri) {
          parts.push({ type: "text", text: t("store.fileInContext", { path: a.path || a.uri || "" }) });
        }
      }
      parts.push({ type: "text", text, mime: undefined });
      const model = state.modelId && state.providerId ? { providerID: state.providerId, modelID: state.modelId } : undefined;
      // Echo the user's own message locally, right now: waiting on the
      // round trip (an SSE event that has proven unreliable, or the 2s
      // fallback poll) made a sent message feel like it hadn't gone out
      // at all. The next refreshMessages call replaces this array wholesale
      // with the server's own copy, so the temporary entry is swapped for
      // the real one automatically once that lands.
      const localParts: Part[] = parts.map((p, idx) => {
        const partID = `tmp_${sid}_${idx}`;
        if (p.type === "file" && p.url) {
          return { id: partID, type: "file", mime: p.mime || "application/octet-stream", filename: p.filename, url: p.url };
        }
        return { id: partID, type: "text", text: p.text || p.url || "" };
      });
      mergeMessage(sid, {
        info: { id: `tmp_${sid}_${Date.now()}`, role: "user", sessionID: sid, time: { created: Date.now() } },
        parts: localParts,
      });
      setState((s) => ({
        ...s,
        statuses: { ...s.statuses, [sid!]: { type: "busy" } as SessionStatus },
        busy: true,
        attachments: [],
      }));
      try {
        await apiRef.current.promptAsync(sid, {
          parts,
          model: model ?? (await defaultModel(apiRef.current)),
          variant: state.variant,
        });
      } catch (e) {
        setState((s) => ({ ...s, error: e instanceof Error ? e.message : t("store.sendFailed") }));
      }
    },
    [state.activeId, state.modelId, state.providerId, state.variant, createNew, mergeMessage],
  );

  const abort = useCallback(() => {
    const sid = state.activeId;
    if (!sid) return;
    if (!state.connected) {
      localAcRef.current?.abort();
    } else if (apiRef.current) {
      apiRef.current.abort(sid).catch(() => {});
    }
    setState((s) => ({ ...s, statuses: { ...s.statuses, [sid]: { type: "idle" } as SessionStatus }, busy: false }));
  }, [state.activeId, state.connected]);

  const revertTo = useCallback(
    async (messageID: string) => {
      const sid = stateRef.current.activeId;
      if (!sid) return;
      if (!stateRef.current.connected || !apiRef.current) {
        throw new Error(t("message.revertUnavailable"));
      }
      await apiRef.current.revert(sid, messageID);
      await refreshMessages(sid);
    },
    [refreshMessages],
  );

  const createProject = useCallback(async (name: string, cloud: string) => {
    const safe = folderName(name);
    if (!safe) throw new Error(t("project.needName"));

    const { cloudTokens, cloudRoots, local } = stateRef.current;
    if (local.projects.some((p) => p.name.toLowerCase() === safe.toLowerCase() && p.cloud === cloud)) {
      throw new Error(t("project.exists"));
    }

    let path: string;
    if (cloud) {
      const token = cloudTokens[cloud];
      if (!token) throw new Error(t("project.noCloud"));
      const rel = `${PROJECT_DIR}/${safe}`;
      await cloudMakeFolder(cloud as CloudId, token, rel, cloudRoots[cloud]);
      path = rel;
    } else {
      const dir = new Directory(Paths.document, PROJECT_DIR, safe);
      if (!dir.exists) dir.create({ intermediates: true } as never);
      path = dir.uri;
    }

    const id = "prj_" + Date.now();
    setState((st) => {
      const next: LocalState = {
        ...st.local,
        projects: [{ id, name: safe, cloud, path, when: Date.now() }, ...st.local.projects],
        activeProject: id,
      };
      saveLocal(next);
      return { ...st, local: next };
    });
    return id;
  }, []);

  /**
   * Folders already sitting under a cloud's opencode-projects/ that this
   * device hasn't registered as a project yet — the gap that made an
   * existing "Заметки" folder invisible to @ and the file viewer even
   * though it was right there on the Disk. Device-only projects have
   * nothing to discover this way: they either exist in local.projects or
   * they don't, there's no separate source of truth to scan.
   */
  const listUnregisteredCloudProjects = useCallback(async (cloud: string): Promise<string[]> => {
    const s = stateRef.current;
    const { token, root } = cloudCredential(s, cloud as CloudId);
    if (!token) return [];
    let entries: string[];
    try {
      entries = await cloudListFolder(cloud as CloudId, token, PROJECT_DIR, root);
    } catch {
      return [];
    }
    const known = new Set(
      s.local.projects.filter((p) => p.cloud === cloud).map((p) => p.name.toLowerCase()),
    );
    return entries
      .filter((e) => e.endsWith("/"))
      .map((e) => e.slice(0, -1))
      .filter((name) => name && !known.has(name.toLowerCase()));
  }, []);

  /** Registers an existing cloud folder as a project — same bookkeeping as createProject, minus creating the folder. */
  const importCloudProject = useCallback(async (name: string, cloud: string) => {
    const safe = folderName(name);
    if (!safe) throw new Error(t("project.needName"));
    const { local } = stateRef.current;
    if (local.projects.some((p) => p.name.toLowerCase() === safe.toLowerCase() && p.cloud === cloud)) {
      throw new Error(t("project.exists"));
    }
    const path = `${PROJECT_DIR}/${safe}`;
    const id = "prj_" + Date.now();
    setState((st) => {
      const next: LocalState = {
        ...st.local,
        projects: [{ id, name: safe, cloud, path, when: Date.now() }, ...st.local.projects],
        activeProject: id,
      };
      saveLocal(next);
      return { ...st, local: next };
    });
    return id;
  }, []);

  const removeProject = useCallback((id: string) => {
    setState((st) => {
      const next: LocalState = {
        ...st.local,
        projects: st.local.projects.filter((p) => p.id !== id),
        activeProject: st.local.activeProject === id ? "" : st.local.activeProject,
        // Sessions outlive their project: losing the folder should not lose the chat.
        sessions: st.local.sessions.map((x) => (x.projectID === id ? { ...x, projectID: undefined } : x)),
      };
      saveLocal(next);
      return { ...st, local: next };
    });
  }, []);

  const setActiveProject = useCallback((id: string) => {
    setState((st) => {
      const next: LocalState = { ...st.local, activeProject: id };
      saveLocal(next);
      return { ...st, local: next };
    });
  }, []);

  const setActiveServerProject = useCallback((id: string) => {
    setState((s) => ({ ...s, activeServerProject: id }));
  }, []);

  const localAcRef = useRef<AbortController | null>(null);

  const sendLocal = useCallback(
    async (text: string, sid: string, files: Attachment[] = []) => {
      const { local, keys, settings, yandexToken, yandexRoot, presets } = stateRef.current;
      const presetId = local.presetID;
      const preset = findPreset(presets, presetId);
      if (!preset) {
        setState((s) => ({ ...s, error: t("store.noProvider") }));
        return;
      }
      const model = local.modelByPreset[presetId] || local.model || preset.model;
      const apiKey = keys[presetId] || "";
      // A key is only demanded of the built-in providers. A custom endpoint —
      // a local proxy, an LLM on the network — may well need none, and the
      // dialog that adds one says as much.
      const needsKey = BUILTIN_IDS.includes(presetId);
      if ((needsKey && !apiKey) || !model) {
        setState((s) => ({ ...s, error: t("store.noKey") }));
        return;
      }

      // Yandex Disk predates the cloud list and still has a field of its own, so
      // it is folded in here rather than at each of the three places that ask
      // which clouds are attached: the note, the tool list, and the tools. They
      // disagreed, and did so in both directions — a disk attached through
      // Settings → Clouds got the tools but a note saying no disk was connected,
      // while the legacy field alone would have got the note without the tools.
      // Either way the model was handed two contradictory accounts of itself and
      // told the user so. A cloud attached through Settings → Clouds wins here,
      // being the newer of the two.
      const cloudTokens: Record<string, string> = {
        ...(yandexToken ? { yandex: yandexToken } : {}),
        ...stateRef.current.cloudTokens,
      };
      const cloudRoots: Record<string, string> = {
        ...(yandexRoot ? { yandex: yandexRoot } : {}),
        ...stateRef.current.cloudRoots,
      };
      const storages = CLOUD_IDS.filter((id) => cloudTokens[id]).map((id) => cloudName(id));

      const activeProject = local.projects.find((p) => p.id === local.activeProject);
      const workspace = activeProject
        ? {
            name: activeProject.name,
            storage: activeProject.cloud ? cloudName(activeProject.cloud as CloudId) : t("chat.device"),
            path: activeProject.path,
          }
        : undefined;

      const prior = local.messages[sid] || [];
      // Web is always available; files and disk follow their switches.
      const tools = [
        ...webTools(),
        ...appTools(),
        ...(settings.localWork ? [...fileTools(), ...downloadTools()] : []),
        ...(Object.keys(cloudTokens).length ? diskTools() : []),
      ];
      // Images ride along as content parts; anything else becomes text in the turn.
      const images = files.filter((f) => f.kind === "image" && f.text);
      const notes = files
        .filter((f) => f.kind !== "image")
        .map((f) =>
          f.text
            ? t("store.fileWithBody", { name: f.name, text: f.text })
            : t("store.fileInContext", { path: f.path || f.uri || f.name }),
        );
      const userText = notes.length ? notes.join("\n\n") + "\n\n" + text : text;
      const userContent: LocalMsg["content"] = images.length
        ? [
            { type: "text" as const, text: userText },
            ...images.map((f) => ({ type: "image_url" as const, image_url: { url: f.text as string } })),
          ]
        : userText;
      const history: LocalMsg[] = [
        { role: "system", content: systemPrompt(settings, storages) },
        ...prior.map((m) => ({ role: m.role, content: m.content }) as LocalMsg),
        { role: "system", content: capabilityNote(settings, storages, workspace) },
        { role: "user", content: userContent },
      ];

      // Keep the attachments themselves, not just their names: the history has
      // to show the picture that was sent, not a line of text describing it.
      const kept: LocalAttachment[] = [];
      for (const f of files) {
        if (!f.uri) continue;
        kept.push({
          kind: f.kind === "image" ? "image" : "file",
          name: f.name,
          uri: await keepForHistory(f.uri, f.name),
          mime: f.mime,
        });
      }

      // Append through an updater: `send` may have just added this session, and a
      // snapshot taken before that would wipe it back out.
      setState((s) => {
        const local: LocalState = {
          ...s.local,
          messages: {
            ...s.local.messages,
            [sid]: [
              ...(s.local.messages[sid] || []),
              {
                role: "user",
                content: files.length ? attachLine(files) + "\n" + text : text,
                files: kept.length ? kept : undefined,
              },
            ],
          },
        };
        saveLocal(local);
        return {
          ...s,
          local,
          attachments: [],
          statuses: { ...s.statuses, [sid]: { type: "busy" } as SessionStatus },
          busy: true,
          error: null,
        };
      });

      if (Object.keys(stateRef.current.oauth).length) await ensureCloudTokens();

      const ac = new AbortController();
      localAcRef.current = ac;
      let acc = "";
      const patch = (content: string, done: boolean, err?: string) => {
        setState((s) => {
          // Rebuild from whatever is stored now: keep the turns, replace only the
          // assistant reply we are streaming.
          const msgs = s.local.messages[sid] || [];
          const kept = msgs.length && msgs[msgs.length - 1].role === "assistant" ? msgs.slice(0, -1) : msgs;
          const cur: LocalState = {
            ...s.local,
            messages: {
              ...s.local.messages,
              [sid]: content ? [...kept, { role: "assistant" as const, content }] : kept,
            },
          };
          saveLocal(cur);
          return {
            ...s,
            local: cur,
            statuses: {
              ...s.statuses,
              [sid]: done ? ({ type: "idle" } as SessionStatus) : ({ type: "busy" } as SessionStatus),
            },
            busy: done ? false : true,
            error: err ?? s.error,
          };
        });
      };
      patch("", false);

      try {
        // Tool calls come back instead of text, so keep asking until the model
        // answers with prose (or we hit the ceiling).
        for (let round = 0; round < 6; round++) {
          const res = await streamChat(preset, apiKey, model, history, ac.signal, (delta) => {
            acc += delta;
            patch(acc, false);
          }, tools);

          if (!res.toolCalls.length) break;

          history.push({
            role: "assistant",
            content: res.text,
            tool_calls: res.toolCalls.map((c) => ({
              id: c.id || c.name,
              type: "function" as const,
              function: { name: c.name, arguments: c.args },
            })),
          });

          for (const call of res.toolCalls) {
            let parsed: Record<string, unknown> = {};
            try {
              parsed = call.args ? JSON.parse(call.args) : {};
            } catch {
              // label falls back to the bare name
            }
            const out = await runTool(call.name, call.args, { cloudTokens, cloudRoots, preferredCloud: stateRef.current.preferredCloud, projectPath: activeProject?.path, projectCloud: activeProject?.cloud, app: appControl.current });
            acc += (acc ? "\n" : "") + "· " + toolLabel(call.name, parsed);
            patch(acc, false);
            history.push({ role: "tool", tool_call_id: call.id || call.name, content: out });
          }
          acc += "\n";
        }
        patch(acc, true);
      } catch (e) {
        const aborted = e instanceof Error && e.name === "AbortError";
        const msg = e instanceof LocalAIError ? e.message : aborted ? null : t("store.requestError");
        patch(acc || msg || "", true, msg ?? undefined);
      }
    },
    [],
  );

  const respondPermission = useCallback((p: PermissionRequest, response: "allow" | "deny", remember?: boolean) => {
    apiRef.current?.respondPermission(p.sessionID, p.id, response, remember).catch(() => {});
    setState((s) => ({ ...s, permissions: s.permissions.filter((x) => x.id !== p.id) }));
  }, []);

  const setModel = useCallback((providerID: string, modelID: string) => {
    setState((s) => ({ ...s, providerId: providerID, modelId: modelID }));
  }, []);

  const setVariant = useCallback((v: EffortVariant) => {
    setState((s) => ({ ...s, variant: v }));
  }, []);

  const renameSession = useCallback((id: string, title: string) => {
    apiRef.current?.updateSession(id, title).catch(() => {});
    setState((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === id ? { ...x, title } : x)) }));
  }, []);

  const deleteSession = useCallback(
    (id: string) => {
      apiRef.current?.deleteSession(id).catch(() => {});
      setState((s) => {
        // Local sessions live in persisted state, not on a server.
        const messages = { ...s.local.messages };
        delete messages[id];
        const local: LocalState = {
          ...s.local,
          sessions: s.local.sessions.filter((x) => x.id !== id),
          messages,
        };
        saveLocal(local);
        return {
          ...s,
          local,
          sessions: s.sessions.filter((x) => x.id !== id),
          activeId: s.activeId === id ? null : s.activeId,
        };
      });
    },
    [],
  );

  const setOnlyWeb = useCallback((b: boolean) => {
    setState((s) => ({ ...s, onlyWeb: b }));
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setState((s) => {
      const settings = { ...s.settings, ...patch };
      saveSettings(settings);
      return { ...s, settings };
    });
  }, []);

  const saveProvider = useCallback(async (id: string, patch: { key?: string; model?: string }) => {
    if (patch.key !== undefined) await saveKey(id, patch.key);
    setState((s) => {
      const keys = patch.key !== undefined ? { ...s.keys, [id]: patch.key } : s.keys;
      let local = s.local;
      if (patch.model !== undefined) {
        const model = patch.model.trim();
        local = {
          ...s.local,
          modelByPreset: { ...s.local.modelByPreset, [id]: model },
          model: s.local.presetID === id ? model : s.local.model,
        };
        saveLocal(local);
      }
      return { ...s, keys, local };
    });
  }, []);

  const fetchProviderModels = useCallback(async (id: string) => {
    const st = stateRef.current;
    const preset = findPreset(st.presets, id);
    const key = st.keys[id];
    if (!preset || !key) return [];
    let ids: string[] = [];
    try {
      ids = await listModels(preset.baseURL, key);
    } catch {
      ids = [];
    }
    if (!ids.length) return [];
    setState((s) => {
      const next = { ...s.providerModels, [id]: ids };
      saveProviderModels(next);
      return { ...s, providerModels: next };
    });
    return ids;
  }, []);

  const removeProvider = useCallback(async (id: string) => {
    await deleteKey(id);
    setState((s) => {
      const presets = s.presets.filter((p) => p.id !== id);
      savePresets(presets);
      const keys = { ...s.keys };
      delete keys[id];
      const modelByPreset = { ...s.local.modelByPreset };
      delete modelByPreset[id];
      let local: LocalState = { ...s.local, modelByPreset };
      if (s.local.presetID === id) {
        const next = allPresets(presets)[0];
        local = { ...local, presetID: next?.id || "", model: next?.model || "" };
      }
      saveLocal(local);
      return { ...s, presets, keys, local };
    });
  }, []);

  const saveCustomPreset = useCallback(async (p: ProviderPreset) => {
    setState((s) => {
      const next = [...s.presets.filter((x) => x.id !== p.id), p];
      savePresets(next);
      return { ...s, presets: next };
    });
  }, []);

  const setLocalPreset = useCallback((id: string) => {
    setState((s) => {
      const model = s.local.modelByPreset[id] || findPreset(s.presets, id)?.model || s.local.model;
      const local: LocalState = { ...s.local, presetID: id, model };
      saveLocal(local);
      return { ...s, local };
    });
  }, []);

  const setLocalModel = useCallback((model: string) => {
    setState((s) => {
      const local: LocalState = {
        ...s.local,
        model,
        modelByPreset: { ...s.local.modelByPreset, [s.local.presetID]: model },
      };
      saveLocal(local);
      return { ...s, local };
    });
  }, []);

  const setUpdateRepo = useCallback(async (v: string) => {
    await saveUpdateRepo(v);
    setState((s) => ({ ...s, updateRepo: v, update: null }));
  }, []);

  const checkUpdate = useCallback(async () => {
    const repo = stateRef.current.updateRepo;
    if (!repo) return null;
    const rel = await checkForUpdate(repo);
    setState((s) => ({ ...s, update: rel }));
    return rel;
  }, []);

  const connectCloud = useCallback(async (id: CloudId, token: string) => {
    const tok = extractToken(token);
    if (!tok) {
      await saveCloudToken(id, "");
      setState((s) => {
        const cloudTokens = { ...s.cloudTokens };
        delete cloudTokens[id];
        const cloudRoots = { ...s.cloudRoots };
        delete cloudRoots[id];
        saveCloudRoots(cloudRoots);
        return { ...s, cloudTokens, cloudRoots };
      });
      return t("store.disconnected");
    }
    // Verify by creating the workspace folder — a bad token fails right here.
    const { root } = await cloudConnect(id, tok);
    await saveCloudToken(id, tok);
    setState((s) => {
      const cloudRoots = { ...s.cloudRoots, [id]: root };
      saveCloudRoots(cloudRoots);
      return { ...s, cloudTokens: { ...s.cloudTokens, [id]: tok }, cloudRoots };
    });
    return t("store.connected", { root });
  }, []);

  // Kept for the Yandex-specific tool context; delegates to the shared path.
  /** Swaps an expired access token for a fresh one before the tools need it. */
  const ensureCloudTokens = useCallback(async () => {
    const st = stateRef.current;
    for (const id of ["gdrive", "dropbox"] as OAuthCloud[]) {
      const rec = st.oauth[id];
      if (!rec || !rec.refresh || !stale(rec)) continue;
      try {
        const next = await oauthRefresh(id, st.clientIds[id] || "", rec.refresh);
        await saveOAuth(id, next);
        await saveCloudToken(id, next.access);
        setState((s) => ({
          ...s,
          oauth: { ...s.oauth, [id]: next },
          cloudTokens: { ...s.cloudTokens, [id]: next.access },
        }));
      } catch {
        // Leave the stale token in place; the tool call will report the failure.
      }
    }
  }, []);

  /** What the model may change on the user's behalf. Never returns secrets. */
  const appControl = useRef<AppControl>({
    status: () => "",
    connectCloud: async () => "",
    setProviderKey: async () => "",
    setSetting: async () => "",
    useModel: async () => "",
  });

  const setPreferredCloud = useCallback((id: string) => {
    setState((s) => ({ ...s, preferredCloud: id }));
  }, []);

  const setClientId = useCallback(async (id: string, value: string) => {
    setState((s) => {
      const clientIds = { ...s.clientIds, [id]: value.trim() };
      saveClientIds(clientIds);
      return { ...s, clientIds };
    });
  }, []);

  /** Signs in through the provider, then prepares the workspace folder. */
  const signInCloud = useCallback(async (id: OAuthCloud) => {
    const clientId = stateRef.current.clientIds[id] || "";
    const tokens = await signIn(id, clientId);
    await saveOAuth(id, tokens);
    const { root } = await cloudConnect(id, tokens.access);
    await saveCloudToken(id, tokens.access);
    setState((s) => {
      const cloudRoots = { ...s.cloudRoots, [id]: root };
      saveCloudRoots(cloudRoots);
      return {
        ...s,
        cloudTokens: { ...s.cloudTokens, [id]: tokens.access },
        cloudRoots,
        oauth: { ...s.oauth, [id]: tokens },
      };
    });
    return t("store.signedIn", { root });
  }, []);

  const saveYandex = useCallback(
    async (token: string) => {
      const msg = await connectCloud("yandex", token);
      const t = extractToken(token);
      await saveYandexToken(t);
      setState((s) => {
        const root = s.cloudRoots.yandex || "";
        saveYandexRoot(root);
        return { ...s, yandexToken: t, yandexRoot: root };
      });
      return msg;
    },
    [connectCloud],
  );

  const addAttachments = useCallback((list: Attachment[]) => {
    if (!list.length) return;
    setState((s) => ({ ...s, attachments: [...s.attachments, ...list].slice(0, 8) }));
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setState((s) => ({ ...s, attachments: s.attachments.filter((_, i) => i !== index) }));
  }, []);

  const clearAttachments = useCallback(() => {
    setState((s) => ({ ...s, attachments: [] }));
  }, []);

  /**
   * Files for the `@` picker and the attach-project-file sheet. Connected to
   * a server, this asks it; otherwise it's the active on-device project's own
   * folder — a project held in a cloud drive isn't covered here, that would
   * mean walking a whole cloud API tree just to populate an autocomplete.
   */
  const findFiles = useCallback(async (q: string) => {
    if (stateRef.current.connected && apiRef.current) {
      // Same directory scoping as everywhere else the server is asked for a
      // project's own data (see connect()'s comment on listSessions): with
      // no directory, /find/file searches wherever the server happens to
      // have been launched from, not the project this chat is actually
      // about. Verified live — dropping this param silently searches the
      // wrong folder instead of erroring.
      const s0 = stateRef.current;
      const activeSession = s0.sessions.find((x) => x.id === s0.activeId);
      const scopedProject = s0.projects.find((p) => p.id === s0.activeServerProject);
      const directory = activeSession?.directory || scopedProject?.worktree || s0.sessions.find((x) => x.directory)?.directory;
      try {
        return await apiRef.current.findFiles(q, directory);
      } catch {
        return [];
      }
    }
    const s = stateRef.current;
    const active = s.local.projects.find((p) => p.id === s.local.activeProject);
    if (!active) return [];
    const needle = q.toLowerCase();
    if (!active.cloud) {
      try {
        const root = new Directory(active.path);
        if (!root.exists) return [];
        const all: string[] = [];
        collectLocalFiles(root, "", all, 400, 0);
        return all.filter((p) => p.toLowerCase().includes(needle)).slice(0, 30);
      } catch {
        return [];
      }
    }
    const cloudId = active.cloud as CloudId;
    const { token, root } = cloudCredential(s, cloudId);
    if (!token) return [];
    const all: string[] = [];
    await collectCloudFiles(cloudId, token, root, active.path, "", all, 200, 0);
    return all.filter((p) => p.toLowerCase().includes(needle)).slice(0, 30);
  }, []);

  /** Reads a file for the tap-to-view path in a reply: the server if connected, else the active local or cloud project. */
  const readFile = useCallback(async (path: string, directory?: string) => {
    if (stateRef.current.connected && apiRef.current) {
      try {
        return await apiRef.current.readFileContent(path, directory);
      } catch {
        return null;
      }
    }
    const s = stateRef.current;
    const active = s.local.projects.find((p) => p.id === s.local.activeProject);
    if (!active) return null;
    if (!isTextual(path)) return { type: "binary" as const, content: "" };
    if (!active.cloud) {
      try {
        const segments = path.replace(/\\/g, "/").split("/").filter((x) => x && x !== ".");
        if (segments.some((x) => x === "..")) return null;
        const file = new File(active.path, ...segments);
        if (!file.exists) return null;
        const text = await file.text();
        return { type: "text" as const, content: text };
      } catch {
        return null;
      }
    }
    const cloudId = active.cloud as CloudId;
    const { token, root } = cloudCredential(s, cloudId);
    if (!token) return null;
    try {
      const rel = `${active.path}/${path.replace(/^\/+/, "")}`;
      const text = await cloudDownloadText(cloudId, token, rel, root);
      return { type: "text" as const, content: text };
    } catch {
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!apiRef.current) return;
    // Same scoping as connect(): one request per project, or every project
    // but the server's own launch directory silently goes missing every 15s.
    const perProject = await Promise.all(
      state.projects
        .filter((p) => p.worktree)
        .map((p) =>
          Promise.all([
            apiRef.current!.listSessions(p.worktree).catch(() => [] as SessionInfo[]),
            apiRef.current!.getSessionStatus(p.worktree).catch(() => ({}) as Record<string, SessionStatus>),
          ]),
        ),
    );
    const sessionsByID = new Map<string, SessionInfo>();
    const statuses: Record<string, SessionStatus> = {};
    for (const [list, st] of perProject) {
      for (const s of list) sessionsByID.set(s.id, s);
      Object.assign(statuses, st);
    }
    const sessions = [...sessionsByID.values()];
    setState((s) => ({
      ...s,
      sessions: sessions.sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0)),
      statuses,
      busy: Object.values(statuses).some((st) => st.type === "busy" || st.type === "retry"),
    }));
  }, [state.projects]);

  const closeMessage = useCallback((sid: string, mid: string) => {
    setState((s) => {
      const cur = knownRef.current.messages[sid]?.[mid];
      if (!cur) return s;
      const nxt = { ...cur, parts: cur.parts.filter((p) => p.type !== "reasoning") };
      knownRef.current.messages[sid][mid] = nxt;
      const msgs = [...(s.messages[sid] || [])];
      const mi = msgs.findIndex((m) => m.info.id === mid);
      if (mi >= 0) msgs[mi] = nxt;
      return { ...s, messages: { ...s.messages, [sid]: msgs } };
    });
  }, []);

  const lastConnRef = useRef<Connection | null>(null);
  useEffect(() => {
    if (conn && lastConnRef.current !== conn) {
      lastConnRef.current = conn;
      // Paint the last-synced session before the server has even answered,
      // so relaunching offline shows something instead of a blank chat.
      if (!hydratedCacheRef.current) {
        hydratedCacheRef.current = true;
        loadServerCache().then((cache) => {
          if (!cache) return;
          setState((s) =>
            s.connected
              ? s
              : {
                  ...s,
                  sessions: cache.sessions,
                  projects: cache.projects,
                  activeId: cache.activeId,
                  messages: { ...cache.messages, ...s.messages },
                },
          );
        });
      }
      connect(conn);
    } else if (!conn && lastConnRef.current) {
      // App.tsx cleared the saved connection (Settings → Disconnect) --
      // without this, `connected` and every cached session/message stayed
      // stale, so the button looked like it did nothing.
      lastConnRef.current = null;
      disconnect();
    }
    loadRegistered().then((ids) => {
      setState((s) => ({ ...s, registered: ids.length ? ids : s.registered }));
    });
    loadSettings().then((st) => {
      setState((s) => ({ ...s, settings: st }));
    });
    loadProviderModels().then((pm) => setState((s) => ({ ...s, providerModels: pm })));
    loadYandexRoot().then((r) => setState((s) => ({ ...s, yandexRoot: r })));
    loadCloudRoots().then((roots) => setState((s) => ({ ...s, cloudRoots: roots })));
    loadClientIds().then((ids) => setState((s) => ({ ...s, clientIds: ids })));
    Promise.all((["gdrive", "dropbox"] as OAuthCloud[]).map(async (id) => [id, await loadOAuth(id)] as const)).then(
      (pairs) => {
        const oauth: Record<string, OAuthRecord> = {};
        pairs.forEach(([id, rec]) => {
          if (rec) oauth[id] = rec;
        });
        setState((s) => ({ ...s, oauth }));
      },
    );
    Promise.all(CLOUD_IDS.map(async (id) => [id, await loadCloudToken(id)] as const)).then((pairs) => {
      const cloudTokens: Record<string, string> = {};
      pairs.forEach(([id, t]) => {
        if (t) cloudTokens[id] = t;
      });
      setState((s) => ({ ...s, cloudTokens }));
    });
    loadUpdateRepo().then((repo) => {
      if (!repo) return;
      setState((s) => ({ ...s, updateRepo: repo }));
      // Quiet check on launch; a failure here must never surface as an error.
      checkForUpdate(repo)
        .then((rel) => setState((s) => ({ ...s, update: rel })))
        .catch(() => {});
    });
    Promise.all([loadLocal(), loadPresets(), loadYandexToken()]).then(async ([lg, ps, yd]) => {
      setState((s) => ({ ...s, local: lg, presets: ps, yandexToken: yd }));
      // Keys live in SecureStore under one entry per provider, so the ids to read
      // are only known once the user's custom providers have loaded.
      const ids = Array.from(new Set([...BUILTIN_IDS, ...ps.map((p) => p.id)]));
      const pairs = await Promise.all(ids.map(async (id) => [id, await loadKey(id)] as const));
      const keys: Record<string, string> = {};
      pairs.forEach(([id, k]) => (keys[id] = k));
      setState((s) => ({ ...s, keys }));
    });
    return () => {
      subRef.current?.abort();
    };
  }, [conn, connect, disconnect]);

  // Keeps the offline cache (above) fresh: written a second after things
  // settle, not on every keystroke of a streamed reply.
  useEffect(() => {
    if (!state.connected) return;
    if (saveCacheTimerRef.current) clearTimeout(saveCacheTimerRef.current);
    saveCacheTimerRef.current = setTimeout(() => {
      saveServerCache({
        sessions: state.sessions,
        projects: state.projects,
        activeId: state.activeId,
        messages: state.activeId ? { [state.activeId]: state.messages[state.activeId] || [] } : {},
      });
    }, 1000);
    return () => {
      if (saveCacheTimerRef.current) clearTimeout(saveCacheTimerRef.current);
    };
  }, [state.connected, state.sessions, state.projects, state.activeId, state.activeId ? state.messages[state.activeId] : undefined]);

  settingsRef.current = state.settings;

  appControl.current = {
    status: () => {
      const s = stateRef.current;
      const keys = Object.keys(s.keys).filter((k) => s.keys[k]);
      const clouds = Object.keys(s.cloudTokens);
      const preset = findPreset(s.presets, s.local.presetID);
      return [
        t("apptool.out.providersWithKeys", { list: keys.length ? keys.join(", ") : t("common.none") }),
        t("apptool.out.activeModel", {
          provider: presetName(preset) || s.local.presetID,
          model: s.local.model || t("settings.model.none"),
        }),
        t("apptool.out.clouds", { list: clouds.length ? clouds.join(", ") : t("common.none") }),
        t("apptool.out.localWork", { state: t(s.settings.localWork ? "apptool.out.enabled" : "apptool.out.disabled") }),
        t("apptool.out.showReasoning", { state: t(s.settings.showReasoning ? "common.yes" : "common.no") }),
      ].join("\n");
    },
    connectCloud: async (cloud, token) => await connectCloud(cloud as CloudId, token),
    setProviderKey: async (provider, key, model) => {
      const preset = findPreset(stateRef.current.presets, provider);
      if (!preset) return t("apptool.out.noProvider", { name: provider });
      await saveProvider(provider, { key, ...(model ? { model } : {}) });
      if (key) setLocalPreset(provider);
      return key
        ? t("apptool.out.keySaved", { name: presetName(preset) })
        : t("apptool.out.keyRemoved", { name: presetName(preset) });
    },
    setSetting: async (name, value) => {
      const allowed = ["localWork", "autoAllowPermissions", "showReasoning", "expandShell", "expandEdit"];
      if (!allowed.includes(name)) return t("apptool.out.noSetting", { name });
      updateSettings({ [name]: value } as Partial<AppSettings>);
      return t("apptool.out.settingSet", { name, state: t(value ? "apptool.out.enabled" : "apptool.out.disabled") });
    },
    useModel: async (provider, model) => {
      const preset = findPreset(stateRef.current.presets, provider);
      if (!preset) return t("apptool.out.noProvider", { name: provider });
      setLocalPreset(provider);
      if (model) setLocalModel(model);
      return t("apptool.out.selected", { provider: presetName(preset), model });
    },
  };

  const value: StoreState = {
    ...state,
    connect,
    disconnect,
    openSession,
    closeSession,
    createNew,
    send,
    abort,
    respondPermission,
    setModel,
    setVariant,
    renameSession,
    deleteSession,
    refresh,
    refreshMessages,
    closeMessage,
    attachments: state.attachments,
    addAttachments,
    removeAttachment,
    clearAttachments,
    findFiles,
    readFile,
    registered: state.registered,
    onlyWeb: state.onlyWeb,
    setOnlyWeb,
    registerSession,
    settings: state.settings,
    updateSettings,
    isLocal: !state.connected,
    hasServer: !!api && state.sessions.length > 0,
    local: state.local,
    presets: state.presets,
    providers: allPresets(state.presets),
    keys: state.keys,
    yandexToken: state.yandexToken,
    fetchProviderModels,
    saveProvider,
    saveCustomPreset,
    removeProvider,
    setLocalPreset,
    setLocalModel,
    yandexRoot: state.yandexRoot,
    cloudTokens: state.cloudTokens,
    cloudRoots: state.cloudRoots,
    connectCloud,
    clientIds: state.clientIds,
    setClientId,
    preferredCloud: state.preferredCloud,
    setPreferredCloud,
    signInCloud,
    updateRepo: state.updateRepo,
    update: state.update,
    appVersion: APP_VERSION_LABEL,
    setUpdateRepo,
    checkUpdate,
    saveYandex,
    revertTo,
    createProject,
    listUnregisteredCloudProjects,
    importCloudProject,
    removeProject,
    setActiveProject,
    activeServerProject: state.activeServerProject,
    setActiveServerProject,
    localAbort: () => localAcRef.current?.abort(),
    clearError: () => setState((s) => ({ ...s, error: null })),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function mergePart(prev: Part, next: Part): Part {
  if (prev.type === "text" && next.type === "text") {
    return { ...prev, text: next.text || prev.text, time: next.time || prev.time };
  }
  if (prev.type === "reasoning" && next.type === "reasoning") {
    return { ...prev, text: next.text || prev.text };
  }
  if (prev.type === "tool" && next.type === "tool") {
    return { ...prev, state: { ...next.state, input: next.state.input || prev.state.input } };
  }
  return next;
}

async function defaultModel(api: Api) {
  try {
    const r = await api.listProviders();
    const model = r.default;
    const keys = Object.keys(model || {});
    if (keys.length) {
      return { providerID: keys[0], modelID: model[keys[0]] };
    }
  } catch {
    // ignore
  }
  return { providerID: "opencode-go", modelID: "deepseek-v4-flash-vision-exp" };
}

/** What the transcript shows for a turn that carried files — never the base64. */
export function attachLine(files: Attachment[]): string {
  return files.map((f) => (f.kind === "image" ? "🖼 " : "📎 ") + f.name).join("\n");
}

export function sessionTitle(s: SessionInfo): string {
  return s.title && s.title.trim() ? s.title : t("chat.newSession");
}

export function variantName(v: string): string {
  return EFFORT_NAMES[v] || v;
}
