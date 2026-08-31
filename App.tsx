import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { Connection } from "./src/api";
import { StoreProvider, useStore } from "./src/store";
import { makeTheme } from "./src/theme";
import { Lang, setLocale, t } from "./src/i18n";
import { ChatScreen } from "./src/chat";
import { UpdateOverlay } from "./src/update-overlay";
import { registerBackgroundUpdateTask } from "./src/background";
import { FoundServer, isOnWifi, ownSubnet, scanForServers } from "./src/scanner";
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

/** Same machine as the picked opencode server, next port over -- see pair-proxy.mjs. */
const PAIR_PROXY_PORT = 41113;

// Foreground notifications don't show a banner by default; the pairing
// code notification is meant to be seen (and its data read) the moment
// it lands, not just silently delivered.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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
  /**
   * The connect screen is opened from Settings rather than shown at startup:
   * the app works on its own and a server is an addition, not a gate. It was
   * written long ago and then left unreachable — nothing rendered it, so the
   * server support underneath had no way in.
   */
  const [connectOpen, setConnectOpen] = useState(false);

  useEffect(() => {
    registerBackgroundUpdateTask().catch(console.error);

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

  const dropServer = useCallback(() => {
    clearConnection();
    setConn(null);
  }, []);
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
              onOpenConnect={() => setConnectOpen(true)}
              onDisconnectServer={dropServer}
            />
          </StoreProvider>
          {connectOpen ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg, zIndex: 60 }]}>
              <ConnectScreen
                theme={theme}
                dark={dark}
                setDark={setThemeDark}
                onCancel={() => setConnectOpen(false)}
                onConnected={(c) => {
                  setConn(c);
                  setConnectOpen(false);
                }}
              />
            </View>
          ) : null}
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
  onOpenConnect,
  onDisconnectServer,
}: {
  theme: ReturnType<typeof makeTheme>;
  dark: boolean;
  setDark: (d: boolean) => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  onOpenConnect: () => void;
  onDisconnectServer: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top }}>
      <ChatScreen
        theme={theme}
        dark={dark}
        setDark={setDark}
        lang={lang}
        setLang={setLang}
        onOpenConnect={onOpenConnect}
        onDisconnectServer={onDisconnectServer}
      />
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

/**
 * Reaching a server used to mean typing its address by hand, the way
 * `opencode serve`'s own log line tells you to. This finds it instead, the
 * way joining Wi-Fi does: sweep the network, list what answers, tap one.
 *
 * A phone that already has a saved connection skips the scan and opens
 * straight on the manual form, prefilled — reconnecting to a known computer
 * should not mean re-discovering it. Scanning is for finding one for the
 * first time, or a different one; both paths reach the same form, because
 * a password still has to be typed in either case.
 */
