import React, { useState } from "react";
import * as Clipboard from "expo-clipboard";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { t } from "./i18n";
import { Icon } from "./icons";
import { Theme } from "./theme";
import { downloadToDevice } from "./media";
import { mono } from "./ui";

/**
 * Just enough Markdown for model output: fenced code, headings, bullet and
 * numbered lists, block quotes, rules. Anything else falls through to
 * InlineText, which already handles inline code and links.
 *
 * A full Markdown library would pull in a parser and a renderer for syntax the
 * models here never emit; this walks the lines once instead.
 */

/**
 * Splits on inline code, bold, italic, and links in one pass. Order matters:
 * code spans first (their contents are never touched), then bold before
 * italic so `**x**` doesn't get read as an italic-wrapped single asterisk.
 */
const CHUNKS = /(`[^`]*`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|https?:\/\/[^\s<>()"']+)/;

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

/**
 * Whether an inline-code span reads as a file path worth making tappable:
 * a bare `name.ext` or a path with slashes, no spaces, no scheme.
 */
export function looksLikeFilePath(s: string): boolean {
  if (!s || s.length > 200 || /\s/.test(s) || /^[a-z]+:\/\//i.test(s)) return false;
  return /[\\/]/.test(s) || /^[\w.\-]+\.[A-Za-z0-9]{1,8}$/.test(s);
}

export function InlineText({ text, theme, onFilePress }: { text: string; theme: Theme; onFilePress?: (path: string) => void }) {
  const parts = text.split(CHUNKS);
  return (
    <Text style={{ fontSize: 14, lineHeight: 21, color: theme.ink }}>
      {parts.map((p, i) => {
        if (p.startsWith("`") && p.endsWith("`") && p.length > 2) {
          const code = p.slice(1, -1);
          if (onFilePress && looksLikeFilePath(code)) {
            return (
              <Text
                key={i}
                style={[mono, { fontSize: 12.5, color: theme.acc, textDecorationLine: "underline" }]}
                onPress={() => onFilePress(code)}
              >
                {code}
              </Text>
            );
          }
          return (
            <Text key={i} style={[mono, { fontSize: 12.5, color: theme.muted }]}>
              {code}
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
        if ((p.startsWith("**") && p.endsWith("**") && p.length > 4) || (p.startsWith("__") && p.endsWith("__") && p.length > 4)) {
          return (
            <Text key={i} style={{ fontWeight: "700", color: theme.acc }}>
              {p.slice(2, -2)}
            </Text>
          );
        }
        if ((p.startsWith("*") && p.endsWith("*") && p.length > 2) || (p.startsWith("_") && p.endsWith("_") && p.length > 2)) {
          return (
            <Text key={i} style={{ fontStyle: "italic" }}>
              {p.slice(1, -1)}
            </Text>
          );
        }
        return <Text key={i}>{p}</Text>;
      })}
    </Text>
  );
}

type Block =
  | { kind: "code"; lang: string; text: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "quote"; text: string }
  | { kind: "rule" }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "para"; text: string };

const FENCE = /^\s*```(\w*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])\1{2,}\s*$/;

export function parseBlocks(src: string): Block[] {
  const lines = src.split(/\r?\n/);
  const out: Block[] = [];
  let para: string[] = [];

  const flush = () => {
    if (para.length) {
      out.push({ kind: "para", text: para.join("\n").trim() });
      para = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = line.match(FENCE);
    if (fence) {
      flush();
      const lang = fence[1] || "";
      const body: string[] = [];
      i++;
      // An unterminated fence still renders — models truncate mid-block.
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
      out.push({ kind: "code", lang, text: body.join("\n") });
      continue;
    }

    if (RULE.test(line)) {
      flush();
      out.push({ kind: "rule" });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      flush();
      out.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }

    const quote = line.match(QUOTE);
    if (quote) {
      flush();
      const body = [quote[1]];
      while (i + 1 < lines.length && QUOTE.test(lines[i + 1])) {
        body.push(lines[++i].match(QUOTE)![1]);
      }
      out.push({ kind: "quote", text: body.join("\n") });
      continue;
    }

    const bullet = line.match(BULLET);
    const numbered = line.match(NUMBERED);
    if (bullet || numbered) {
      flush();
      const ordered = !!numbered;
      const items: string[] = [bullet ? bullet[1] : numbered![2]];
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        const nb = next.match(BULLET);
        const nn = next.match(NUMBERED);
        if (ordered ? !nn : !nb) break;
        items.push(ordered ? nn![2] : nb![1]);
        i++;
      }
      out.push({ kind: "list", ordered, items });
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }
    para.push(line);
  }

  flush();
  return out;
}

/** A fenced block: its own frame, horizontal scroll, and a copy button. */
function CodeBlock({ theme, lang, text }: { theme: Theme; lang: string; text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <View style={[s.code, { borderColor: theme.bdSoft, backgroundColor: theme.l1 }]}>
      <View style={[s.codeHead, { borderBottomColor: theme.bdSoft }]}>
        <Text style={[mono, { fontSize: 11, color: theme.faint, flex: 1 }]} numberOfLines={1}>
          {lang || t("code.plain")}
        </Text>
        <Pressable onPress={copy} hitSlop={8} style={s.copyBtn}>
          <Icon name={copied ? "check" : "copy"} size={13} color={copied ? theme.acc : theme.muted} />
          <Text style={{ fontSize: 11.5, color: copied ? theme.acc : theme.muted }}>
            {t(copied ? "code.copied" : "code.copy")}
          </Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 10 }}>
        <Text style={[mono, { fontSize: 12.5, lineHeight: 18, color: theme.ink }]}>{text}</Text>
      </ScrollView>
    </View>
  );
}

export function Markdown({ text, theme, onFilePress }: { text: string; theme: Theme; onFilePress?: (path: string) => void }) {
  const blocks = React.useMemo(() => parseBlocks(text), [text]);

  return (
    <View style={{ gap: 8 }}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "code":
            return <CodeBlock key={i} theme={theme} lang={b.lang} text={b.text} />;
          case "heading":
            return (
              <Text
                key={i}
                style={{
                  fontSize: b.level <= 1 ? 18 : b.level === 2 ? 16 : 14.5,
                  fontWeight: "600",
                  color: theme.ink,
                  marginTop: i ? 4 : 0,
                }}
              >
                {b.text}
              </Text>
            );
          case "rule":
            return <View key={i} style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.bd }} />;
          case "quote":
            return (
              <View key={i} style={[s.quote, { borderLeftColor: theme.bd }]}>
                <InlineText text={b.text} theme={theme} onFilePress={onFilePress} />
              </View>
            );
          case "list":
            return (
              <View key={i} style={{ gap: 4 }}>
                {b.items.map((item, j) => (
                  <View key={j} style={s.listRow}>
                    <Text style={{ fontSize: 14, lineHeight: 21, color: theme.faint, minWidth: 18 }}>
                      {b.ordered ? `${j + 1}.` : "•"}
                    </Text>
                    <View style={{ flex: 1 }}>
                      <InlineText text={item} theme={theme} onFilePress={onFilePress} />
                    </View>
                  </View>
                ))}
              </View>
            );
          default:
            return <InlineText key={i} text={b.text} theme={theme} onFilePress={onFilePress} />;
        }
      })}
    </View>
  );
}

const s = StyleSheet.create({
  code: { borderWidth: 1, borderRadius: 9, overflow: "hidden" },
  codeHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  quote: { borderLeftWidth: 3, paddingLeft: 10, opacity: 0.9 },
  listRow: { flexDirection: "row", gap: 6 },
});
