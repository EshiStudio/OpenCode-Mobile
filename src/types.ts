export type SessionStatus =
  | { type: "idle" }
  | { type: "busy" }
  | { type: "retry"; attempt: number; message: string; next: number };

export type SessionModel = {
  id: string;
  providerID: string;
  variant?: string;
};

export type SessionSummary = {
  additions?: number;
  deletions?: number;
  files?: number;
};

export type SessionInfo = {
  id: string;
  slug?: string;
  title?: string;
  directory?: string;
  projectID?: string;
  agent?: string;
  model?: SessionModel;
  cost?: number;
  tokens?: {
    input: number;
    output: number;
    reasoning: number;
    cache?: { read: number; write: number };
  };
  summary?: SessionSummary;
  time?: {
    created: number;
    updated: number;
  };
  parentID?: string | null;
  shareID?: string | null;
};

export type MsgInfo = {
  id: string;
  role: "user" | "assistant";
  sessionID: string;
  parentID?: string | null;
  time?: {
    created: number;
    completed?: number;
  };
  modelID?: string;
  providerID?: string;
  agent?: string;
  mode?: string;
  cost?: number;
  tokens?: {
    input: number;
    output: number;
    reasoning: number;
    cache?: { read: number; write: number };
  };
  finish?: string;
  error?: string;
  path?: { cwd: string; root: string };
};

export type ToolStateInput = {
  status: "pending" | "running" | "completed" | "error";
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  title?: string;
  time?: { start: number; end?: number };
};

export type Part =
  | { id: string; type: "text"; text: string; time?: { start: number; end?: number } }
  | { id: string; type: "reasoning"; text: string; time?: { start: number; end?: number } }
  | {
      id: string;
      type: "tool";
      callID: string;
      tool: string;
      state: ToolStateInput;
    }
  | { id: string; type: "step-start" }
  | { id: string; type: "step-finish"; reason: string; cost?: number; tokens?: MsgInfo["tokens"] }
  | { id: string; type: "file"; mime: string; filename?: string; url: string }
  | { id: string; type: "retry"; attempt: number; error?: string }
  | { id: string; type: "compaction"; auto: boolean }
  | { id: string; type: "snapshot" }
  | { id: string; type: "patch"; files: string[] }
  | { id: string; type: "subtask"; description?: string; agent: string }
  | { id: string; type: "agent"; name: string };

export type StoredMessage = {
  info: MsgInfo;
  parts: Part[];
};

export type Project = {
  id: string;
  worktree?: string;
  vcs?: string | null;
};

export type VcsInfo = {
  branch?: string | null;
  default_branch?: string | null;
  repository?: string | null;
};

export type ProviderModel = {
  id: string;
  providerID: string;
  name: string;
  reasoning: boolean;
  attachment: boolean;
  free?: boolean;
};

export type ProviderWithModels = {
  id: string;
  name: string;
  models: ProviderModel[];
};

export type ServerEvent =
  | { type: "server.connected"; properties: Record<string, unknown> }
  | { type: "session.status"; properties: { sessionID: string; status: SessionStatus } }
  | { type: "session.idle"; properties: { sessionID: string } }
  | { type: "session.error"; properties: { sessionID: string; error?: string } }
  | { type: "session.updated"; properties: { sessionID: string; info: SessionInfo } }
  | { type: "session.diff"; properties: { sessionID: string } }
  | { type: "message.updated"; properties: { sessionID: string; info: MsgInfo } }
  | { type: "message.removed"; properties: { sessionID: string; messageID: string } }
  | { type: "message.part.updated"; properties: { sessionID: string; messageID: string; part: Part; delta?: string } }
  | { type: "message.part.removed"; properties: { sessionID: string; messageID: string; partID: string } }
  | { type: "permission.updated"; properties: PermissionRequest }
  | { type: "file.edited"; properties: { file: string } }
  | { type: string; properties: Record<string, unknown> };

export type PermissionRequest = {
  id: string;
  type: string;
  pattern?: string;
  sessionID: string;
  messageID?: string;
  callID?: string;
  title: string;
  metadata?: Record<string, unknown>;
  time?: { created: number };
};

export type EffortVariant = "default" | "low" | "high" | "max";

export const EFFORT_NAMES: Record<string, string> = {
  default: "Default",
  low: "Low",
  high: "High",
  max: "Max",
};
