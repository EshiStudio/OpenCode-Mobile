import React, { useEffect, useMemo, useState } from "react";
import { t } from "./i18n";
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Icon } from "./icons";
import { Theme } from "./theme";
import { useStore } from "./store";
import { SessionInfo } from "./types";

function baseName(dir?: string): string {
  if (!dir) return "";
  const parts = dir.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || "";
}

function dayLabel(when: number): string {
  const d = new Date(when);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= startOfToday) return t("common.today");
  if (d.getTime() >= startOfToday - 86400000) return t("common.yesterday");
  return t("common.earlier");
}

export function SessionsPanel({
  theme,
  open,
  onClose,
  onNew,
  onSettings,
  onHelp,
}: {
  theme: Theme;
  open: boolean;
  onClose: () => void;
  onNew: () => void;
  onSettings: () => void;
  onHelp: () => void;
}) {
  const store = useStore();
  const [query, setQuery] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const tx = React.useRef(new Animated.Value(-500)).current;

  useEffect(() => {
    Animated.timing(tx, { toValue: open ? 0 : -500, duration: 220, useNativeDriver: true }).start();
  }, [open, tx]);

  const list = useMemo(() => {
    let items: SessionInfo[];
    if (store.connected) {
      items = store.sessions.filter((s) => store.registered.includes(s.id));
    } else {
      items = store.local.sessions.map((l) => ({
        id: l.id,
        title: l.title,
        time: { updated: l.when },
        directory: t("chat.device"),
      } as SessionInfo));
    }
    const q = query.trim().toLowerCase();
    if (q) items = items.filter((s) => (s.title || "").toLowerCase().includes(q));
    return items.sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0));
  }, [store.sessions, store.local, store.registered, store.connected, query]);

  const groups: Array<{ label: string; items: SessionInfo[] }> = [];
  for (const it of list) {
    const label = dayLabel(it.time?.updated || Date.now());
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(it);
    else groups.push({ label, items: [it] });
  }

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { zIndex: 40, opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" } as never,
      ]}
    >
      <View style={[s.scrim, { backgroundColor: theme.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </View>
      <Animated.View
        style={[
          s.panel,
          { backgroundColor: theme.bg, borderRightColor: theme.bd, transform: [{ translateX: tx }] },
        ]}
      >
        <View style={[s.head, { paddingTop: 66 }]}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: theme.ink }}>{t("sessions.title")}</Text>
          <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [s.iconBtn, { backgroundColor: pressed ? theme.l2 : "transparent" }]}>
            <Icon name="close" size={14} color={theme.muted} />
          </Pressable>
        </View>

        <View style={s.searchWrap}>
          <View style={[s.search, { borderColor: theme.bdSoft }]}>
            <Icon name="magnifying-glass" size={13} color={theme.faint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("sessions.search")}
              placeholderTextColor={theme.faint}
              style={{ flex: 1, marginLeft: 6, fontSize: 12.5, color: theme.ink }}
            />
          </View>
          <Pressable onPress={onNew} style={({ pressed }) => [s.newBtn, { backgroundColor: pressed ? theme.l2 : "transparent" }]}>
            <Icon name="new-session" size={13} color={theme.muted} />
            <Text style={{ fontSize: 12.5, color: theme.muted }} numberOfLines={1}>
              {t("chat.newSession")}
            </Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 12 }}>
          {groups.map((g) => (
            <View key={g.label}>
              <Text style={[s.section, { color: theme.faint }]}>{g.label}</Text>
              {g.items.map((ses) => {
                const busy = !!store.statuses[ses.id] && (store.statuses[ses.id].type === "busy" || store.statuses[ses.id].type === "retry");
                const proj = baseName(ses.directory) || t("common.dash");
                const on = store.activeId === ses.id;
                return (
                  <Pressable
                    key={ses.id}
                    onPress={() => {
                      store.openSession(ses.id);
                      onClose();
                    }}
                    style={({ pressed }) => [s.sesRow, { backgroundColor: on || pressed ? theme.l2 : "transparent" }]}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 5,
                        backgroundColor: theme.avBg,
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Text style={{ color: theme.avFg, fontSize: 11, fontWeight: "600" }}>{(proj[0] || "?")?.toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 13.5, color: theme.ink }} numberOfLines={1}>
                        {ses.title || t("chat.newSession")}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
                        <Text style={{ fontSize: 11, color: theme.faint }} numberOfLines={1}>
                          {proj}
                        </Text>
                        {busy ? <Text style={{ fontSize: 11, color: theme.warn }}>· {t("common.running")}</Text> : null}
                      </View>
                    </View>
                    {confirm === ses.id ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                        <Pressable
                          accessibilityLabel={t("sessions.confirmDelete")}
                          onPress={() => {
                            store.deleteSession(ses.id);
                            setConfirm(null);
                          }}
                          hitSlop={8}
                          style={{ paddingHorizontal: 6, paddingVertical: 4 }}
                        >
                          <Text style={{ fontSize: 11.5, color: theme.err, fontWeight: "600" }}>{t("common.delete")}</Text>
                        </Pressable>
                        <Pressable onPress={() => setConfirm(null)} hitSlop={8} style={{ padding: 4 }}>
                          <Icon name="close" size={13} color={theme.faint} />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        accessibilityLabel={t("sessions.delete")}
                        onPress={() => setConfirm(ses.id)}
                        hitSlop={10}
                        style={{ padding: 4 }}
                      >
                        <Icon name="trash" size={13} color={theme.faint} />
                      </Pressable>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
          {groups.length === 0 ? (
            <Text style={{ textAlign: "center", color: theme.faint, fontSize: 12.5, padding: 26 }}>
              {query ? t("common.nothingFound") : t("sessions.empty")}
            </Text>
          ) : null}
        </ScrollView>

        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.bdSoft, paddingBottom: 26, paddingTop: 8 }}>
          <Pressable onPress={onSettings} style={({ pressed }) => [s.footRow, { backgroundColor: pressed ? theme.l2 : "transparent" }]}>
            <Icon name="settings-gear" size={15} color={theme.muted} />
            <Text style={{ fontSize: 13, color: theme.muted, marginLeft: 8 }}>{t("sessions.settings")}</Text>
          </Pressable>
          <Pressable onPress={onHelp} style={({ pressed }) => [s.footRow, { backgroundColor: pressed ? theme.l2 : "transparent" }]}>
            <Icon name="terminal" size={15} color={theme.muted} />
            <Text style={{ fontSize: 13, color: theme.muted, marginLeft: 8 }}>{t("sessions.help")}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  scrim: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "100%",
    borderRightWidth: 1,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  iconBtn: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  search: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 9,
  },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 36,
    paddingHorizontal: 9,
    borderRadius: 8,
    flexShrink: 0,
  },
  section: {
    fontSize: 10.5,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  sesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  footRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
});
