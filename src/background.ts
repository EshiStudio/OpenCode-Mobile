import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { APP_VERSION, fetchLatest, isNewer } from "./update";

const BACKGROUND_UPDATE_TASK = "BACKGROUND_UPDATE_TASK";

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
    if (isNewer(APP_VERSION, rel.version)) {
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
