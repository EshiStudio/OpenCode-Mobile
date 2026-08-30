import { fetch as expoFetch } from "expo/fetch";
import { t } from "./i18n";
import {
  MsgInfo,
  PermissionRequest,
  Project,
  ProviderWithModels,
  ServerEvent,
  SessionInfo,
  SessionStatus,
  StoredMessage,
  VcsInfo,
} from "./types";

export type Connection = {
  host: string;
  username: string;
  password: string;
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class Api {
  private conn: Connection;

  constructor(conn: Connection) {
    this.conn = conn;
  }

  private get headers(): Record<string, string> {
    const basic = btoa(`${this.conn.username}:${this.conn.password}`);
    return {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
  }

  private url(path: string): string {
    return `${this.conn.host.replace(/\/+$/, "")}${path}`;
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10000);
    try {
      res = await expoFetch(this.url(path), {
        ...init,
        headers: { ...this.headers, ...(init?.headers || {}) },
        signal: ac.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new ApiError(0, t("api.timeout"));
      }
      throw new ApiError(0, t("api.unreachable", { reason: e instanceof Error ? e.message : t("api.networkError") }));
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401) throw new ApiError(401, t("api.unauthorized"));
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ApiError(res.status, body.slice(0, 300) || t("api.serverError", { status: res.status }));
    }
    const text = await res.text().catch(() => "null");
    if (!text) return undefined as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      return undefined as unknown as T;
    }
  }

  health() {
    return this.request<{ healthy: boolean; version: string }>("/global/health");
  }

  /**
   * `GET /session` is scoped to a directory — measured live, not documented:
   * with no `directory`, the server lists only sessions that live in wherever
   * it was launched from (this app's own "opencode-shared" sandbox), and a
   * project with real work in it — twelve sessions, in one case — returns
   * nothing until its own worktree is passed. There is no flag for "every
   * project"; the caller fetches once per project and merges.
   */
  listSessions(directory?: string) {
    const q = directory ? `?directory=${encodeURIComponent(directory)}` : "";
    return this.request<SessionInfo[]>(`/session${q}`);
  }

  getSessionStatus(directory?: string) {
    const q = directory ? `?directory=${encodeURIComponent(directory)}` : "";
    return this.request<Record<string, SessionStatus>>(`/session/status${q}`);
  }

  /** `directory` scopes the session to a server project — a query param, not a body field: the server rejects it as a body field with 400. */
  createSession(title?: string, directory?: string) {
    const q = directory ? `?directory=${encodeURIComponent(directory)}` : "";
    return this.request<SessionInfo>(`/session${q}`, {
      method: "POST",
      body: JSON.stringify(title ? { title } : {}),
    });
  }

  getSession(id: string) {
    return this.request<SessionInfo>(`/session/${id}`);
  }

  updateSession(id: string, title: string) {
    return this.request<SessionInfo>(`/session/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    });
  }

  deleteSession(id: string) {
    return this.request<boolean>(`/session/${id}`, { method: "DELETE" });
  }

  requireSession() {
    return this.request<SessionInfo[]>("/session");
  }

  getMessages(id: string) {
    return this.request<StoredMessage[]>(`/session/${id}/message`);
  }

  promptAsync(
    id: string,
    body: {
      parts: Array<{ type: string; text?: string; url?: string; mediaType?: string }>;
      model: { providerID: string; modelID: string };
      variant?: string;
    },
  ) {
    return this.request<unknown>(`/session/${id}/prompt_async`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Rolls the working tree back to the state before `messageID` was sent.
   * Server-side only: on-device sessions never touch a checkout, so there is
   * nothing to undo.
   */
  revert(id: string, messageID: string) {
    return this.request<unknown>(`/session/${id}/revert`, {
      method: "POST",
      body: JSON.stringify({ messageID }),
    });
  }

  abort(id: string) {
    return this.request<boolean>(`/session/${id}/abort`, { method: "POST" });
  }

  respondPermission(sessionID: string, permissionID: string, response: "allow" | "deny", remember?: boolean) {
    return this.request<boolean>(`/session/${sessionID}/permissions/${permissionID}`, {
      method: "POST",
      body: JSON.stringify({ response, remember }),
    });
  }

  listProjects() {
    return this.request<Project[]>("/project");
  }

  vcs(directory?: string) {
    const q = directory ? `?directory=${encodeURIComponent(directory)}` : "";
    return this.request<VcsInfo>(`/vcs${q}`).catch(() => ({ branch: null }));
  }

  findFiles(query: string, directory?: string, limit = 30) {
    const q = new URLSearchParams({ query, limit: String(limit) });
    if (directory) q.set("directory", directory);
    return this.request<string[]>(`/find/file?${q.toString()}`);
  }

  listProviders() {
    return this.request<{ providers: ProviderWithModels[]; default: Record<string, string> }>("/config/providers");
  }

  async streamEvents(onEvent: (e: ServerEvent) => void, signal: AbortSignal): Promise<void> {
    try {
      const res = await expoFetch(this.url("/event"), {
        headers: { Authorization: this.headers.Authorization, Accept: "text/event-stream" },
        signal,
      });
      if (!res.ok || !res.body) throw new ApiError(res.status, `event stream ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!dataLine) continue;
          try {
            const parsed = JSON.parse(dataLine.slice(5).trim()) as ServerEvent;
            onEvent(parsed);
          } catch {
            // ignore malformed frames
          }
        }
      }
    } finally {
      // stream closed
    }
  }
}

