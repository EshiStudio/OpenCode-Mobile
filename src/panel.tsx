import React, { useEffect, useMemo, useState } from "react";
import { t } from "./i18n";
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Icon } from "./icons";
import { Theme } from "./theme";
import { useStore } from "./store";
import { SessionInfo } from "./types";
import { CLOUD_IDS, cloudName } from "./clouds";
import { useDrawerSwipe } from "./swipe";

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

/**
 * Sessions worth showing, newest first. Server sessions are filtered to the
 * ones this device started; on-device sessions live somewhere else entirely.
 * Shared so the panel and the title's quick-pick can never drift apart.
 */
export function visibleSessions(store: ReturnType<typeof useStore>, projectID?: string): SessionInfo[] {
  const scope = projectID === undefined ? store.local.activeProject : projectID;
  const projects = store.local.projects;
  const items: SessionInfo[] = store.connected
    ? store.sessions.filter((s) => store.registered.includes(s.id))
    : store.local.sessions
        .filter((l) => !scope || l.projectID === scope)
        .map(
          (l) =>
            ({
              id: l.id,
              title: l.title,
              time: { updated: l.when },
              directory: projects.find((p) => p.id === l.projectID)?.name || t("chat.device"),
            }) as SessionInfo,
        );
  return [...items].sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0));
}

/**
 * Projects as workspaces: tap one to scope the session list to it, long-press
 * for its sessions and a way to start another inside it.
 *
 * Only offered on device. With a server connected the projects come from
 * opencode itself and are its own directories, not folders this app made.
 */
