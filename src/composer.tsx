import React, { useEffect, useMemo, useRef, useState } from "react";
import { t } from "./i18n";
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BrandIcon, Icon, IconName } from "./icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardOffset, useKeyboardVisible } from "./keyboard";
import { Attachment } from "./store";
import { humanSize } from "./media";
import { Theme } from "./theme";
import { Avatar, usePressScale } from "./ui";
import { variantName } from "./store";

/** Breathing room between the input and the keys, so the two do not touch. */
const KEYBOARD_GAP = 14;

/** One line of text plus the input's own padding — keeps the box from jumping. */
const INPUT_MIN_HEIGHT = 42;

export type SlashCommandId = "help" | "clear" | "model" | "settings" | "branch" | "files" | "rename";

/** Registry of `/` commands. Add an entry here and a case in ChatScreen's onCommand to extend. */
export const SLASH_COMMANDS: { id: SlashCommandId; icon: IconName }[] = [
  { id: "model", icon: "models" },
  { id: "branch", icon: "branch" },
  { id: "files", icon: "open-file" },
  { id: "rename", icon: "pencil-line" },
  { id: "settings", icon: "settings-gear" },
  { id: "clear", icon: "close" },
  { id: "help", icon: "info" },
];

/** {@link https://code.visualstudio.com/api/references/icons-in-labels} для близких к десктопу иконок. */
function fileBadge(path: string): { icon: IconName; color: string; letter: string } {
  const ext = (path.split(".").pop() || "").toLowerCase();
  const name = path.split("/").pop() || path;
  const m: Record<string, { icon: IconName; color: string }> = {
    html: { icon: "link", color: "#e8722a" },
    htm: { icon: "link", color: "#e8722a" },
    md: { icon: "open-file", color: "#4a7ddb" },
    mdx: { icon: "open-file", color: "#4a7ddb" },
    ts: { icon: "code-lines", color: "#3178c6" },
    tsx: { icon: "code-lines", color: "#3178c6" },
    js: { icon: "code-lines", color: "#c9b13b" },
    jsx: { icon: "code-lines", color: "#c9b13b" },
    json: { icon: "code-lines", color: "#8f9aa5" },
    css: { icon: "code-lines", color: "#563d7c" },
    png: { icon: "photo", color: "#2f9e57" },
    jpg: { icon: "photo", color: "#2f9e57" },
    jpeg: { icon: "photo", color: "#2f9e57" },
    gif: { icon: "photo", color: "#2f9e57" },
    webp: { icon: "photo", color: "#2f9e57" },
    op: { icon: "new-session", color: "#3b6ff0" },
    pdf: { icon: "open-file", color: "#c24141" },
    txt: { icon: "terminal", color: "#8f9aa5" },
    log: { icon: "terminal", color: "#8f9aa5" },
    sh: { icon: "terminal", color: "#2f9e57" },
    ps1: { icon: "terminal", color: "#2f9e57" },
  };
  const hit = m[ext];
  if (hit) return { ...hit, letter: "" };
  if (!ext || ext === name) {
    // no extension at all — likely a directory, mark it as such
    return { icon: "folder", color: "#c9954a", letter: "" };
  }
  return { icon: "open-file", color: "#8f9aa5", letter: "" };
}

/** Finds an active `@file` or `/command` trigger ending right at the cursor. */
function detectTrigger(
  text: string,
  cursor: number,
): { kind: "@" | "/"; query: string; start: number } | null {
  const head = text.slice(0, cursor);
  // "/" only counts as a command trigger at the very start of the message —
  // elsewhere it is just a path separator.
  const slash = head.match(/^\/(\S*)$/);
  if (slash) return { kind: "/", query: slash[1], start: 0 };
  const at = head.match(/(^|\s)@(\S*)$/);
  if (at) return { kind: "@", query: at[2], start: cursor - at[2].length - 1 };
  return null;
}

