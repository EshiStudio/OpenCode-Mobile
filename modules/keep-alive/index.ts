import { requireOptionalNativeModule } from "expo";

type KeepAliveNative = {
  start: (title: string, body: string) => boolean;
  update: (title: string, body: string) => boolean;
  stop: () => boolean;
};

// Optional on purpose: only the Android build carries the service, and a JS
// bundle that runs anywhere else (web, a bare Metro session) must not fall over
// because a native module is missing.
const native = requireOptionalNativeModule<KeepAliveNative>("KeepAlive");

export const keepAliveSupported = !!native;

/** Raises the ongoing notification and takes a wake lock. Safe to call twice. */
export function startKeepAlive(title: string, body: string): boolean {
  try {
    return native?.start(title, body) ?? false;
  } catch {
    return false;
  }
}

/** Rewrites the notification's text without disturbing the wake lock. */
export function updateKeepAlive(title: string, body: string): void {
  try {
    native?.update(title, body);
  } catch {
    // The notification going stale is not worth interrupting a run over.
  }
}

/** Drops the notification and the wake lock. Safe to call when not running. */
export function stopKeepAlive(): void {
  try {
    native?.stop();
  } catch {
    // Nothing to stop.
  }
}
