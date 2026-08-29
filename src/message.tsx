import React, { useState } from "react";
import { t } from "./i18n";
import { Alert, Animated, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Icon, IconName } from "./icons";
import { downloadToDevice } from "./media";
import { mono } from "./ui";
import { Theme } from "./theme";
import { Part, StoredMessage } from "./types";

/** Splits on inline code first, then on links, so both survive in one pass. */
const CHUNKS = /(`[^`]*`|https?:\/\/[^\s<>()"']+)/;

/** Offers what a link is good for: opening it, or putting the file on the phone. */
export function linkActions(url: string) {
  Alert.alert(url.length > 60 ? url.slice(0, 60) + "…" : url, undefined, [
    { text: t("common.open"), onPress: () => Linking.openURL(url).catch(() => {}) },
    {
      text: t("common.download"),
      onPress: async () => {
        const res = await downloadToDevice(url);
        Alert.alert(res.saved ? t("message.saved") : t("message.notSaved"), res.saved ? undefined : res.reason);
      },
    },
    { text: t("common.cancel"), style: "cancel" },
  ]);
}

export function InlineText({ text, theme }: { text: string; theme: Theme }) {
  const parts = text.split(CHUNKS);
  return (
    <Text style={{ fontSize: 14, lineHeight: 21, color: theme.ink }}>
      {parts.map((p, i) => {
        if (p.startsWith("`") && p.endsWith("`") && p.length > 2) {
          return (
            <Text key={i} style={[mono, { fontSize: 12.5, color: theme.muted }]}>
              {p.slice(1, -1)}
            </Text>
          );
        }
        if (/^https?:\/\//.test(p)) {
          return (
            <Text key={i} style={{ color: theme.acc }} onPress={() => linkActions(p)}>
              {p}
            </Text>
          );
        }
        return <Text key={i}>{p}</Text>;
      })}
    </Text>
  );
}

function ToolIcon(tool: string): IconName {
  switch (tool) {
    case "read": return "open-file";
    case "grep": return "magnifying-glass";
    case "glob": case "ls": return "folder" as IconName;
    case "edit": return "pencil-line";
    case "bash": case "shell": return "terminal";
    case "webimport": return "link";
    case "mcp": return "providers";
    default: return "terminal";
  }
}

function toolTitle(tool: string, inp: Record<string, unknown> | undefined): string {
  if (!inp) return tool;
  if (!inp) return tool;
  const keys = Object.keys(inp);
  if (!keys.length) return tool;
  const v = inp[keys[0]];
  const s = typeof v === "string" ? v : JSON.stringify({ v });
  return `${tool} · ${s.length > 60 ? s.slice(0, 60) + "…" : s}`;
}

export function ToolChip({ theme, part, collapsed }: { theme: Theme; part: Extract<Part, { type: "tool" }>; collapsed: boolean }) {
  const st = part.state;
  const name = toolTitle(part.tool, st.input);
  const running = st.status === "running" || st.status === "pending";
  const err = st.status === "error";
  const done = st.status === "completed";
  return (
    <View style={[s.toolRow, { backgroundColor: err ? theme.errBg : done && part.tool === "edit" ? theme.okBg : "transparent" }]}>
      <View style={[s.toolAv, err ? { backgroundColor: theme.err } : { backgroundColor: done && part.tool === "edit" ? theme.ok : theme.l3 }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 12, color: theme.ink, fontWeight: "600" }} numberOfLines={1}>
          {part.tool}
        </Text>
        <Text style={{ fontSize: 11.5, color: err ? theme.err : theme.faint, marginTop: 1 }} numberOfLines={collapsed ? 1 : 4}>
          {err ? String(st.error || t("message.error")) : name}
        </Text>
      </View>
      <Icon name="chevron-down" size={12} color={theme.faint} />
    </View>
  );
}

export function ReasoningBlock({ theme, text }: { theme: Theme; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable onPress={() => setOpen(!open)} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 12 }}>
      <Icon name="brain" size={14} color={theme.faint} />
      <Text style={{ fontSize: 12, color: theme.faint }}>
        {open ? text : t("message.thinking", { text: text.length > 32 ? text.slice(0, 32) + "…" : text })}
      </Text>
      <Icon name={open ? "chevron-down" : "chevron-down"} size={12} color={theme.faint} />
    </Pressable>
  );
}

export function MessageView({
  theme,
  msg,
  expanded,
  onToggle,
  showReasoning = true,
  expandShell = false,
  expandEdit = false,
}: {
  theme: Theme;
  msg: StoredMessage;
  expanded: boolean;
  onToggle?: () => void;
  showReasoning?: boolean;
  expandShell?: boolean;
  expandEdit?: boolean;
}) {
  const isUser = msg.info.role === "user";
  if (isUser) {
    const text = msg.parts.find((p) => p.type === "text");
    const file = msg.parts.find((p) => p.type === "file");
    return (
      <View style={{ marginVertical: 10, alignItems: "flex-end" }}>
        <View
          style={[
            s.userBubble,
            { backgroundColor: theme.l2 },
          ]}
        >
          {file && (
            <View style={s.attRow}>
              <Icon name="open-file" size={14} color={theme.muted} />
              <Text style={[mono, { fontSize: 11.5, color: theme.muted, flex: 1 }]} numberOfLines={1}>
                {file.filename || file.url}
              </Text>
            </View>
          )}
          {text && text.type === "text" ? (
            <Text style={{ fontSize: 14, color: theme.ink, lineHeight: 21 }}>{text.text}</Text>
          ) : null}
        </View>
      </View>
    );
  }

  const texts: string[] = [];
  const tools = msg.parts.filter((p): p is Extract<Part, { type: "tool" }> => p.type === "tool");
  const reasoning = showReasoning ? msg.parts.filter((p): p is Extract<Part, { type: "reasoning" }> => p.type === "reasoning") : [];
  for (const p of msg.parts) if (p.type === "text") texts.push(p.text);
  const retry = msg.parts.find((p) => p.type === "retry");
  const errored = !!msg.info.error && !msg.info.time?.completed;

  const isExpandedTool = (t: string) => {
    if (t === "shell" || t === "bash") return expandShell;
    if (t === "edit" || t === "write" || t === "patch") return expandEdit;
    return expanded;
  };

  return (
    <View style={{ marginVertical: 10 }}>
      {tools.length > 0 && (
        <View style={{ marginBottom: 8, gap: 6 }}>
          {tools.slice(0, expanded ? tools.length : 4).map((t) => (
            <ToolChip key={t.id} theme={theme} part={t} collapsed={!isExpandedTool(t.tool)} />
          ))}
        </View>
      )}
      {reasoning.map((r) => (
        <ReasoningBlock key={r.id} theme={theme} text={r.text} />
      ))}
      {texts.map((t, i) => (
        <View key={i} style={{ marginVertical: 8 }}>
          <InlineText text={t} theme={theme} />
        </View>
      ))}
      {errored && (
        <View style={[s.errorBox, { backgroundColor: theme.errBg }]}>
          <Icon name="warning" size={14} color={theme.err} />
          <Text style={{ color: theme.err, fontSize: 12.5, flex: 1 }}>{msg.info.error}</Text>
        </View>
      )}
      {retry && (
        <View style={{ marginVertical: 8 }}>
          <Text style={{ color: theme.warn, fontSize: 12 }}>
            {t("message.retry", {
              attempt: retry instanceof Object && "attempt" in retry ? String((retry as { attempt: number }).attempt) : "",
            })}
          </Text>
        </View>
      )}
    </View>
  );
}

export function PendingShim({ theme }: { theme: Theme }) {
  const pulse = React.useRef(new Animated.Value(0.3)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.9, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={{ marginVertical: 16 }}>
      <Animated.View style={[s.shim, { backgroundColor: theme.l3, opacity: pulse }]} />
      <Animated.View style={[s.shim, { backgroundColor: theme.l3, width: "38%", opacity: pulse }]} />
    </View>
  );
}

const s = StyleSheet.create({
  userBubble: {
    maxWidth: "86%",
    alignSelf: "flex-end",
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 10,
    gap: 6,
  },
  attRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 2,
  },
  toolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(128,128,128,0.15)",
  },
  toolAv: { width: 8, height: 8, borderRadius: 3 },
  att: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 7,
    borderRadius: 7,
    borderWidth: 1,
    marginBottom: 7,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 9,
    borderRadius: 8,
    marginVertical: 6,
  },
  shim: {
    height: 11,
    borderRadius: 3,
    width: "58%",
    marginVertical: 8,
  },
});
