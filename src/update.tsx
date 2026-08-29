import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Platform, Linking, Alert } from "react-native";
import * as Application from "expo-application";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { Theme } from "./theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// TODO: Замените на ваш репозиторий (например: "owner/opencode-mobile")
const GITHUB_REPO = "USERNAME/REPO";

export function UpdateOverlay({ theme }: { theme: Theme }) {
  const [updateInfo, setUpdateInfo] = useState<{ version: string; apkUrl: string | null; releaseUrl: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    async function check() {
      if (GITHUB_REPO === "USERNAME/REPO") return; // Заглушка, чтобы не стучаться на несуществующий репо

      try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
        if (!res.ok) return;
        const data = await res.json();
        
        const latestVersion = data.tag_name.replace(/^v/, "");
        const currentVersion = Application.nativeApplicationVersion || "1.0.0";
        
        if (latestVersion !== currentVersion && data.tag_name) {
          const apkAsset = data.assets.find((a: any) => a.name.endsWith(".apk"));
          setUpdateInfo({
            version: data.tag_name,
            apkUrl: apkAsset ? apkAsset.browser_download_url : null,
            releaseUrl: data.html_url,
          });
        }
      } catch (err) {
        // Игнорируем ошибки сети
      }
    }
    
    check();
  }, []);

  if (!updateInfo) return null;

  const handleUpdate = async () => {
    if (Platform.OS === "android" && updateInfo.apkUrl) {
      setDownloading(true);
      try {
        const fileUri = `${FileSystem.documentDirectory}update-${updateInfo.version}.apk`;
        
        const downloadResumable = FileSystem.createDownloadResumable(
          updateInfo.apkUrl,
          fileUri,
          {},
          (downloadProgress) => {
            const pct = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
            setProgress(pct);
          }
        );
        
        const result = await downloadResumable.downloadAsync();
        
        if (result && result.uri) {
          const contentUri = await FileSystem.getContentUriAsync(result.uri);
          await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
            data: contentUri,
            flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
            type: "application/vnd.android.package-archive",
          });
        }
      } catch (err) {
        Alert.alert("Ошибка", "Не удалось скачать или запустить установку обновления. Попробуйте скачать вручную.");
        Linking.openURL(updateInfo.releaseUrl);
      } finally {
        setDownloading(false);
        setProgress(0);
      }
    } else {
      // iOS или если APK нет в релизе — просто открываем страницу GitHub
      Linking.openURL(updateInfo.releaseUrl);
    }
  };

  return (
    <View
      style={{
        position: "absolute",
        top: Math.max(insets.top + 10, 50),
        left: 16,
        right: 16,
        backgroundColor: theme.bg,
        padding: 16,
        borderRadius: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderWidth: 1,
        borderColor: theme.bd,
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 5,
        zIndex: 9999,
      }}
    >
      <View style={{ flex: 1, paddingRight: 16 }}>
        <Text style={{ color: theme.ink, fontSize: 14, fontWeight: "600" }}>
          Обновление {updateInfo.version}
        </Text>
        {downloading ? (
          <View style={{ marginTop: 6, height: 4, backgroundColor: theme.l2, borderRadius: 2, overflow: "hidden" }}>
            <View style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: theme.acc }} />
          </View>
        ) : (
          <Text style={{ color: theme.faint, fontSize: 12, marginTop: 2 }}>
            Доступна новая версия на GitHub.
          </Text>
        )}
      </View>
      <Pressable
        onPress={handleUpdate}
        disabled={downloading}
        style={{
          backgroundColor: theme.acc,
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 8,
        }}
      >
        {downloading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>
            {Platform.OS === "android" && updateInfo.apkUrl ? "Установить" : "Скачать"}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
