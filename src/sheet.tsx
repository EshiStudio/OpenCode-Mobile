import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { t } from "./i18n";
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { BrandIcon, Icon } from "./icons";
import { Theme } from "./theme";
import { usePressScale } from "./ui";

export type SheetRow = {
  id: string;
  name: string;
  icon?: string;
  badge?: string;
  desc?: string;
  groupOf?: string;
  selected?: boolean;
  lead?: React.ReactNode;
  /**
   * Brand mark to draw at the head of the row. Prefer this over `lead` for
   * long lists: `lead` forces the caller to build an element per row up front,
   * which is what made the model sheet stall on providers with hundreds of
   * models. This is plain data, so the icon is only built for visible rows.
   */
  brand?: { id: string; colored?: boolean };
};

/** A group heading or a row — the flat shape the list is virtualized over. */
type Item =
  | { kind: "group"; key: string; label: string }
  | { kind: "row"; key: string; row: SheetRow };

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
  const [ty] = useState(() => new Animated.Value(1));
  // Children stay mounted until the sheet has finished sliding away, so the
  // closing animation is not an empty box; unmounting after also drops the
  // list, which is what keeps a long model list out of memory when closed.
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
    Animated.timing(ty, { toValue: open ? 0 : 1, duration: 200, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished && !open) setMounted(false);
      },
    );
  }, [open, ty]);

  const translateY = ty.interpolate({ inputRange: [0, 1], outputRange: [0, 620] });

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { zIndex: 30, pointerEvents: open ? "auto" : "none" } as never,
      ]}
    >
      <Animated.View
        style={[
          s.scrim,
          { backgroundColor: theme.scrim, opacity: ty.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          s.sheet,
          {
            backgroundColor: theme.bg,
            borderTopColor: theme.bd,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={{ width: 34, height: 4, borderRadius: 2, backgroundColor: theme.l3, alignSelf: "center", marginTop: 8, marginBottom: 6 }} />
        {title ? <Text style={[s.title, { color: theme.faint }]}>{title}</Text> : null}
        {mounted ? children : null}
      </Animated.View>
    </View>
  );
}

/** One row. Memoized so scrolling a long list does not re-render every sibling. */
const Row = React.memo(function Row({
  theme,
  row,
  onPick,
}: {
  theme: Theme;
  row: SheetRow;
  onPick: (row: SheetRow) => void;
}) {
  const { scale, handlers } = usePressScale(0.97);
  const lead =
    row.lead ||
    (row.brand ? (
      <BrandIcon providerID={row.brand.id} size={20} colored={row.brand.colored} color="#9a9a9a" />
    ) : row.icon ? (
      <Icon name={(row.icon as never) ?? "plus"} size={20} color={theme.muted} />
    ) : (
      <View style={{ width: 20 }} />
    ));

  return (
    <Pressable
      onPress={() => onPick(row)}
      {...handlers}
      style={({ pressed }) => ({
        borderRadius: 8,
        backgroundColor: pressed ? theme.l2 : "transparent",
      })}
    >
      {/* The scale lives on an inner view: an animated Pressable ignores the
          function form of `style`, which silently drops the row layout. */}
      <Animated.View style={[s.row, { transform: [{ scale }] }]}>
      {lead}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.rowTitle, { color: row.selected ? theme.acc : theme.ink }]} numberOfLines={1}>
          {row.name}
        </Text>
        {row.desc ? (
          <Text style={s.rowDesc} numberOfLines={1}>
            {row.desc}
          </Text>
        ) : null}
      </View>
      {row.badge ? (
        <Text style={[s.badge, { color: theme.muted, backgroundColor: theme.l2 }]}>{row.badge}</Text>
      ) : null}
      <View style={{ width: 20 }}>{row.selected ? <Icon name="check" size={14} color={theme.acc} /> : null}</View>
      </Animated.View>
    </Pressable>
  );
});

export function RowList({
  theme,
  rows,
  onPick,
  searchable,
  searchPlaceholder,
  emptyText = t("common.nothingFound"),
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
  // Typing stays responsive while a 6000-row list re-filters behind it.
  const query = useDeferredValue(q);

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const out: Item[] = [];
    let lastGroup: string | null = null;
    for (const r of rows) {
      if (needle && !r.name.toLowerCase().includes(needle)) continue;
      if (r.groupOf && r.groupOf !== lastGroup) {
        lastGroup = r.groupOf;
        out.push({ kind: "group", key: "g:" + r.groupOf, label: r.groupOf.toUpperCase() });
      }
      out.push({ kind: "row", key: r.id, row: r });
    }
    return out;
  }, [rows, query]);

  const renderItem = useCallback(
    ({ item }: { item: Item }) =>
      item.kind === "group" ? (
        <Text style={[s.group, { color: theme.faint }]}>{item.label}</Text>
      ) : (
        <Row theme={theme} row={item.row} onPick={onPick} />
      ),
    [theme, onPick],
  );

  return (
    <View style={{ flexShrink: 1, minHeight: 0 }}>
      {searchable ? (
        <View style={[s.search, { borderColor: theme.bdSoft }]}>
          <Icon name="magnifying-glass" size={14} color={theme.faint} />
          <TextInput
            autoFocus={false}
            value={q}
            onChangeText={setQ}
            placeholder={searchPlaceholder || t("common.search")}
            placeholderTextColor={theme.faint}
            style={{ flex: 1, color: theme.ink, fontSize: 13.5, marginLeft: 6 }}
          />
        </View>
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        style={{ flexGrow: 0, flexShrink: 1 }}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 12 }}
        // Only a screenful is mounted on open; the rest streams in as it scrolls.
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
        ListEmptyComponent={
          <Text style={{ textAlign: "center", color: theme.faint, padding: 22, fontSize: 13 }}>{emptyText}</Text>
        }
      />
      {footer ? (
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.bdSoft, marginTop: 8 }}>
          {footer}
        </View>
      ) : null}
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
    maxHeight: "82%",
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
