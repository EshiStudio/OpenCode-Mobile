import { fetch as expoFetch } from "expo/fetch";
import { ProviderPreset } from "./storage";
import { AppSettings } from "./storage";

export type LocalMsg = { role: "system" | "user" | "assistant"; content: string };

const PRESET_LIST: Array<{ id: string; label: string; baseURL: string; model: string }> = [
  { id: "deepseek", label: "DeepSeek", baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { id: "openrouter", label: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  { id: "anthropic", label: "Anthropic (совместимый прокси)", baseURL: "https://api.anthropic.com", model: "claude-sonnet-4-5" },
  { id: "openai", label: "OpenAI", baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { id: "groq", label: "Groq", baseURL: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
];

export const PRESETS = PRESET_LIST;

export function systemPrompt(settings: AppSettings, yandexToken: boolean): string {
  const local = settings.localWork
    ? "У вас включена локальная работа: вы можете создавать папки и файлы локально на устройстве по запросу пользователя."
    : "Локальная работа выключена: вы НЕ можете создавать файлы или папки на устройстве. Если пользователь просит создать, сохранить или скопировать что-то локально — ответьте, что функция локальной работы отключена и попросите подключить Веб-диск (Яндекс Диск) в настройках приложения.";
  const disk = yandexToken
    ? "Яндекс Диск подключен: файлы можно сохранять в облако."
    : "Яндекс Диск не подключен: сохранение в облако недоступно, предложите подключить его в настройках.";
  return "Вы — ассистент Voice/Text мобильного приложения OpenCode. Отвечайте кратко и по делу. " + local + " " + disk;
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
): Promise<void> {
  const hasOpenAIHeaders = preset.baseURL.includes("openrouter") || preset.baseURL.includes("api.openai") || preset.baseURL.includes("deepseek") || preset.baseURL.includes("groq");
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
      }),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    throw new LocalAIError(0, "Не удалось достучаться до провайдера (сеть/URL)");
  }

  if (!res.ok || !res.body) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    if (res.status === 401 || res.status === 403) throw new LocalAIError(res.status, "Ключ API отклонён провайдером (401/403)");
    throw new LocalAIError(res.status, "Ошибка провайдера: " + (body.slice(0, 180) || res.status));
  }

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
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length) onDelta(delta);
        } catch {
          // skip malformed
        }
      }
    }
  }
}

export async function listModels(baseURL: string, apiKey: string): Promise<string[]> {
  const url = baseURL.replace(/\/+$/, "") + "/models";
  const res = await expoFetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } });
  if (!res.ok) return [];
  const json = await res.json();
  const arr = json?.data || [];
  return Array.isArray(arr) ? arr.map((m: { id: string }) => m.id).filter(Boolean) : [];
}
