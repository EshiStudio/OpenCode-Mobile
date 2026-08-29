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
  loadRegistered,
  loadSettings,
  loadYandexToken,
  LocalSessionMsg,
  LocalState,
  ProviderPreset,
  saveKey,
  saveLocal,
  savePresets,
  saveRegistered,
  saveSettings,
  saveYandexToken,
} from "./storage";
import { streamChat, systemPrompt, LocalAIError, PRESETS } from "./local-ai";
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
  kind: "link" | "file";
  name: string;
  text: string;
  url?: string;
  path?: string;
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
  attach: Attachment | null;
  setAttach: (a: Attachment | null) => void;
  findFiles: (q: string) => Promise<string[]>;
  registered: string[];
  onlyWeb: boolean;
  setOnlyWeb: (b: boolean) => void;
  registerSession: (id: string) => void;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  isLocal: boolean;
  local: LocalState;
  presets: ProviderPreset[];
  keys: Record<string, string>;
  yandexToken: string;
  savePresetKey: (id: string, key: string, model?: string) => Promise<void>;
  saveCustomPreset: (p: ProviderPreset) => Promise<void>;
  setLocalPreset: (id: string) => void;
  setLocalModel: (model: string) => void;
  saveYandex: (token: string) => Promise<void>;
  localAbort: () => void;
  clearError: () => void;
  connect: (conn: Connection) => Promise<void>;
  disconnect: () => void;
  openSession: (id: string) => Promise<void>;
  closeSession: () => void;
  createNew: () => Promise<string>;
  send: (text: string, attach?: Attachment | null) => Promise<void>;
  abort: () => void;
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
    attach: null as Attachment | null,
    busy: false,
    registered: [] as string[],
    onlyWeb: true,
    settings: { ...DEFAULT_SETTINGS },
    local: { ...DEFAULT_LOCAL },
    presets: [] as ProviderPreset[],
    keys: {} as Record<string, string>,
    yandexToken: "",
  });

  const apiRef = useRef(api);
  apiRef.current = api;
  const settingsRef = useRef<AppSettings>({ ...DEFAULT_SETTINGS });
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
                msgs[msgs.length - 1] = { ...last, info: { ...last.info, error: String(p.error || "ошибка") } };
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
                setState((s) => ({ ...s, error: "Переподключение к серверу…" }));
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
          error: e instanceof ApiError ? e.message : "Не удалось подключиться к серверу",
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
      setState((s) => ({
        ...s,
        activeId: sid,
        local: { ...s.local, sessions: [{ id: sid, title: "Новая сессия", when: Date.now() }, ...s.local.sessions] },
      }));
      saveLocal(state.local);
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
    async (text: string, attach?: Attachment | null) => {
      if (!state.connected) {
        let sid = state.activeId;
        if (!sid) {
          sid = "loc_" + Date.now();
          const local: LocalState = {
            ...state.local,
            sessions: [{ id: sid, title: text.slice(0, 34) || "Новая сессия", when: Date.now() }, ...state.local.sessions],
          };
          setState((s) => ({ ...s, activeId: sid, local }));
          saveLocal(local);
        }
        await sendLocal(text, sid);
        return;
      }
      if (!apiRef.current) return;
      let sid = state.activeId;
      if (!sid) {
        sid = await createNew();
        setState((st) => ({ ...st, activeId: sid }));
      }
      if (!sid) return;
      const parts: Array<{ type: string; text?: string; url?: string; mediaType?: string }> = [];
      if (attach?.kind === "link" && attach.url) {
        parts.push({ type: "source-url", url: attach.url, text: undefined, mediaType: undefined });
      } else if (attach?.kind === "file" && attach.path) {
        parts.push({ type: "text", text: `Файл в контексте: ${attach.path}` });
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
          attach: null,
        }));
      } catch (e) {
        setState((s) => ({ ...s, error: e instanceof Error ? e.message : "Не удалось отправить сообщение" }));
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

  const localAcRef = useRef<AbortController | null>(null);

  const sendLocal = useCallback(
    async (text: string, sid: string) => {
      const { local, keys, settings, yandexToken, presets } = state;
      const presetId = local.presetID;
      const preset =
        presets.find((p) => p.id === presetId) ||
        PRESETS.find((p) => p.id === presetId) || {
          id: presetId,
          baseURL: "https://api.deepseek.com/v1",
          model: local.model,
        };
      const model = local.model || preset.model;
      const apiKey = keys[presetId] || "";
      if (!apiKey || !model) {
        const label = (preset as { label?: string; name?: string }).label || (preset as { name?: string }).name || presetId;
        setState((s) => ({
          ...s,
          error: `Нужен API-ключ для «${label}» — Настройки → Сервер → Провайдеры${model ? "" : ", и укажите модель"}`,
        }));
        return;
      }

      const base = [...(local.messages[sid] || []), { role: "user" as const, content: text }];
      const history: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: systemPrompt(settings, !!yandexToken) },
        ...base,
      ];

      const updated: LocalState = { ...local, messages: { ...local.messages, [sid]: base } };
      setState((s) => ({
        ...s,
        local: updated,
        statuses: { ...s.statuses, [sid]: { type: "busy" } as SessionStatus },
        busy: true,
        error: null,
      }));
      saveLocal(updated);

      const ac = new AbortController();
      localAcRef.current = ac;
      let acc = "";
      const patch = (content: string, done: boolean, err?: string) => {
        setState((s) => {
          const cur: LocalState = {
            ...s.local,
            messages: {
              ...s.local.messages,
              [sid]: [...base, ...(content ? [{ role: "assistant" as const, content }] : [])],
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
        await streamChat(preset, apiKey, model, history, ac.signal, (delta) => {
          acc += delta;
          patch(acc, false);
        });
        patch(acc, true);
      } catch (e) {
        const aborted = e instanceof Error && e.name === "AbortError";
        const msg = e instanceof LocalAIError ? e.message : aborted ? null : "Ошибка запроса";
        patch(acc || msg || "", true, msg ?? undefined);
      }
    },
    [state],
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
      setState((s) => ({
        ...s,
        sessions: s.sessions.filter((x) => x.id !== id),
        activeId: s.activeId === id ? null : s.activeId,
      }));
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

  const savePresetKey = useCallback(async (id: string, key: string, model?: string) => {
    await saveKey(id, key);
    setState((s) => {
      const preset = s.presets.find((p) => p.id === id);
      const local: LocalState = {
        ...s.local,
        presetID: id,
        model: model || (s.local.presetID === id ? s.local.model : preset?.model || s.local.model),
      };
      saveLocal(local);
      return { ...s, keys: { ...s.keys, [id]: key }, local };
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
      const local: LocalState = { ...s.local, presetID: id };
      saveLocal(local);
      return { ...s, local };
    });
  }, []);

  const setLocalModel = useCallback((model: string) => {
    setState((s) => {
      const local: LocalState = { ...s.local, model };
      saveLocal(local);
      return { ...s, local };
    });
  }, []);

  const saveYandex = useCallback(async (token: string) => {
    await saveYandexToken(token);
    setState((s) => ({ ...s, yandexToken: token }));
  }, []);

  const setAttach = useCallback((a: Attachment | null) => {
    setState((s) => ({ ...s, attach: a }));
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
    Promise.all([loadLocal(), loadPresets(), loadYandexToken()]).then(([lg, ps, yd]) => {
      setState((s) => ({ ...s, local: lg, presets: ps, yandexToken: yd }));
    });
    Promise.all([
      "deepseek",
      "openrouter",
      "anthropic",
      "openai",
      "groq",
      "custom",
    ].map(async (id) => [id, await loadKey(id)] as const)).then((pairs) => {
      const keys: Record<string, string> = {};
      pairs.forEach(([id, k]) => (keys[id] = k));
      setState((s) => ({ ...s, keys }));
    });
    return () => {
      subRef.current?.abort();
    };
  }, [conn, connect]);

  settingsRef.current = state.settings;

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
    attach: state.attach,
    setAttach,
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
    keys: state.keys,
    yandexToken: state.yandexToken,
    savePresetKey,
    saveCustomPreset,
    setLocalPreset,
    setLocalModel,
    saveYandex,
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

export function sessionTitle(s: SessionInfo): string {
  return s.title && s.title.trim() ? s.title : "Новая сессия";
}

export function variantName(v: string): string {
  return EFFORT_NAMES[v] || v;
}
