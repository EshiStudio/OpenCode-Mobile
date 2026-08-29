import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Connection } from "./src/api";
import { StoreProvider, useStore } from "./src/store";
import { makeTheme } from "./src/theme";
import { Lang, setLocale, t } from "./src/i18n";
import { ChatScreen } from "./src/chat";
import { UpdateOverlay } from "./src/update-overlay";
import {
  loadConnection,
  loadSaved,
  clearConnection,
  saveConnection,
  loadTheme,
  saveTheme,
  loadLang,
  saveLang,
  saveCrash,
  loadCrash,
  clearCrash,
  CrashReport,
} from "./src/storage";

/**
 * In a release build an error thrown outside React render kills the process with
 * no message. Persist it so the next launch can show what happened.
 */
function installGlobalHandler() {
  const g = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler: () => (e: unknown, fatal?: boolean) => void;
      setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void;
    };
    __ocmHandlerInstalled?: boolean;
  };
  if (!g.ErrorUtils || g.__ocmHandlerInstalled) return;
  g.__ocmHandlerInstalled = true;
  const prev = g.ErrorUtils.getGlobalHandler();
  g.ErrorUtils.setGlobalHandler((e, fatal) => {
    const err = e instanceof Error ? e : new Error(String(e));
    saveCrash({
      message: err.message,
      stack: String(err.stack || "")
        .split("\n")
        .slice(0, 12)
        .join("\n"),
      when: Date.now(),
      fatal: Boolean(fatal),
    });
    prev(e, fatal);
  });
}
installGlobalHandler();

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  state: { err: Error | null } = { err: null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error) {
    saveCrash({
      message: err.message,
      stack: String(err.stack || "")
        .split("\n")
        .slice(0, 12)
        .join("\n"),
      when: Date.now(),
      fatal: false,
    });
  }
  render() {
    if (this.state.err) {
      return (
        <SafeAreaProvider>
          <View style={{ flex: 1, backgroundColor: "#0c0c0c", padding: 24, justifyContent: "center" }}>
            <Text style={{ color: "#f0f0f0", fontSize: 16, fontWeight: "600", marginBottom: 10 }}>{t("app.error.title")}</Text>
            <Text style={{ color: "#f1484f", fontSize: 12.5, fontFamily: "monospace", marginBottom: 8 }}>
              {String(this.state.err?.message || this.state.err)}
            </Text>
            <Text style={{ color: "#9a9a9a", fontSize: 11, fontFamily: "monospace" }}>
              {String(this.state.err?.stack || "").split("\n").slice(0, 6).join("\n")}
            </Text>
            <Pressable
              style={{ marginTop: 16, padding: 10, borderRadius: 8, backgroundColor: "#242424", alignItems: "center" }}
              onPress={() => this.setState({ err: null })}
            >
              <Text style={{ color: "#f0f0f0", fontSize: 14 }}>{t("common.continue")}</Text>
            </Pressable>
          </View>
        </SafeAreaProvider>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [conn, setConn] = useState<Connection | null>(null);
  const [dark, setDark] = useState(false);
  const [lang, setLangState] = useState<Lang>("en");
  const [ready, setReady] = useState(false);
  const [crash, setCrash] = useState<CrashReport | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const report = await loadCrash();
        if (report && Date.now() - report.when < 1000 * 60 * 60 * 24) setCrash(report);
        const c = await loadConnection();
        if (c) setConn(c);
        const savedTheme = await loadTheme();
        if (savedTheme) setDark(savedTheme === "dark");
        // The locale must be set before the first render: plain functions read it.
        const savedLang = await loadLang();
        if (savedLang) {
          setLocale(savedLang);
          setLangState(savedLang);
        }
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const handleConnectionFailure = useCallback(() => setConn(null), []);
  const dismissCrash = useCallback(() => {
    clearCrash();
    setCrash(null);
  }, []);

  const setThemeDark = useCallback((d: boolean) => {
    setDark(d);
    saveTheme(d ? "dark" : "light");
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLocale(l);
    setLangState(l);
    saveLang(l);
  }, []);

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0c0c0c" }}>
          <ActivityIndicator color="#8f8f8f" />
        </View>
      </SafeAreaProvider>
    );
  }

  const theme = makeTheme(dark);

  if (crash) {
    return (
      <SafeAreaProvider>
        <StatusBar style={dark ? "light" : "dark"} />
        <CrashReportScreen theme={theme} report={crash} onDismiss={dismissCrash} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={dark ? "light" : "dark"} />
      <ErrorBoundary>
        <DeviceFrame theme={theme}>
          <StoreProvider conn={conn ?? null} onConnectionFailure={handleConnectionFailure}>
            <ConnectedShell
              theme={theme}
              dark={dark}
              setDark={setThemeDark}
              lang={lang}
              setLang={setLang}
              onDisconnect={() => setConn(null)}
            />
          </StoreProvider>
          <UpdateOverlay theme={theme} />
        </DeviceFrame>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

function CrashReportScreen({
  theme,
  report,
  onDismiss,
}: {
  theme: ReturnType<typeof makeTheme>;
  report: CrashReport;
  onDismiss: () => void;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, padding: 24, justifyContent: "center", gap: 12 }}>
      <Text style={{ color: theme.ink, fontSize: 18, fontWeight: "600" }}>{t("app.crash.title")}</Text>
      <Text style={{ color: theme.faint, fontSize: 12.5 }}>
        {t(report.fatal ? "app.crash.fatal" : "app.crash.caught")} · {new Date(report.when).toISOString().slice(0, 19).replace("T", " ")}
      </Text>
      <Text selectable style={{ color: theme.err, fontSize: 13, fontFamily: "monospace" }}>
        {report.message}
      </Text>
      <Text selectable style={{ color: theme.muted, fontSize: 10.5, fontFamily: "monospace", lineHeight: 15 }}>
        {report.stack}
      </Text>
      <Pressable
        onPress={onDismiss}
        style={{ marginTop: 10, height: 44, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: theme.sndOn }}
      >
        <Text style={{ color: "#fff", fontSize: 14.5, fontWeight: "600" }}>{t("common.continue")}</Text>
      </Pressable>
    </View>
  );
}

const WEB = Platform.OS === "web";

/** Centres the app in a device-sized frame when it runs in a desktop browser. */
function DeviceFrame({ children, theme }: { children: React.ReactNode; theme: ReturnType<typeof makeTheme> }) {
  if (!WEB) return <>{children}</>;
  return (
    <View style={{ flex: 1, alignItems: "center", backgroundColor: theme.l1 }}>
      <View
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 430,
          backgroundColor: theme.bg,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: theme.bd,
        }}
      >
        {children}
      </View>
    </View>
  );
}