export function Composer({
  theme,
  value,
  onChange,
  canSend,
  busy,
  modelName,
  providerID,
  variant,
  projectName,
  projectAv,
  brandMark,
  branch,
  attachments,
  onSend,
  onStop,
  onAttach,
  onPickModel,
  onPickVariant,
  onPickProject,
  onPickBranch,
  onRemoveAttach,
  onFilesQuery,
  onPickFile,
  onCommand,
}: {
  theme: Theme;
  value: string;
  onChange: (v: string) => void;
  canSend: boolean;
  busy: boolean;
  modelName: string;
  providerID: string;
  variant: string;
  projectName?: string;
  projectAv?: string;
  brandMark?: boolean;
  branch?: string | null;
  attachments: Attachment[];
  onSend: () => void;
  onStop: () => void;
  onAttach: () => void;
  onPickModel: () => void;
  onPickVariant: () => void;
  onPickProject: () => void;
  onPickBranch: () => void;
  onRemoveAttach: (index: number) => void;
  /** Searches the open project's files for the `@` picker. */
  onFilesQuery?: (query: string) => Promise<string[]>;
  /** A file was picked from the `@` picker: mention text is already inserted, this attaches its content. */
  onPickFile?: (path: string) => void;
  /** A `/` command was picked from the palette. */
  onCommand?: (id: SlashCommandId) => void;
}) {
  const inputRef = useRef<TextInput>(null);
  const kbOffset = useKeyboardOffset();
  // The project and branch row is context, not something you need mid-sentence.
  const typing = useKeyboardVisible();
  // Nothing else in the app reserves the gesture bar, so the composer sat right
  // on top of it. With the keyboard up the bar is covered anyway, so the inset
  // only applies at rest.
  const insets = useSafeAreaInsets();
  const send = usePressScale(0.88);

  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const trigger = useMemo(() => detectTrigger(value, selection.end), [value, selection.end]);
  const [fileRows, setFileRows] = useState<string[]>([]);

  useEffect(() => {
    if (!trigger || trigger.kind !== "@" || !onFilesQuery) {
      setFileRows([]);
      return;
    }
    let cancelled = false;
    onFilesQuery(trigger.query || "").then((res) => {
      if (!cancelled) setFileRows(res.slice(0, 8));
    });
    return () => {
      cancelled = true;
    };
  }, [trigger?.kind, trigger?.query, onFilesQuery]);

  const commandRows = useMemo(() => {
    if (!trigger || trigger.kind !== "/") return [];
    const q = trigger.query.toLowerCase();
    return SLASH_COMMANDS.filter((c) => !q || t(`composer.command.${c.id}`).toLowerCase().includes(q) || c.id.includes(q));
  }, [trigger?.kind, trigger?.query]);

  function pickFile(path: string) {
    if (!trigger) return;
    const insertion = `@${path} `;
    const next = value.slice(0, trigger.start) + insertion + value.slice(selection.end);
    onChange(next);
    onPickFile?.(path);
  }

  function pickCommand(id: SlashCommandId) {
    onChange("");
    onCommand?.(id);
  }

  return (
    <Animated.View style={{ paddingBottom: kbOffset }}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 10 + (typing ? KEYBOARD_GAP : insets.bottom) }}>
        {attachments.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 7, paddingBottom: 7 }}
          >
            {attachments.map((a, i) => (
              <AttachChip key={`${a.name}-${i}`} theme={theme} att={a} onRemove={() => onRemoveAttach(i)} />
            ))}
          </ScrollView>
        ) : null}

        {trigger && trigger.kind === "@" && fileRows.length > 0 ? (
          <View style={[s.suggest, { borderColor: theme.bd, backgroundColor: theme.bg }]}>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }}>
              {fileRows.map((f) => {
                const base = f.split("/").pop() || f;
                const dir = f.slice(0, f.length - base.length).replace(/\/+$/, "");
                const badge = fileBadge(f);
                return (
                  <Pressable
                    key={f}
                    onPress={() => pickFile(f)}
                    style={({ pressed }) => [s.suggestRow, { backgroundColor: pressed ? theme.l2 : "transparent" }]}
                  >
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: theme.l2,
                        flexShrink: 0,
                      }}
                    >
                      <Icon name={badge.icon} size={13} color={badge.color} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 12.5, color: theme.ink }} numberOfLines={1}>
                        {base}
                      </Text>
                      {dir ? (
                        <Text style={{ fontSize: 10.5, color: theme.faint, marginTop: 1 }} numberOfLines={1}>
                          {dir}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {trigger && trigger.kind === "/" && commandRows.length > 0 ? (
          <View style={[s.suggest, { borderColor: theme.bd, backgroundColor: theme.bg }]}>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }}>
              {commandRows.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => pickCommand(c.id)}
                  style={({ pressed }) => [s.suggestRow, { backgroundColor: pressed ? theme.l2 : "transparent" }]}
                >
                  <Icon name={c.icon} size={13} color={theme.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12.5, color: theme.ink }}>/{c.id}</Text>
                    <Text style={{ fontSize: 11, color: theme.faint }}>{t(`composer.command.${c.id}`)}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={[s.box, { borderColor: theme.bd, backgroundColor: theme.bg }]}>
          <TextInput
            ref={inputRef}
            multiline
            value={value}
            onChangeText={onChange}
            onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
            placeholder={t("composer.placeholder")}
            placeholderTextColor={theme.faint}
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: theme.ink,
              paddingHorizontal: 13,
              paddingTop: 11,
              paddingBottom: 6,
              minHeight: INPUT_MIN_HEIGHT,
              maxHeight: 140,
              textAlignVertical: "top",
            }}
          />
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 9, paddingBottom: 8, gap: 6 }}>
            <Pressable onPress={onAttach} style={({ pressed }) => [s.iconBtn, { backgroundColor: pressed ? theme.l2 : "transparent" }]}>
              <Icon name="plus" size={13} color={theme.muted} />
            </Pressable>

            <Pressable onPress={onPickModel} style={({ pressed }) => [s.sel, { backgroundColor: pressed ? theme.l3 : "transparent" }]}>
              {providerID ? <BrandIcon providerID={providerID} size={13} color={theme.muted} /> : null}
              <Text style={[s.selTxt, { color: theme.muted }]} numberOfLines={1}>
                {modelName}
              </Text>
              <Icon name="chevron-down" size={12} color={theme.faint} />
            </Pressable>

            <Pressable onPress={onPickVariant} style={({ pressed }) => [s.sel, { backgroundColor: pressed ? theme.l3 : "transparent" }]}>
              <Text style={[s.selTxt, { color: theme.muted }]} numberOfLines={1}>
                {variantName(variant)}
              </Text>
              <Icon name="chevron-down" size={12} color={theme.faint} />
            </Pressable>

            <View style={{ flex: 1 }} />

            {busy ? (
              <Pressable onPress={onStop} style={({ pressed }) => [s.btn, { backgroundColor: pressed ? theme.l2 : theme.sndOn }]}>
                <Icon name="stop" size={16} color="#ffffff" />
              </Pressable>
            ) : (
              <Pressable onPress={onSend} disabled={!canSend} {...send.handlers}>
                <Animated.View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: canSend ? theme.sndOn : theme.sndOff,
                    opacity: canSend ? 1 : 0.7,
                    transform: [{ scale: send.scale }],
                  }}
                >
                  <Icon name="arrow-up" size={16} color={canSend ? "#ffffff" : theme.muted} />
                </Animated.View>
              </Pressable>
            )}
          </View>
        </View>

        {typing ? null : (
        <View style={s.footWrap}>
          <Pressable
            onPress={onPickProject}
            style={({ pressed }) => [s.footBtn, { backgroundColor: pressed ? theme.l2 : "transparent" }]}
          >
            {projectAv ? <Avatar theme={theme} letter={projectAv} size={20} mark={brandMark} /> : null}
            <Text style={{ fontSize: 12.5, color: theme.muted }} numberOfLines={1}>
              {projectName}
            </Text>
            <Icon name="chevron-down" size={12} color={theme.faint} />
          </Pressable>
          {branch ? (
            <Pressable
              onPress={onPickBranch}
              style={({ pressed }) => [s.footBtn, { backgroundColor: pressed ? theme.l2 : "transparent" }]}
            >
              <Icon name="branch" size={14} color={theme.faint} />
              <Text style={{ fontSize: 12.5, color: theme.muted }} numberOfLines={1}>
                {branch}
              </Text>
            </Pressable>
          ) : null}
        </View>
        )}
      </View>
    </Animated.View>
  );
}

