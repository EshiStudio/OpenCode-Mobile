import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { APP_VERSION, fetchLatest, isNewer } from "./update";
import { clearWatchTask, loadConnection, loadWatchTask } from "./storage";
import { SessionStatus } from "./types";

const BACKGROUND_UPDATE_TASK = "BACKGROUND_UPDATE_TASK";
const BACKGROUND_WATCH_TASK = "BACKGROUND_WATCH_TASK";

// Ensure notifications show up when app is foregrounded too (optional)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

TaskManager.defineTask(BACKGROUND_UPDATE_TASK, async () => {
  try {
    const rel = await fetchLatest("EshiStudio/OpenCode-Mobile");
    if (isNewer(rel.version, APP_VERSION)) {
      // Send a local notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Доступно обновление!",
          body: `Вышла новая версия OpenCode Mobile (${rel.version}). Нажмите, чтобы обновить.`,
          data: { version: rel.version, apkUrl: rel.apkUrl },
        },
        trigger: null, // trigger immediately
      });
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }
    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundUpdateTask() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return;

  await BackgroundFetch.registerTaskAsync(BACKGROUND_UPDATE_TASK, {
    minimumInterval: 60 * 60 * 12, // 12 hours
    stopOnTerminate: false, // android only
    startOnBoot: true, // android only
  });
}

/**
 * Checks whether a session the app is watching (set by the store when the
 * app backgrounds mid-reply) has finished, and fires a local notification if
 * so. This is on-device work talking to a server the phone can already
 * reach directly — there is no push relay, so completion is only noticed the
 * next time the OS runs a background fetch, not the instant it happens.
 */
TaskManager.defineTask(BACKGROUND_WATCH_TASK, async () => {
  try {
    const task = await loadWatchTask();
    if (!task) return BackgroundFetch.BackgroundFetchResult.NoData;
    const conn = await loadConnection();
    if (!conn) return BackgroundFetch.BackgroundFetchResult.NoData;

    const q = task.directory ? `?directory=${encodeURIComponent(task.directory)}` : "";
    const res = await fetch(`${conn.host.replace(/\/+$/, "")}/session/status${q}`, {
      headers: { Authorization: `Basic ${btoa(`${conn.username}:${conn.password}`)}` },
    });
    if (!res.ok) return BackgroundFetch.BackgroundFetchResult.Failed;
    const statuses = (await res.json()) as Record<string, SessionStatus>;
    const st = statuses[task.sessionID];
    const stillBusy = st && (st.type === "busy" || st.type === "retry");
    if (stillBusy) return BackgroundFetch.BackgroundFetchResult.NoData;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Готово",
        body: `Сессия «${task.title}» закончила отвечать.`,
        data: { sessionID: task.sessionID },
      },
      trigger: null,
    });
    await clearWatchTask();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundWatchTask() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return;

  await BackgroundFetch.registerTaskAsync(BACKGROUND_WATCH_TASK, {
    // The OS treats this as a floor, not a promise — Android/iOS both delay
    // background fetches well past it in practice, so completion notices lag.
    minimumInterval: 60 * 15,
    stopOnTerminate: false,
    startOnBoot: true,
  });
}