function ConnectScreen({
  theme,
  onConnected,
  onCancel,
  dark,
  setDark,
}: {
  theme: ReturnType<typeof makeTheme>;
  dark: boolean;
  setDark: (d: boolean) => void;
  onConnected: (c: Connection) => void;
  /** The screen is reached from Settings now, so it has to be leaveable. */
  onCancel: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<"scan" | "manual">("scan");
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("opencode");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameFromScan, setCameFromScan] = useState(false);
  /**
   * Picking a computer off the scan already answers "which machine" and "is
   * it really running opencode" — asking for a username too would just be
   * re-deriving what the pill already shows. A short code stands in for the
   * password in that case; typing everything by hand (or reconnecting to a
   * saved computer) still needs the full host/username/password form.
   */
  const [pickedFromList, setPickedFromList] = useState(false);
  const [code, setCode] = useState("");
  /** "" while nothing has happened yet; sits alongside the manual code
   * boxes so the same screen still works if the push never arrives. */
  const [pairStatus, setPairStatus] = useState<"" | "sent" | "received" | "failed">("");

  useEffect(() => {
    loadSaved().then((s) => {
      const envHost = process.env.EXPO_PUBLIC_OCM_HOST || "";
      if (s) {
        // A known computer: skip discovery and go straight to reconnecting.
        setHost(s.host);
        setUsername(s.username);
        setStep("manual");
      } else if (envHost) {
        setHost(envHost);
        setStep("manual");
      }
      setReady(true);
    });
  }, []);

  const connect = async (overrideCode?: string) => {
    if (!host.trim()) {
      setError(t("app.connect.enterHost"));
      return;
    }
    setBusy(true);
    setError(null);
    const c: Connection = {
      host: host.trim().replace(/\/+$/, ""),
      username: username.trim() || "opencode",
      password: pickedFromList ? (overrideCode ?? code).trim() : password,
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

  // Kicks off the actual pairing: ask for notification permission, get
  // this device's Expo push token, and hand it to the PC-side proxy so it
  // can generate a code and push it back here. Failure just means the
  // push never shows up -- the same code boxes are still there to type
  // into by hand, so this stays best-effort and silent.
  const requestPairing = async (pcHost: string) => {
    try {
      const perm = await Notifications.requestPermissionsAsync();
      if (perm.status !== "granted") {
        setPairStatus("failed");
        return;
      }
      const { data: pushToken } = await Notifications.getExpoPushTokenAsync();
      const res = await fetch(`http://${pcHost}:${PAIR_PROXY_PORT}/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pushToken }),
      });
      setPairStatus(res.ok ? "sent" : "failed");
    } catch {
      setPairStatus("failed");
    }
  };

  // While the code screen is up for a picked device, listen for the push
  // just to know it landed -- the code itself is read off the
  // notification and typed into the boxes by hand, on purpose.
  useEffect(() => {
    if (!pickedFromList || step !== "manual") return;
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const incoming = n.request.content.data?.code;
      if (typeof incoming === "string" && incoming.length === 6) {
        setPairStatus("received");
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedFromList, step]);

  if (!ready) {
    return (
      <View style={[styles.connect, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.faint} />
      </View>
    );
  }

  if (step === "scan") {
    return (
      <ScanStep
        theme={theme}
        dark={dark}
        setDark={setDark}
        onCancel={onCancel}
        onPick={(server) => {
          // The code only means anything to the pairing proxy, not to
          // opencode serve itself -- point the connection at the proxy's
          // port on that same machine instead of the server's own port.
          setHost(`http://${server.host}:${PAIR_PROXY_PORT}`);
          setCameFromScan(true);
          setPickedFromList(true);
          setCode("");
          setError(null);
          setPairStatus("");
          setStep("manual");
          requestPairing(server.host);
        }}
        onManual={() => {
          setCameFromScan(true);
          setPickedFromList(false);
          setStep("manual");
        }}
      />
    );
  }

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

          {pickedFromList ? (
            <>
              {/* Shown without the proxy's own port -- that's an internal
                  detail, not something the person picked or needs to see. */}
              <DevicePill theme={theme} host={host.replace(/^https?:\/\//, "").split(":")[0]} />
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 11.5, color: theme.faint }}>{t("app.connect.code")}</Text>
                <CodeInput theme={theme} value={code} onChange={setCode} />
                {pairStatus === "sent" ? (
                  <Text style={{ fontSize: 12, color: theme.faint }}>{t("app.connect.codeSent")}</Text>
                ) : null}
                {pairStatus === "received" ? (
                  <Text style={{ fontSize: 12, color: theme.ok }}>{t("app.connect.codeReceived")}</Text>
                ) : null}
                {pairStatus === "failed" ? (
                  <Text style={{ fontSize: 12, color: theme.err }}>{t("app.connect.codePushFailed")}</Text>
                ) : null}
              </View>
            </>
          ) : (
            <>
              <Field theme={theme} label={t("app.connect.host")} value={host} onChange={setHost} placeholder="http://192.168.1.20:41111" autoCapitalize="none" />
              <Field theme={theme} label={t("app.connect.user")} value={username} onChange={setUsername} placeholder="opencode" autoCapitalize="none" />
              <Field theme={theme} label={t("app.connect.password")} value={password} onChange={setPassword} placeholder="••••••••" secure />
            </>
          )}

          {error ? <Text style={{ fontSize: 12.5, color: theme.err }}>{error}</Text> : null}

          <Pressable
            onPress={() => connect()}
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

          <Pressable onPress={() => setStep("scan")} style={{ marginTop: 2, alignItems: "center", paddingVertical: 6 }}>
            <Text style={{ color: theme.faint, fontSize: 13 }}>
              {cameFromScan ? t("app.scan.back") : t("app.scan.title")}
            </Text>
          </Pressable>

          <Pressable onPress={onCancel} style={{ alignItems: "center", paddingVertical: 8 }}>
            <Text style={{ color: theme.muted, fontSize: 13.5 }}>{t("common.cancel")}</Text>
          </Pressable>

          {pickedFromList ? null : (
            <Pressable onPress={() => setDark(!dark)} style={{ marginTop: 6, alignItems: "center" }}>
              <Text style={{ color: theme.faint, fontSize: 13 }}>
                {t("app.theme.toggle", { name: t(dark ? "app.theme.dark" : "app.theme.light") })}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * Sweeps the Wi-Fi network for an `opencode serve` and lists what it finds —
 * the discovery half of connecting, kept apart from the credentials form
 * below it because the two run on different clocks: this one is a few
 * seconds of network I/O with progress and a cancel button, that one is a
 * short synchronous form.
 */
function ScanStep({
  theme,
  dark,
  setDark,
  onCancel,
  onPick,
  onManual,
}: {
  theme: ReturnType<typeof makeTheme>;
  dark: boolean;
  setDark: (d: boolean) => void;
  onCancel: () => void;
  onPick: (server: FoundServer) => void;
  onManual: () => void;
}) {
  const [phase, setPhase] = useState<"checking" | "no-wifi" | "scanning" | "done">("checking");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [found, setFound] = useState<FoundServer[]>([]);
  // The effect below re-runs when this changes; rescan() just bumps it.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    setPhase("checking");
    setFound([]);
    setProgress({ done: 0, total: 0 });
    (async () => {
      if (!(await isOnWifi())) {
        if (!ac.signal.aborted) setPhase("no-wifi");
        return;
      }
      const subnet = await ownSubnet();
      if (!subnet) {
        if (!ac.signal.aborted) setPhase("no-wifi");
        return;
      }
      setPhase("scanning");
      const servers = await scanForServers(subnet, (done, total) => setProgress({ done, total }), ac.signal);
      if (!ac.signal.aborted) {
        setFound(servers);
        setPhase("done");
      }
    })();
    return () => ac.abort();
  }, [attempt]);

  const rescan = () => setAttempt((n) => n + 1);
  const scanning = phase === "checking" || phase === "scanning";

  return (
    <View style={[styles.connect, { backgroundColor: theme.bg }]}>
      <View style={{ width: "100%", maxWidth: 460, gap: 14 }}>
        <Text style={{ fontSize: 24, fontWeight: "600", letterSpacing: -0.6, color: theme.ink }}>{t("app.scan.title")}</Text>
        <Text style={{ fontSize: 13, color: theme.faint, lineHeight: 19 }}>{t("app.scan.intro")}</Text>
        <Text style={{ fontFamily: "monospace", fontSize: 11.5, color: theme.muted, backgroundColor: theme.l1, padding: 10, borderRadius: 7 }}>
          opencode serve --hostname 0.0.0.0 --port 41111
        </Text>

        {scanning && (
          <View style={{ alignItems: "center", gap: 14, paddingVertical: 18 }}>
            <GreenSpinner theme={theme} />
            <Text style={{ color: theme.muted, fontSize: 13 }}>
              {phase === "scanning" && progress.total
                ? `${t("app.scan.scanning")} ${progress.done}/${progress.total}`
                : t("app.scan.scanning")}
            </Text>
            <Pressable
              onPress={onCancel}
              style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: theme.l2, borderWidth: 1, borderColor: theme.bd }}
            >
              <Text style={{ color: theme.ink, fontSize: 13.5 }}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
        )}

        {phase === "no-wifi" && <Text style={{ fontSize: 13, color: theme.err, lineHeight: 19 }}>{t("app.scan.needsWifi")}</Text>}

        {phase === "done" && found.length === 0 && (
          <Text style={{ fontSize: 13, color: theme.muted, lineHeight: 19 }}>{t("app.scan.none")}</Text>
        )}

        {phase === "done" && found.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 12, color: theme.faint }}>
              {found.length === 1 ? t("app.scan.foundOne") : t("app.scan.foundMany", { n: found.length })}
            </Text>
            {found.map((srv) => (
              <Pressable
                key={`${srv.host}:${srv.port}`}
                onPress={() => onPick(srv)}
                style={({ pressed }) => ({
                  padding: 14,
                  borderRadius: 9,
                  borderWidth: 1,
                  borderColor: theme.bd,
                  backgroundColor: pressed ? theme.l2 : theme.l1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                })}
              >
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.ok }} />
                <Text style={{ color: theme.ink, fontSize: 14 }}>{srv.host}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {(phase === "no-wifi" || phase === "done") && (
          <Pressable
            onPress={rescan}
            style={{ height: 44, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.bd }}
          >
            <Text style={{ color: theme.ink, fontSize: 13.5 }}>{t("app.scan.rescan")}</Text>
          </Pressable>
        )}

        {!scanning && (
          <>
            <Pressable onPress={onManual} style={{ alignItems: "center", paddingVertical: 8 }}>
              <Text style={{ color: theme.faint, fontSize: 13 }}>{t("app.scan.manual")}</Text>
            </Pressable>

            <Pressable onPress={onCancel} style={{ alignItems: "center", paddingVertical: 4 }}>
              <Text style={{ color: theme.muted, fontSize: 13.5 }}>{t("common.cancel")}</Text>
            </Pressable>

            <Pressable onPress={() => setDark(!dark)} style={{ marginTop: 2, alignItems: "center" }}>
              <Text style={{ color: theme.faint, fontSize: 13 }}>
                {t("app.theme.toggle", { name: t(dark ? "app.theme.dark" : "app.theme.light") })}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

/** A continuously spinning ring in the theme's accent-green, standing in for the plain gray ActivityIndicator while scanning. */
function GreenSpinner({ theme, size = 64 }: { theme: ReturnType<typeof makeTheme>; size?: number }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 5,
        borderColor: theme.okBg,
        borderTopColor: theme.ok,
        transform: [{ rotate }],
      }}
    />
  );
}

/** The chosen computer, read-only — same look as its row in the scan list. */
function DevicePill({ theme, host }: { theme: ReturnType<typeof makeTheme>; host: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        padding: 14,
        borderRadius: 9,
        borderWidth: 1,
        borderColor: theme.bd,
        backgroundColor: theme.l1,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.ok }} />
      <Text style={{ color: theme.ink, fontSize: 14 }}>{host}</Text>
    </View>
  );
}

/**
 * Six single-character boxes standing in for the password field once a
 * computer has already been picked. Typing advances focus forward;
 * backspace on an empty box steps back — the usual OTP-input feel.
 */
function CodeInput({ theme, value, onChange }: { theme: ReturnType<typeof makeTheme>; value: string; onChange: (v: string) => void }) {
  const refs = useRef<Array<TextInput | null>>([]);
  const chars = Array.from({ length: 6 }, (_, i) => value[i] || "");

  const setAt = (i: number, ch: string) => {
    const next = chars.slice();
    next[i] = ch;
    onChange(next.join(""));
  };

  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {chars.map((ch, i) => (
        <TextInput
          key={i}
          ref={(r) => {
            refs.current[i] = r;
          }}
          value={ch}
          onChangeText={(t) => {
            const clean = t.slice(-1).toUpperCase();
            setAt(i, clean);
            if (clean && i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === "Backspace" && !chars[i] && i > 0) {
              refs.current[i - 1]?.focus();
            }
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={1}
          style={{
            flex: 1,
            height: 52,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: theme.bd,
            textAlign: "center",
            fontSize: 19,
            fontWeight: "600",
            color: theme.ink,
          }}
        />
      ))}
    </View>
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
