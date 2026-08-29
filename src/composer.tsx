import React, { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BrandIcon, Icon } from "./icons";
import { Attachment } from "./store";
import { Theme } from "./theme";
import { Avatar } from "./ui";
import { variantName } from "./store";

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
  branch,
  attachment,
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
  branch?: string | null;
  attachment: Attachment | null;
  onSend: () => void;
  onStop: () => void;
  onAttach: () => void;
  onPickModel: () => void;
  onPickVariant: () => void;
  onPickProject: () => void;
  onPickBranch: () => void;
  onRemoveAttach: () => void;
}) {
  const inputRef = useRef<TextInput>(null);

  return (
    <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={0}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
        {attachment ? (
          <View style={[s.att, { borderColor: theme.bdSoft, backgroundColor: theme.l1 }]}>
            <Icon name={attachment.kind === "file" ? "open-file" : "link"} size={14} color={theme.muted} />
            <Text style={{ flex: 1, fontSize: 11.5, color: theme.muted, fontFamily: "monospace" }} numberOfLines={1}>
              {attachment.name}
            </Text>
            <Pressable onPress={onRemoveAttach} hitSlop={8}>
              <Icon name="close" size={14} color={theme.faint} />
            </Pressable>
          </View>
        ) : null}

        <View style={[s.box, { borderColor: theme.bd, backgroundColor: theme.bg }]}>
          <TextInput
            ref={inputRef}
            multiline
            value={value}
            onChangeText={onChange}
            placeholder="Спросите что угодно, / — команды, @ — контекст…"
            placeholderTextColor={theme.faint}
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: theme.ink,
              padding: 13,
              paddingBottom: 6,
              maxHeight: 120,
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
              <Pressable
                onPress={onSend}
                disabled={!canSend}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: canSend ? theme.sndOn : theme.sndOff,
                  opacity: canSend ? 1 : 0.7,
                }}
              >
                <Icon name="arrow-up" size={16} color={canSend ? "#ffffff" : theme.muted} />
              </Pressable>
            )}
          </View>
        </View>

        <View style={s.footWrap}>
          <Pressable
            onPress={onPickProject}
            style={({ pressed }) => [s.footBtn, { backgroundColor: pressed ? theme.l2 : "transparent" }]}
          >
            {projectAv ? <Avatar theme={theme} letter={projectAv} size={20} /> : null}
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
      </View>
    </KeyboardAvoidingView>
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
    gap: 9,
    padding: 7,
    borderRadius: 7,
    borderWidth: 1,
    marginBottom: 7,
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
