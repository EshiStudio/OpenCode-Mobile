import { ToolSpec } from "./tools";
import { t } from "./i18n";

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

/** Rebuilt per call so the descriptions follow the interface language. */
export function appTools(): ToolSpec[] {
  return [
  {
    type: "function",
    function: {
      name: "app_status",
      description:
        t("apptool.status.desc"),
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "app_connect_cloud",
      description:
        t("apptool.connectCloud.desc"),
      parameters: {
        type: "object",
        properties: {
          cloud: str(t("apptool.connectCloud.cloud")),
          token: str(t("apptool.connectCloud.token")),
        },
        required: ["cloud", "token"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "app_set_provider_key",
      description: t("apptool.providerKey.desc"),
      parameters: {
        type: "object",
        properties: {
          provider: str(t("apptool.providerKey.provider")),
          key: str(t("apptool.providerKey.key")),
          model: str(t("apptool.providerKey.model")),
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
        t("apptool.setting.desc"),
      parameters: {
        type: "object",
        properties: {
          name: str(t("apptool.setting.name")),
          value: { type: "boolean", description: t("apptool.setting.value") },
        },
        required: ["name", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "app_use_model",
      description: t("apptool.useModel.desc"),
      parameters: {
        type: "object",
        properties: { provider: str(t("apptool.useModel.provider")), model: str(t("apptool.useModel.model")) },
        required: ["provider", "model"],
      },
    },
  },
  ];
}

const APP_TOOL_NAMES = ["app_status", "app_connect_cloud", "app_set_provider_key", "app_set_setting", "app_use_model"];

export function isAppTool(name: string): boolean {
  return APP_TOOL_NAMES.includes(name);
}

export async function runAppTool(
  name: string,
  args: Record<string, unknown>,
  app: AppControl | undefined,
): Promise<string> {
  if (!app) return t("apptool.unavailable");
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
        return t("apptool.unknown", { name });
    }
  } catch (e) {
    return t("tool.err.generic", { detail: e instanceof Error ? e.message : String(e) });
  }
}
