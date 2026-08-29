import React, { useRef } from "react";
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
import { BrandIcon, Icon } from "./icons";
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

        <View style={[s.box, { borderColor: theme.bd, backgroundColor: theme.bg }]}>
          <TextInput
            ref={inputRef}
            multiline
            value={value}
            onChangeText={onChange}
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
