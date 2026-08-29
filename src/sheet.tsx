import React, { useEffect, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Icon } from "./icons";
import { Theme } from "./theme";

export type SheetRow = {
  id: string;
  name: string;
  icon?: string;
  badge?: string;
  desc?: string;
  groupOf?: string;
  selected?: boolean;
  lead?: React.ReactNode;
};

export function BottomSheet({
  theme,
  open,
  title,
  onClose,
  children,
}: {
  theme: Theme;
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [ty, setTy] = useState(new Animated.Value(0));
  useEffect(() => {
    Animated.timing(ty, { toValue: open ? 0 : 1, duration: 200, useNativeDriver: true }).start();
  }, [open, ty]);

  const translateY = ty.interpolate({ inputRange: [0, 1], outputRange: [0, 620] });

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { zIndex: 30, opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" } as never,
      ]}
    >
      <Animated.View style={[s.scrim, { backgroundColor: theme.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          s.sheet,
          {
            backgroundColor: theme.bg,
            borderTopColor: theme.bd,
            transform: [{ translateY }],
            opacity: open ? 1 : 0,
          },
        ]}
      >
        <View style={{ width: 34, height: 4, borderRadius: 2, backgroundColor: theme.l3, alignSelf: "center", marginTop: 8, marginBottom: 6 }} />
        {title ? <Text style={[s.title, { color: theme.faint }]}>{title}</Text> : null}
        {open ? children : null}
      </Animated.View>
    </View>
  );
}

export function RowList({
  theme,
  rows,
  onPick,
  searchable,
  searchPlaceholder,
  emptyText = "Ничего не найдено",
  footer,
}: {
  theme: Theme;
  rows: SheetRow[];
  onPick: (row: SheetRow) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  footer?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [scrollRef, setScrollRef] = useState<ScrollView | null>(null);
  const filtered = q.trim()
    ? rows.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()))
    : rows;

  let lastGroup: string | null = null;
  const sections: React.ReactNode[] = [];

  filtered.forEach((r) => {
    if (r.groupOf && r.groupOf !== lastGroup) {
      lastGroup = r.groupOf;
      sections.push(
        <Text key={"g" + r.groupOf} style={[s.group, { color: theme.faint }]}>
          {r.groupOf.toUpperCase()}
        </Text>,
      );
    }
    sections.push(
      <Pressable
        key={r.id}
        onPress={() => onPick(r)}
        style={({ pressed }) => [
          s.row,
          { backgroundColor: pressed ? theme.l2 : "transparent" },
        ]}
      >
        {r.lead || (r.icon ? <Icon name={(r.icon as never) ?? "plus"} size={20} color={theme.muted} /> : <View style={{ width: 20 }} />)}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[
              s.rowTitle,
              { color: r.selected ? theme.acc : theme.ink },
            ]}
            numberOfLines={1}
          >
            {r.name}
          </Text>
          {r.desc ? (
            <Text style={s.rowDesc} numberOfLines={1}>
              {r.desc}
            </Text>
          ) : null}
        </View>
        {r.badge ? (
          <Text style={[s.badge, { color: theme.muted, backgroundColor: theme.l2 }]}>{r.badge}</Text>
        ) : null}
        <View style={{ width: 20 }}>
          {r.selected ? <Icon name="check" size={14} color={theme.acc} /> : null}
        </View>
      </Pressable>,
    );
  });

  if (!sections.length) {
    sections.push(
      <Text key="empty" style={{ textAlign: "center", color: theme.faint, padding: 22, fontSize: 13 }}>
        {emptyText}
      </Text>,
    );
  }

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      {searchable ? (
        <View style={[s.search, { borderColor: theme.bdSoft }]}>
          <Icon name="magnifying-glass" size={14} color={theme.faint} />
          <TextInput
            autoFocus={false}
            value={q}
            onChangeText={setQ}
            placeholder={searchPlaceholder || "Поиск"}
            placeholderTextColor={theme.faint}
            style={{ flex: 1, color: theme.ink, fontSize: 13.5, marginLeft: 6 }}
          />
        </View>
      ) : null}
      <ScrollView
        ref={setScrollRef}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 12 }}
      >
        {sections}
      </ScrollView>
      {footer ? <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.bdSoft, marginTop: 8 }}>{footer}</View> : null}
    </View>
  );
}

const s = StyleSheet.create({
  scrim: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 1 },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    borderTopWidth: 1,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    height: "82%",
    paddingBottom: 20,
    overflow: "hidden",
  },
  title: { fontSize: 12, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 4 },
  group: {
    fontSize: 10.5,
    letterSpacing: 1.3,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 10,
    minHeight: 44,
    borderRadius: 8,
  },
  rowTitle: { fontSize: 14.5, letterSpacing: -0.2 },
  rowDesc: { fontSize: 11.5, color: "#9a9a9a", marginTop: 2 },
  badge: { fontSize: 11, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 14,
    marginBottom: 10,
    paddingHorizontal: 11,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
  },
});