function ProjectStrip({
  theme,
  onNewSession,
  onOpenSession,
}: {
  theme: Theme;
  onNewSession: () => void;
  onOpenSession: (id: string) => void;
}) {
  const store = useStore();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [cloud, setCloud] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const active = store.local.activeProject;
  const projects = store.local.projects;

  const create = async () => {
    setBusy(true);
    setErr("");
    try {
      await store.createProject(name, cloud);
      setName("");
      setCreating(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.projects}>
      <View style={s.projHead}>
        <Text style={{ fontSize: 11, letterSpacing: 1.1, color: theme.faint }}>
          {t("project.title").toUpperCase()}
        </Text>
        <Pressable
          accessibilityLabel={t("project.new")}
          onPress={() => setCreating((v) => !v)}
          hitSlop={8}
          style={({ pressed }) => [s.iconBtn, { backgroundColor: pressed ? theme.l2 : "transparent" }]}
        >
          <Icon name={creating ? "close" : "folder-plus"} size={14} color={theme.muted} />
        </Pressable>
      </View>

      {creating ? (
        <View style={{ gap: 6, paddingBottom: 8 }}>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            placeholder={t("project.namePlaceholder")}
            placeholderTextColor={theme.faint}
            onSubmitEditing={create}
            style={[s.projInput, { borderColor: theme.bdSoft, color: theme.ink }]}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <ChoiceChip theme={theme} label={t("chat.device")} on={!cloud} onPress={() => setCloud("")} />
            {CLOUD_IDS.filter((id) => store.cloudTokens[id]).map((id) => (
              <ChoiceChip
                key={id}
                theme={theme}
                label={cloudName(id)}
                on={cloud === id}
                onPress={() => setCloud(id)}
              />
            ))}
          </ScrollView>
          {err ? <Text style={{ fontSize: 11.5, color: theme.err }}>{err}</Text> : null}
          <Pressable
            onPress={create}
            disabled={busy || !name.trim()}
            style={({ pressed }) => [
              s.projCreate,
              { backgroundColor: busy || !name.trim() ? theme.l2 : pressed ? theme.l3 : theme.sndOn },
            ]}
          >
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: busy || !name.trim() ? theme.muted : "#fff" }}>
              {t("project.create")}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {projects.length === 0 && !creating ? (
        <Text style={{ fontSize: 11.5, color: theme.faint, paddingVertical: 6 }}>{t("project.none")}</Text>
      ) : null}

      {projects.map((p) => {
        const on = p.id === active;
        const open = expanded === p.id;
        const own = visibleSessions(store, p.id);
        return (
          <View key={p.id}>
            <Pressable
              onPress={() => store.setActiveProject(on ? "" : p.id)}
              onLongPress={() => setExpanded(open ? null : p.id)}
              delayLongPress={280}
              style={({ pressed }) => [s.projRow, { backgroundColor: on || pressed ? theme.l2 : "transparent" }]}
            >
              <View style={[s.projMark, { backgroundColor: theme.avBg }]}>
                <Text style={{ color: theme.avFg, fontSize: 11, fontWeight: "600" }}>
                  {p.name[0]?.toUpperCase() || "?"}
                </Text>
              </View>
              <Text style={{ flex: 1, fontSize: 13, color: theme.ink }} numberOfLines={1}>
                {p.name}
              </Text>
              {p.cloud ? <Icon name="cloud" size={13} color={theme.faint} /> : null}
            </Pressable>

            {open ? (
              <View style={{ paddingLeft: 30, paddingBottom: 6 }}>
                {own.map((ses) => (
                  <Pressable
                    key={ses.id}
                    onPress={() => onOpenSession(ses.id)}
                    style={({ pressed }) => [s.projSub, { backgroundColor: pressed ? theme.l2 : "transparent" }]}
                  >
                    <Text style={{ fontSize: 12.5, color: theme.muted }} numberOfLines={1}>
                      {ses.title || t("chat.newSession")}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => {
                    store.setActiveProject(p.id);
                    onNewSession();
                  }}
                  style={({ pressed }) => [s.projSub, { backgroundColor: pressed ? theme.l2 : "transparent" }]}
                >
                  <Text style={{ fontSize: 12.5, color: theme.acc }}>+ {t("chat.newSession")}</Text>
                </Pressable>
                <Pressable
                  onPress={() => store.removeProject(p.id)}
                  style={({ pressed }) => [s.projSub, { backgroundColor: pressed ? theme.l2 : "transparent" }]}
                >
                  <Text style={{ fontSize: 12, color: theme.err }}>{t("project.forget")}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function ChoiceChip({
  theme,
  label,
  on,
  onPress,
}: {
  theme: Theme;
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.chip,
        { borderColor: on ? theme.acc : theme.bdSoft, backgroundColor: pressed ? theme.l2 : "transparent" },
      ]}
    >
      <Text style={{ fontSize: 12, color: on ? theme.acc : theme.muted }}>{label}</Text>
    </Pressable>
  );
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
  // Swiping the open panel back to the left closes it; the chat screen behind
  // never sees these touches, so it carries its own responder for opening.
  const swipe = useDrawerSwipe({ open, onOpen: () => {}, onClose });

  useEffect(() => {
    Animated.timing(tx, { toValue: open ? 0 : -500, duration: 220, useNativeDriver: true }).start();
  }, [open, tx]);

  const list = useMemo(() => {
    const items = visibleSessions(store);
    const q = query.trim().toLowerCase();
    return q ? items.filter((s) => (s.title || "").toLowerCase().includes(q)) : items;
  }, [store, query]);

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
        { zIndex: 40, pointerEvents: open ? "auto" : "none" } as never,
      ]}
    >
      {/* Tied to the slide so the dim fades with the panel instead of blinking. */}
      <Animated.View
        style={[
          s.scrim,
          {
            backgroundColor: theme.scrim,
            opacity: tx.interpolate({ inputRange: [-500, 0], outputRange: [0, 1] }),
          },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          s.panel,
          { backgroundColor: theme.bg, borderRightColor: theme.bd, transform: [{ translateX: tx }] },
        ]}
        {...swipe.panHandlers}
      >
        <View style={[s.head, { paddingTop: 66 }]}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: theme.ink }}>{t("sessions.title")}</Text>
          <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [s.iconBtn, { backgroundColor: pressed ? theme.l2 : "transparent" }]}>
            <Icon name="close" size={14} color={theme.muted} />
          </Pressable>
        </View>

        {!store.connected ? (
          <ProjectStrip
            theme={theme}
            onNewSession={onNew}
            onOpenSession={(id) => {
              store.openSession(id);
              onClose();
            }}
          />
        ) : null}

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
  projects: { paddingHorizontal: 14, paddingBottom: 4 },
  projHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  projRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7, paddingHorizontal: 6, borderRadius: 7 },
  projMark: { width: 20, height: 20, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  projSub: { paddingVertical: 6, paddingHorizontal: 6, borderRadius: 6 },
  projInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 38, fontSize: 13 },
  projCreate: { height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  chip: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6 },
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
