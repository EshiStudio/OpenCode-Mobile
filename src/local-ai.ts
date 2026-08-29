import { fetch as expoFetch } from "expo/fetch";
import { has, t } from "./i18n";
import { ProviderPreset } from "./storage";
import { CATALOG } from "./catalog";
import { AppSettings } from "./storage";

export type ToolCall = { id: string; name: string; args: string };

/** A user turn is plain text unless it carries images, which travel as parts. */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type LocalMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

/** Providers opencode surfaces first; the rest are reachable through search. */
const FEATURED = [
  "opencode",
  "openai",
  "openrouter",
  "deepseek",
  "google",
  "groq",
  "github-copilot",
  "xai",
  "mistral",
  "cerebras",
];

function host(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function fromCatalog(id: string): ProviderPreset | undefined {
  const e = CATALOG[id];
  if (!e) return undefined;
  return {
    id,
    name: e.name,
    baseURL: e.api,
    model: e.models[0] || "",
    desc: "",
  };
}

/** Every provider in the bundled registry, featured ones first. */
export const ALL_PRESETS: ProviderPreset[] = [
  ...FEATURED.map(fromCatalog).filter((p): p is ProviderPreset => !!p),
  ...Object.keys(CATALOG)
    .filter((id) => !FEATURED.includes(id))
    .sort((a, b) => (CATALOG[a].name || a).localeCompare(CATALOG[b].name || b))
    .map(fromCatalog)
    .filter((p): p is ProviderPreset => !!p),
];

export const PRESETS = ALL_PRESETS;
export const FEATURED_IDS = FEATURED;
export const BUILTIN_IDS = ALL_PRESETS.map((p) => p.id);

/** Model ids the registry knows for a provider, used before /models answers. */
export function catalogModels(id: string): string[] {
  return CATALOG[id]?.models || [];
}

/**
 * The one-line pitch under a provider name. Resolved on call rather than stored,
 * because the presets are built at import time, before the language is loaded.
 */
export function presetDesc(p: ProviderPreset): string {
  const key = "provider.desc." + p.id;
  if (has(key)) return t(key);
  const e = CATALOG[p.id];
  if (e) return t("provider.desc.generic", { count: e.models.length, host: host(e.api) });
  return p.desc || "";
}

/** Display name for a preset, whichever field it was stored under. */
export function presetName(p: ProviderPreset | undefined): string {
  return p ? p.name || p.label || p.id : "";
}

/** Registry providers merged with the user-added ones; custom entries win by id. */
export function allPresets(custom: ProviderPreset[]): ProviderPreset[] {
  const extra = custom.filter((c) => !CATALOG[c.id]);
  const merged = ALL_PRESETS.map((b) => {
    const over = custom.find((c) => c.id === b.id);
    return over ? { ...b, ...over } : b;
  });
  return [...merged, ...extra];
}

export function findPreset(custom: ProviderPreset[], id: string): ProviderPreset | undefined {
  return custom.find((c) => c.id === id && !CATALOG[id]) || fromCatalog(id) || custom.find((c) => c.id === id);
}

/**
 * Short restatement of the current capabilities, injected right before the newest
 * question. Earlier turns may claim a provider or the disk is missing; recency wins.
 */
export function capabilityNote(settings: AppSettings, yandexToken: boolean): string {
  const local = t(settings.localWork ? "ai.state.localOn" : "ai.state.localOff");
  const disk = t(yandexToken ? "ai.state.diskOn" : "ai.state.diskOff");
  return t("ai.state.now", { local, disk });
}

export function systemPrompt(settings: AppSettings, yandexToken: boolean): string {
  const local = t(settings.localWork ? "ai.prompt.localOn" : "ai.prompt.localOff");
  const disk = t(yandexToken ? "ai.prompt.diskOn" : "ai.prompt.diskOff");
  return t("ai.prompt.base") + local + " " + disk;
}

export class LocalAIError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function streamChat(
  preset: ProviderPreset,
  apiKey: string,
  model: string,
  messages: LocalMsg[],
  signal: AbortSignal,
  onDelta: (text: string) => void,
  tools?: unknown[],
): Promise<{ text: string; toolCalls: ToolCall[] }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (preset.baseURL.includes("openrouter")) {
    headers["HTTP-Referer"] = "https://opencode.mobile";
    headers["X-Title"] = "OpenCode Mobile";
  }
  headers.Authorization = `Bearer ${apiKey}`;

  const url = preset.baseURL.replace(/\/+$/, "") + "/chat/completions";

  let res: Response;
  try {
    res = await expoFetch(url, {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.4,
        ...(tools && tools.length ? { tools, tool_choice: "auto" } : {}),
      }),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    throw new LocalAIError(0, t("ai.unreachable"));
  }

  if (!res.ok || !res.body) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    if (res.status === 401 || res.status === 403) throw new LocalAIError(res.status, t("ai.keyRejected"));
    throw new LocalAIError(res.status, t("ai.providerError", { detail: body.slice(0, 180) || res.status }));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  // Tool calls arrive split across deltas and are keyed by their index.
  const calls: Record<number, { id: string; name: string; args: string }> = {};

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta;
          const content = delta?.content;
          if (typeof content === "string" && content.length) {
            text += content;
            onDelta(content);
          }
          const tc = delta?.tool_calls;
          if (Array.isArray(tc)) {
            for (const c of tc) {
              const i = typeof c.index === "number" ? c.index : 0;
              const slot = calls[i] || (calls[i] = { id: "", name: "", args: "" });
              if (c.id) slot.id = c.id;
              if (c.function?.name) slot.name += c.function.name;
              if (c.function?.arguments) slot.args += c.function.arguments;
            }
          }
        } catch {
          // skip malformed
        }
      }
    }
  }

  const toolCalls = Object.keys(calls)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => calls[Number(k)])
    .filter((c) => c.name);
  return { text, toolCalls };
}

export async function listModels(baseURL: string, apiKey: string): Promise<string[]> {
  const url = baseURL.replace(/\/+$/, "") + "/models";
  const res = await expoFetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
  if (!res.ok) return [];
  const json = await res.json();
  const arr = json?.data || [];
  return Array.isArray(arr) ? arr.map((m: { id: string }) => m.id).filter(Boolean) : [];
}