function ConnectedShell({
  theme,
  dark,
  setDark,
  lang,
  setLang,
  onDisconnect,
}: {
  theme: ReturnType<typeof makeTheme>;
  dark: boolean;
  setDark: (d: boolean) => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  onDisconnect: () => void;
}) {
  const store = useStore();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top }}>
      <ChatScreen theme={theme} dark={dark} setDark={setDark} lang={lang} setLang={setLang} />
    </View>
  );
}

function ConnectingView({ theme, error, retry, onDisconnect }: { theme: ReturnType<typeof makeTheme>; error: string | null; retry: never; onDisconnect: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 18, padding: 30 }}>
      <ActivityIndicator color={theme.faint} />
      <Text style={{ fontSize: 14, color: theme.muted, textAlign: "center" as const }}>{error || t("app.connecting")}</Text>
      {error ? (
        <Pressable
          style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: theme.l2, borderWidth: 1, borderColor: theme.bd }}
          onPress={retry as never}
        >
          <Text style={{ color: theme.ink, fontSize: 13.5 }}>{t("common.retry")}</Text>
        </Pressable>
      ) : null}
      <Pressable
        style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: theme.l2, borderWidth: 1, borderColor: theme.bd }}
        onPress={onDisconnect}
      >
        <Text style={{ color: theme.ink, fontSize: 13.5 }}>{t("app.changeServer")}</Text>
      </Pressable>
    </View>
  );
}

function ConnectScreen({
  theme,
  onConnected,
  dark,
  setDark,
}: {
  theme: ReturnType<typeof makeTheme>;
  dark: boolean;
  setDark: (d: boolean) => void;
  onConnected: (c: Connection) => void;
}) {
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("opencode");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSaved().then((s) => {
      const envHost = process.env.EXPO_PUBLIC_OCM_HOST || "";
      if (s) {
        setHost(s.host);
        setUsername(s.username);
      } else if (envHost) {
        setHost(envHost);
      }
    });
  }, []);

  const connect = async () => {
    if (!host.trim()) {
      setError(t("app.connect.enterHost"));
      return;
    }
    setBusy(true);
    setError(null);
    const c: Connection = {
      host: host.trim().replace(/\/+$/, ""),
      username: username.trim() || "opencode",
      password,
    };
    try {
      const { Api } = await import("./src/api");
      const api = new Api(c);
      await api.health();
      await saveConnection(c);
      onConnected(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("app.connect.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <View style={[styles.connect, { backgroundColor: theme.bg }]}>
        <View style={{ width: "100%", maxWidth: 460, gap: 14 }}>
          <Text style={{ fontSize: 24, fontWeight: "600", letterSpacing: -0.6, color: theme.ink }}>OpenCode Mobile</Text>
          <Text style={{ fontSize: 13, color: theme.faint, lineHeight: 19 }}>
            {t("app.connect.intro")}
          </Text>
          <Text style={{ fontFamily: "monospace", fontSize: 11.5, color: theme.muted, backgroundColor: theme.l1, padding: 10, borderRadius: 7 }}>
            opencode serve --hostname 0.0.0.0 --port 41111
          </Text>

          <Field theme={theme} label={t("app.connect.host")} value={host} onChange={setHost} placeholder="http://192.168.1.20:41111" autoCapitalize="none" />
          <Field theme={theme} label={t("app.connect.user")} value={username} onChange={setUsername} placeholder="opencode" autoCapitalize="none" />
          <Field theme={theme} label={t("app.connect.password")} value={password} onChange={setPassword} placeholder="••••••••" secure />

          {error ? <Text style={{ fontSize: 12.5, color: theme.err }}>{error}</Text> : null}

          <Pressable
            onPress={connect}
            disabled={busy}
            style={{
              height: 46,
              borderRadius: 9,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.sndOn,
              marginTop: 4,
            }}
          >
            {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={{ color: "#fff", fontSize: 14.5, fontWeight: "600" }}>{t("app.connect.action")}</Text>}
          </Pressable>

          <Pressable onPress={() => setDark(!dark)} style={{ marginTop: 6, alignItems: "center" }}>
            <Text style={{ color: theme.faint, fontSize: 13 }}>
              {t("app.theme.toggle", { name: t(dark ? "app.theme.dark" : "app.theme.light") })}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({
  theme,
  label,
  value,
  onChange,
  placeholder,
  secure,
  autoCapitalize,
}: {
  theme: ReturnType<typeof makeTheme>;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  secure?: boolean;
  autoCapitalize?: "none";
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 11.5, color: theme.faint }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.faint}
        secureTextEntry={secure}
        autoCapitalize={autoCapitalize || "none"}
        autoCorrect={false}
        style={{
          height: 44,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.bd,
          paddingHorizontal: 12,
          fontSize: 14,
          color: theme.ink,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  connect: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
});
