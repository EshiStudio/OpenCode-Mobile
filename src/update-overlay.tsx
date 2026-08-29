import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Platform, Modal, StyleSheet } from "react-native";
import { Theme } from "./theme";
import { APP_VERSION, installUpdate, isNewer } from "./update";

// TODO: Замените на ваш репозиторий (например: "owner/opencode-mobile")
const GITHUB_REPO = "EshiStudio/OpenCode-Mobile";

export function UpdateOverlay({ theme }: { theme: Theme }) {
  const [updateInfo, setUpdateInfo] = useState<{ version: string; apkUrl: string | null; releaseUrl: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
        if (!res.ok) return;
        const data = await res.json();
        
        const latestVersion = data.tag_name.replace(/^v/, "");

        // Must be strictly newer. Comparing for inequality also fires when the
        // installed build is ahead of the latest tag, which pins the user under
        // a modal asking them to "update" to an older version.
        if (data.tag_name && APP_VERSION && isNewer(latestVersion, APP_VERSION)) {
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
    setDownloading(true);
    try {
      await installUpdate(
        { apkUrl: updateInfo.apkUrl || "", pageUrl: updateInfo.releaseUrl, version: updateInfo.version },
        setProgress,
      );
    } finally {
      setDownloading(false);
      setProgress(0);
    }
  };

  return (
    <Modal transparent visible={true} animationType="fade">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" }]}>
        <View style={{
          width: 320,
          backgroundColor: theme.bg,
          borderRadius: 16,
          padding: 24,
          alignItems: "center",
          borderWidth: 1,
          borderColor: theme.bd,
          shadowColor: "#000",
          shadowOpacity: 0.3,
          shadowRadius: 15,
          shadowOffset: { width: 0, height: 5 },
          elevation: 10,
        }}>
          <Text style={{ color: theme.ink, fontSize: 18, fontWeight: "bold", marginBottom: 12 }}>
            Обновление {updateInfo.version}
          </Text>
          
          <Text style={{ color: theme.faint, fontSize: 14, textAlign: "center", marginBottom: 24 }}>
            Доступна новая версия OpenCode Mobile. Пожалуйста, обновитесь для продолжения работы.
          </Text>

          {downloading && (
            <View style={{ width: "100%", marginBottom: 24 }}>
              <View style={{ height: 6, backgroundColor: theme.l2, borderRadius: 3, overflow: "hidden" }}>
                <View style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: theme.acc }} />
              </View>
              <Text style={{ color: theme.faint, fontSize: 12, marginTop: 8, textAlign: "center" }}>
                Загрузка: {Math.round(progress * 100)}%
              </Text>
            </View>
          )}

          <Pressable
            onPress={handleUpdate}
            disabled={downloading}
            style={({ pressed }) => ({
              backgroundColor: downloading ? theme.l2 : (pressed ? theme.l3 : theme.acc),
              width: "100%",
              paddingVertical: 14,
              borderRadius: 10,
              alignItems: "center",
            })}
          >
            {downloading ? (
              <ActivityIndicator color={theme.ink} size="small" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>
                {Platform.OS === "android" && updateInfo.apkUrl ? "Установить обновление" : "Скачать обновление"}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
