import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Icon, IconName } from "./icons";
import { Theme } from "./theme";

export const tiny = { fontFamily: "monospace" } as const;
export const mono = { fontFamily: "monospace" } as const;

export function IconButton({
  theme,
  name,
  size = 18,
  onPress,
  label,
  style,
  color,
}: {
  theme: Theme;
  name: IconName;
  size?: number;
  onPress?: () => void;
  label: string;
  style?: ViewStyle;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: 34,
          height: 34,
          borderRadius: 9,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? theme.l2 : "transparent",
        },
        style,
      ]}
    >
      <Icon name={name} size={size} color={color || theme.muted} />
    </Pressable>
  );
}

export function Avatar({ theme, letter, size = 20 }: { theme: Theme; letter: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 5,
        backgroundColor: theme.avBg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: theme.avFg, fontSize: size * 0.52, fontWeight: "600" }}>{letter}</Text>
    </View>
  );
}

export function Badge({ theme, children }: { theme: Theme; children: string }) {
  return (
    <Text style={[s.badge, { color: theme.muted, backgroundColor: theme.l2 }]}>{children}</Text>
  );
}

export function Spinner({ size = 13, color }: { size?: number; color: string }) {
  return <ActivityIndicator size="small" color={color} style={{ width: size, height: size, transform: [{ scale: size / 20 }] }} />;
}

export function Wordmark({ theme }: { theme: Theme }) {
  const GLYPH: Record<string, { top: number; rows: string[] }> = {
    o: { top: 2, rows: ["11111", "10001", "10001", "10001", "11111"] },
    p: { top: 2, rows: ["11111", "10001", "10001", "10001", "11111", "10000", "10000"] },
    e: { top: 2, rows: ["11111", "10001", "11111", "10000", "11111"] },
    n: { top: 2, rows: ["11111", "10001", "10001", "10001", "10001"] },
    c: { top: 2, rows: ["11111", "10000", "10000", "10000", "11111"] },
    d: { top: 0, rows: ["00001", "00001", "11111", "10001", "10001", "10001", "11111"] },
  };
  const word = "opencode";
  const ROWS = 9;
  return (
    <View style={{ flexDirection: "row", gap: 7 }}>
      {word.split("").map((ch, wi) => {
        const def = GLYPH[ch];
        return (
          <View key={wi} style={{ flexDirection: "row", flexWrap: "wrap", width: 30, height: ROWS * 6 }}>
            {Array.from({ length: ROWS * 5 }).map((_, i) => {
              const r = Math.floor(i / 5);
              const c = i % 5;
              const src = r - def.top;
              const on = src >= 0 && src < def.rows.length && def.rows[src][c] === "1";
              return (
                <View
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    backgroundColor: on ? theme.wm : "transparent",
                  }}
                />
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    fontSize: 11,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 8,
  },
});
