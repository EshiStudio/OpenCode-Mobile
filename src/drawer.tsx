import React from "react";
import { t } from "./i18n";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "./icons";
import { Theme } from "./theme";
import { useStore } from "./store";
import { SessionStatus } from "./types";
import { Avatar, Spinner } from "./ui";

export function Drawer({
  theme,
  open,
  onClose,
  themeLabel,
  onToggleTheme,
  onSettings,
  onNew,
  projectName,
  projectAv,
}: {
  theme: Theme;
  open: boolean;
  onClose: () => void;
  themeLabel: string;
  onToggleTheme: () => void;
  onSettings: () => void;
  onNew: () => void;
  projectName: string;
  projectAv: string;
}) {
  const store = useStore();
  const tx = React.useRef(new Animated.Value(-340)).current;

  React.useEffect(() => {
    Animated.timing(tx, { toValue: open ? 0 : -340, duration: 200, useNativeDriver: true }).start();
  }, [open, tx]);

  const now = t("common.now");
  const groups = [
    { label: t("common.today"), items: store.sessions.filter((s) => !isBusy(store.statuses[s.id]) && isToday(s)) },
    { label: t("common.earlier"), items: store.sessions.filter((s) => !isBusy(store.statuses[s.id]) && !isToday(s)) },
    { label: t("common.active"), items: store.sessions.filter((s) => isBusy(store.statuses[s.id])) },
  ];

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 25, pointerEvents: open ? "auto" : "none" } as never]}>
      <Animated.View
        style={[
          s.scrim,
          {
            backgroundColor: theme.scrim,
            opacity: tx.interpolate({ inputRange: [-340, 0], outputRange: [0, 1] }),
          },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          s.drawer,
          { backgroundColor: theme.bg, borderRightColor: theme.bd, transform: [{ translateX: tx }] },
        ]}
      >
        <View style={s.head}>
          <Avatar theme={theme} letter={projectAv} size={20} />
          <Text style={{ flex: 1, fontSize: 14, color: theme.ink }} numberOfLines={1}>
            {projectName}
          </Text>
          <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => [s.iconBtn, { backgroundColor: pressed ? theme.l2 : "transparent" }]}>
            <Icon name="close" size={14} color={theme.muted} />
          </Pressable>
        </View>

        <Pressable onPress={onNew} style={({ pressed }) => [s.newBtn, { borderColor: theme.bd, backgroundColor: pressed ? theme.l2 : "transparent" }]}>
          <Icon name="new-session" size={16} color={theme.muted} />
          <Text style={s.newTxt}>{t("chat.newSession")}</Text>
        </Pressable>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 12 }}>
          {groups.map(
            (g) =>
              g.items.length > 0 && (
                <View key={g.label}>
                  <Text style={[s.sec, { color: theme.faint }]}>{g.label.toUpperCase()}</Text>
                  {g.items.map((ses) => {
                    const st = store.statuses[ses.id];
                    const busy = isBusy(st);
                    return (
                      <Pressable
                        key={ses.id}
                        onPress={() => {
                          store.openSession(ses.id);
                          onClose();
                        }}
                        style={({ pressed }) => [
                          s.chat,
                          {
                            backgroundColor:
                              pressed || store.activeId === ses.id ? theme.l2 : "transparent",
                          },
                        ]}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[s.chatT, { color: theme.ink }]} numberOfLines={1}>
                            {ses.title || t("chat.newSession")}
                          </Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                            <Text style={{ fontSize: 11, color: theme.faint }} numberOfLines={1}>
                              {projectOf(ses)}
                            </Text>
                            {busy ? (
                              <Text style={{ fontSize: 11, color: theme.warn }}>· {t("common.running")}</Text>
                            ) : (
                              <Text style={{ fontSize: 11, color: theme.faint }}>· {timeAgo(ses.time?.updated)}</Text>
                            )}
                          </View>
                        </View>
                        {rowRight(st, theme)}
                      </Pressable>
                    );
                  })}
                </View>
              ),
          )}
        </ScrollView>

        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.bdSoft, paddingBottom: 28 }}>
          <DrawerFoot theme={theme} themeLabel={themeLabel} onToggleTheme={onToggleTheme} onSettings={onSettings} />
        </View>
      </Animated.View>
    </View>
  );
}

function DrawerFoot({
  theme,
  themeLabel,
  onToggleTheme,
  onSettings,
}: {
  theme: Theme;
  themeLabel: string;
  onToggleTheme: () => void;
  onSettings: () => void;
}) {
  return (
    <View>
      <Pressable onPress={onToggleTheme} style={({ pressed }) => [s.footBtn, { backgroundColor: pressed ? theme.l2 : "transparent" }]}>
        <Icon name="sliders" size={16} color={theme.muted} />
        <Text style={[s.footTxt, { color: theme.muted }]}>{t("sessions.theme")}</Text>
        <Text style={{ marginLeft: "auto", fontSize: 12, color: theme.faint }}>{themeLabel}</Text>
      </Pressable>
      <Pressable onPress={onSettings} style={({ pressed }) => [s.footBtn, { backgroundColor: pressed ? theme.l2 : "transparent" }]}>
        <Icon name="settings-gear" size={16} color={theme.muted} />
        <Text style={[s.footTxt, { color: theme.muted }]}>{t("sessions.settings")}</Text>
      </Pressable>
    </View>
  );
}

function rowRight(st: SessionStatus | undefined, theme: Theme) {
  if (st && (st.type === "busy" || st.type === "retry")) {
    return <Spinner size={13} color={theme.faint} />;
  }
  return null;
}

function isBusy(st?: SessionStatus) {
  return !!st && (st.type === "busy" || st.type === "retry");
}

function isToday(s: { time?: { updated: number } }) {
  if (!s.time) return true;
  const d = new Date(s.time.updated);
  const t = new Date();
  return d.toDateString() === t.toDateString();
}

function timeAgo(ms?: number) {
  if (!ms) return "";
  const d = Date.now() - ms;
  const m = Math.floor(d / 60000);
  if (m < 1) return t("common.now");
  if (m < 60) return t("common.minutes", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("common.hours", { n: h });
  return new Date(ms).toLocaleDateString();
}

function projectOf(ses: { directory?: string }) {
  if (!ses.directory) return t("common.dash");
  const base = ses.directory.replace(/\\/g, "/");
  const parts = base.split("/");
  return parts[parts.length - 1] || base;
}

const s = StyleSheet.create({
  scrim: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  drawer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 308,
    borderRightWidth: 1,
  },
  head: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  iconBtn: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 10,
    marginBottom: 8,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
  },
  newTxt: { fontSize: 13.5, color: "#6b6b6b" },
  sec: {
    fontSize: 10.5,
    letterSpacing: 1.3,
    paddingHorizontal: 4,
    paddingTop: 14,
    paddingBottom: 6,
  },
  chat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderRadius: 8,
  },
  chatT: { fontSize: 13.5, letterSpacing: -0.2 },
  footBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 8,
    paddingVertical: 11,
    borderRadius: 8,
  },
  footTxt: { fontSize: 13.5 },
});
