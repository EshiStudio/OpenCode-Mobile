import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
} from "./storage";
import { diskTools, downloadTools, fileTools, webTools, runTool, toolLabel } from "./tools";
import { appTools, AppControl } from "./app-tools";
import { t } from "./i18n";
import { extractToken } from "./yandex";
import { CloudId, CLOUD_IDS, cloudName, connect as cloudConnect, makeFolder as cloudMakeFolder } from "./clouds";
import { Directory, Paths } from "expo-file-system";
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
  registered: string[];
  onlyWeb: boolean;
  setOnlyWeb: (b: boolean) => void;
  registerSession: (id: string) => void;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  isLocal: boolean;
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
  const knownRef = useRef({ messages: {} as Record<string, Record<string, StoredMessage>>, order: {} as Record<string, string[]> });

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

  const refreshMessages = useCallback(
    async (sessionID: string) => {
      if (!apiRef.current) return;
      const list = await apiRef.current.getMessages(sessionID);
      knownRef.current.messages[sessionID] = {};
      list.forEach((m) => (knownRef.current.messages[sessionID][m.info.id] = m));
      setState((s) => ({ ...s, messages: { ...s.messages, [sessionID]: list } }));
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
        const [sessions, statuses, providers, projects] = await Promise.all([
          apiRef.current.listSessions(),
          apiRef.current.getSessionStatus(),
          apiRef.current.listProviders().catch(() => ({ providers: [] as ProviderWithModels[], default: {} as Record<string, string> })),
          apiRef.current.listProjects().catch(() => []),
        ]);
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
        setState((s) => ({
          ...s,
          connected: false,
          connecting: false,
          error: e instanceof ApiError ? e.message : t("store.connectFailed"),
        }));
        onConnectionFailure?.(e);
      }
    },
    [applyEvent, onConnectionFailure],
  );

  const disconnect = useCallback(() => {
    subRef.current?.abort();
    setState((s) => ({
      ...s,
      connected: false,
      sessions: [],
      statuses: {},
      messages: {},
      permissions: [],
      activeId: null,
    }));
  }, []);

  const closeSession = useCallback(() => {
    setState((s) => ({ ...s, activeId: null }));
  }, []);

  const openSession = useCallback(
    async (id: string) => {
      setState((s) => ({ ...s, activeId: id, error: null }));
      if (state.connected && apiRef.current && !knownRef.current.messages[id] && !state.messages[id]) {
        await refreshMessages(id);
      }
    },
    [state.messages, state.connected, refreshMessages],
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
    const s = await apiRef.current.createSession();
    setState((st) => ({
      ...st,
      sessions: [s, ...st.sessions],
      statuses: { ...st.statuses, [s.id]: { type: "idle" } as SessionStatus },
    }));
    registerRef.current(s.id);
    return s.id;
  }, [state.connected]);

  const send = useCallback(
    async (text: string, attach?: Attachment[]) => {
      const files = attach || [];
      if (!state.connected) {
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
      const parts: Array<{ type: string; text?: string; url?: string; mediaType?: string; filename?: string }> = [];
      for (const a of files) {
        if (a.kind === "link" && a.url) {
          parts.push({ type: "source-url", url: a.url, text: undefined, mediaType: undefined });
        } else if (a.kind === "image" && a.uri) {
          // The server takes a file part by url; a data: url keeps it self-contained.
          parts.push({ type: "file", url: a.text || a.uri, mediaType: a.mime || "image/jpeg", filename: a.name });
        } else if (a.text) {
          parts.push({ type: "text", text: t("store.fileWithBody", { name: a.name, text: a.text || "" }) });
        } else if (a.path || a.uri) {
          parts.push({ type: "text", text: t("store.fileInContext", { path: a.path || a.uri || "" }) });
        }
      }
      parts.push({ type: "text", text, mediaType: undefined });
      const model = state.modelId && state.providerId ? { providerID: state.providerId, modelID: state.modelId } : undefined;
      try {
        await apiRef.current.promptAsync(sid, {
          parts,
          model: model ?? (await defaultModel(apiRef.current)),
          variant: state.variant,
        });
        setState((s) => ({
          ...s,
          statuses: { ...s.statuses, [sid!]: { type: "busy" } as SessionStatus },
          busy: true,
          attachments: [],
        }));
      } catch (e) {
        setState((s) => ({ ...s, error: e instanceof Error ? e.message : t("store.sendFailed") }));
      }
    },
    [state.activeId, state.modelId, state.providerId, state.variant, createNew],
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

  const localAcRef = useRef<AbortController | null>(null);

  const sendLocal = useCallback(
    async (text: string, sid: string, files: Attachment[] = []) => {
      const { local, keys, settings, yandexToken, presets } = stateRef.current;
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

      const prior = local.messages[sid] || [];
      // Web is always available; files and disk follow their switches.
      const tools = [
        ...webTools(),
        ...appTools(),
        ...(settings.localWork ? [...fileTools(), ...downloadTools()] : []),
        ...(Object.keys(stateRef.current.cloudTokens).length ? diskTools() : []),
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
        { role: "system", content: systemPrompt(settings, !!yandexToken) },
        ...prior.map((m) => ({ role: m.role, content: m.content }) as LocalMsg),
        { role: "system", content: capabilityNote(settings, !!yandexToken) },
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
            const out = await runTool(call.name, call.args, { yandexToken, yandexRoot: stateRef.current.yandexRoot, cloudTokens: stateRef.current.cloudTokens, cloudRoots: stateRef.current.cloudRoots, preferredCloud: stateRef.current.preferredCloud, app: appControl.current });
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

  const findFiles = useCallback(async (q: string) => {
    if (!apiRef.current) return [];
    try {
      return await apiRef.current.findFiles(q);
    } catch {
      return [];
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!apiRef.current) return;
    const [sessions, statuses] = await Promise.all([
      apiRef.current.listSessions(),
      apiRef.current.getSessionStatus(),
    ]);
    setState((s) => ({
      ...s,
      sessions: sessions.sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0)),
      statuses,
      busy: Object.values(statuses).some((st) => st.type === "busy" || st.type === "retry"),
    }));
  }, []);

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

  const startedRef = useRef(false);
  useEffect(() => {
    if (conn && !startedRef.current) {
      startedRef.current = true;
      connect(conn);
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
  }, [conn, connect]);

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
    closeMessage,
    attachments: state.attachments,
    addAttachments,
    removeAttachment,
    clearAttachments,
    findFiles,
    registered: state.registered,
    onlyWeb: state.onlyWeb,
    setOnlyWeb,
    registerSession,
    settings: state.settings,
    updateSettings,
    isLocal: !state.connected,
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
    removeProject,
    setActiveProject,
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
