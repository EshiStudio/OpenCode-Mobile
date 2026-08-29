import { fetch as expoFetch } from "expo/fetch";
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

const DESCRIPTIONS: Record<string, string> = {
  opencode: "Модели, отобранные командой opencode, по одному ключу",
  openai: "Модели GPT для быстрых и мощных задач общего ИИ",
  openrouter: "Доступ ко всем поддерживаемым моделям через одного провайдера",
  deepseek: "Недорогие модели с сильным кодом и рассуждениями",
  google: "Модели Gemini через OpenAI-совместимый эндпоинт",
  groq: "Сверхбыстрый инференс открытых моделей",
  "github-copilot": "ИИ-модели для помощи в кодировании через GitHub Copilot",
  xai: "Модели Grok от xAI",
  mistral: "Открытые и коммерческие модели Mistral",
  cerebras: "Инференс на чипах Cerebras",
};

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
    desc: DESCRIPTIONS[id] || `${e.models.length} ${e.models.length === 1 ? "модель" : "моделей"} · ${host(e.api)}`,
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
  const local = settings.localWork ? "локальная работа ВКЛЮЧЕНА" : "локальная работа выключена";
  const disk = yandexToken ? "Яндекс Диск ПОДКЛЮЧЕН" : "Яндекс Диск не подключен";
  return `Актуальное состояние на сейчас: ${local}, ${disk}. Игнорируйте более ранние утверждения об обратном в этом диалоге.`;
}

export function systemPrompt(settings: AppSettings, yandexToken: boolean): string {
  const local = settings.localWork
    ? "У вас включена локальная работа. Используйте инструменты write_file, make_dir, list_dir, read_file, delete_path для работы с файлами в рабочей папке приложения на устройстве. Пути указывайте относительными, например notes/todo.md. Файл по ссылке скачивает download_url, а save_to_device отдаёт готовый файл в память телефона — папку выбирает сам пользователь."
    : "Локальная работа выключена: вы НЕ можете создавать файлы или папки на устройстве. Если пользователь просит создать, сохранить или скопировать что-то локально — ответьте, что функция локальной работы отключена и попросите подключить Веб-диск (Яндекс Диск) в настройках приложения.";
  const disk = yandexToken
    ? "Яндекс Диск подключен: используйте disk_write_file, disk_make_dir, disk_list, disk_read_file. Рабочая папка на диске — opencode, пути указывайте относительно неё."
    : "Яндекс Диск не подключен: сохранение в облако недоступно, предложите подключить его в настройках.";
  return "Вы — ассистент мобильного приложения OpenCode. Отвечайте кратко и по делу. У вас есть доступ в интернет: web_search для поиска и fetch_url для загрузки страницы. Вы также можете настраивать само приложение: app_status показывает, что подключено, app_connect_cloud подключает облако по токену пользователя, app_set_provider_key сохраняет ключ провайдера, app_use_model переключает модель, app_set_setting меняет переключатели. Если пользователь прислал токен или ключ — примените его сами через эти инструменты и подтвердите результат. " + local + " " + disk;
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