/** An attached file: photos show themselves, everything else shows a name and size. */
function AttachChip({ theme, att, onRemove }: { theme: Theme; att: Attachment; onRemove: () => void }) {
  const image = att.kind === "image" && att.uri;
  return (
    <View style={[s.att, { borderColor: theme.bdSoft, backgroundColor: theme.l1 }]}>
      {image ? (
        <Image source={{ uri: att.uri }} style={{ width: 26, height: 26, borderRadius: 5 }} />
      ) : (
        <Icon name={att.kind === "link" ? "link" : "open-file"} size={14} color={theme.muted} />
      )}
      <View style={{ maxWidth: 150 }}>
        <Text style={{ fontSize: 11.5, color: theme.ink }} numberOfLines={1}>
          {att.name}
        </Text>
        {att.size ? <Text style={{ fontSize: 10, color: theme.faint }}>{humanSize(att.size)}</Text> : null}
      </View>
      <Pressable onPress={onRemove} hitSlop={8}>
        <Icon name="close" size={13} color={theme.faint} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  suggest: {
    borderWidth: 1,
    borderRadius: 9,
    marginBottom: 7,
    overflow: "hidden",
  },
  suggestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  box: {
    borderWidth: 1,
    borderRadius: 7,
    overflow: "hidden",
  },
  iconBtn: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 30,
    paddingHorizontal: 7,
    borderRadius: 8,
  },
  selTxt: { fontSize: 12.5, maxWidth: 130 },
  btn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  att: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  footWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  footBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 8,
    maxWidth: "55%",
  },
});
