import { ToolSpec } from "./tools";

/**
 * Tools that let the model configure the app itself — attach a cloud, add a
 * provider key, flip a switch — from what the user types in chat.
 *
 * Anything passed here travels through the model provider, so secrets handed
 * over in a message are only as private as that provider.
 */
export type AppControl = {
  status: () => string;
  connectCloud: (cloud: string, token: string) => Promise<string>;
  setProviderKey: (provider: string, key: string, model?: string) => Promise<string>;
  setSetting: (name: string, value: boolean) => Promise<string>;
  useModel: (provider: string, model: string) => Promise<string>;
};

const str = (description: string) => ({ type: "string", description });

export const APP_TOOLS: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "app_status",
      description:
        "Что сейчас подключено в приложении: провайдеры, облака, активная модель, переключатели. Секреты не возвращает.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "app_connect_cloud",
      description:
        "Подключить облачное хранилище по токену, который дал пользователь. Создаёт рабочую папку opencode.",
      parameters: {
        type: "object",
        properties: {
          cloud: str("yandex, gdrive или dropbox"),
          token: str("Токен доступа. Пустая строка отключает хранилище."),
        },
        required: ["cloud", "token"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "app_set_provider_key",
      description: "Сохранить API-ключ провайдера моделей и при желании выбрать модель.",
      parameters: {
        type: "object",
        properties: {
          provider: str("Идентификатор провайдера, например deepseek, openai, openrouter"),
          key: str("API-ключ. Пустая строка удаляет ключ."),
          model: str("Необязательно: идентификатор модели"),
        },
        required: ["provider", "key"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "app_set_setting",
      description:
        "Переключить настройку приложения: localWork (работа с файлами на устройстве), autoAllowPermissions, showReasoning, expandShell, expandEdit.",
      parameters: {
        type: "object",
        properties: {
          name: str("Имя настройки"),
          value: { type: "boolean", description: "Включить или выключить" },
        },
        required: ["name", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "app_use_model",
      description: "Сделать провайдера и модель активными для этого чата.",
      parameters: {
        type: "object",
        properties: { provider: str("Идентификатор провайдера"), model: str("Идентификатор модели") },
        required: ["provider", "model"],
      },
    },
  },
];

export function isAppTool(name: string): boolean {
  return APP_TOOLS.some((t) => t.function.name === name);
}

export async function runAppTool(
  name: string,
  args: Record<string, unknown>,
  app: AppControl | undefined,
): Promise<string> {
  if (!app) return "Управление приложением недоступно";
  const text = (k: string) => (typeof args[k] === "string" ? (args[k] as string) : "");

  try {
    switch (name) {
      case "app_status":
        return app.status();
      case "app_connect_cloud":
        return await app.connectCloud(text("cloud"), text("token"));
      case "app_set_provider_key":
        return await app.setProviderKey(text("provider"), text("key"), text("model") || undefined);
      case "app_set_setting":
        return await app.setSetting(text("name"), args.value === true);
      case "app_use_model":
        return await app.useModel(text("provider"), text("model"));
      default:
        return "Неизвестная команда: " + name;
    }
  } catch (e) {
    return "Ошибка: " + (e instanceof Error ? e.message : String(e));
  }
}
