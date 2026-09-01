import React, { useState } from "react";
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { BrandIcon, DriveIcon, Icon, IconName } from "./icons";
import { Theme } from "./theme";
import { useStore, variantName } from "./store";
import { installUpdate } from "./update";
import { BUILTIN_IDS, FEATURED_IDS, catalogModels, presetDesc, presetName } from "./local-ai";
import { ProviderPreset } from "./storage";
import { CLOUD_IDS, CloudId, cloudHint, cloudName } from "./clouds";
import { Lang, LANGS, t } from "./i18n";
import { useSwipeBack } from "./swipe";

/**
 * Settings is a small navigation stack: a full-screen list of grouped rows, and
 * one pushed screen per topic. Everything a row leads to gets the whole width,
 * which the provider search and the cloud forms need.
 */
type Page = "root" | "basic" | "appearance" | "language" | "providers" | "models" | "clouds" | "server" | "about";

function pageTitle(p: Page): string {
  return t("settings." + p);
}

/**
 * Edge-to-edge windows are never resized for the keyboard, so both platforms
 * have to pad. See src/keyboard.ts.
 */
const AVOID = "padding" as const;

export function SettingsScreen({
  theme,
  dark,
  setDark,
  lang,
  setLang,
  open,
  onClose,
  onOpenConnect,
  onDisconnectServer,
}: {
  theme: Theme;
  dark: boolean;
  setDark: (d: boolean) => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  open: boolean;
  onClose: () => void;
  /** Opens the connect screen. The connection itself lives in App. */
  onOpenConnect: () => void;
  onDisconnectServer: () => void;
}) {
  const [page, setPage] = useState<Page>("root");
  const off = Dimensions.get("window").width || 520;
  const tx = React.useRef(new Animated.Value(off)).current;

  React.useEffect(() => {
    Animated.timing(tx, { toValue: open ? 0 : off, duration: 220, useNativeDriver: true }).start();
    // Reopening lands on the list again, not on whatever was left open.
    if (!open) {
      const t = setTimeout(() => setPage("root"), 240);
      return () => clearTimeout(t);
    }
  }, [open, tx, off]);

  // Pages swap in place, so without this a push reads as a flicker. The new
  // page slides in from the side it came from: forward from the right, back
  // from the left.
  const pageSlide = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    pageSlide.setValue(page === "root" ? -26 : 26);
    Animated.timing(pageSlide, { toValue: 0, duration: 190, useNativeDriver: true }).start();
  }, [page, pageSlide]);

  const back = () => (page === "root" ? onClose() : setPage("root"));
  const swipeBack = useSwipeBack(back);

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { zIndex: 50, opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" } as never,
      ]}
      {...swipeBack.panHandlers}
    >
      <Animated.View style={[s.window, { backgroundColor: theme.bg, transform: [{ translateX: tx }] }]}>
        <View style={s.head}>
          <Pressable onPress={back} hitSlop={10} style={({ pressed }) => [s.backBtn, { backgroundColor: pressed ? theme.l3 : theme.l2 }]}>
            <Icon name="arrow-left" size={16} color={theme.ink} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: "center", fontSize: 15.5, fontWeight: "600", color: theme.ink }} numberOfLines={1}>
            {pageTitle(page)}
          </Text>
          <View style={s.backBtn} />
        </View>

        <KeyboardAvoidingView behavior={AVOID} style={{ flex: 1, minHeight: 0 }}>
          <ScrollView
            contentContainerStyle={{ padding: 14, paddingBottom: 60 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <Animated.View
              style={{
                transform: [{ translateX: pageSlide }],
                opacity: pageSlide.interpolate({ inputRange: [-26, 0, 26], outputRange: [0, 1, 0] }),
              }}
            >
            {page === "root" ? <RootPage theme={theme} dark={dark} lang={lang} go={setPage} /> : null}
            {page === "basic" ? <BasicSection theme={theme} /> : null}
            {page === "appearance" ? <AppearanceSection theme={theme} dark={dark} setDark={setDark} /> : null}
            {page === "language" ? <LanguageSection theme={theme} lang={lang} setLang={setLang} /> : null}
            {page === "providers" ? <ProvidersSection theme={theme} /> : null}
            {page === "models" ? <ModelsSection theme={theme} /> : null}
            {page === "clouds" ? <CloudsSection theme={theme} /> : null}
            {page === "server" ? (
              <ServerSection theme={theme} onOpenConnect={onOpenConnect} onDisconnectServer={onDisconnectServer} />
            ) : null}
            {page === "about" ? <AboutSection theme={theme} /> : null}
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

/** The list on the screenshot: grouped cards, a value on the right, a chevron. */
function RootPage({ theme, dark, lang, go }: { theme: Theme; dark: boolean; lang: Lang; go: (p: Page) => void }) {
  const store = useStore();
  const keyed = store.providers.filter((p) => store.keys[p.id]);
  const clouds = CLOUD_IDS.filter((id) => store.cloudTokens[id]);
  const model = store.isLocal
    ? store.local.modelByPreset[store.local.presetID] || store.local.model
    : store.models.find((p) => p.id === store.providerId)?.models.find((m) => m.id === store.modelId)?.name;

  return (
    <>
      <GroupTitle theme={theme} first>
        {t("settings.group.app")}
      </GroupTitle>
      <NavCard theme={theme}>
        <NavRow theme={theme} icon="sliders" title={t("settings.basic")} onPress={() => go("basic")} />
        <NavRow
          theme={theme}
          icon="globe"
          title={t("settings.language")}
          value={LANGS.find((l) => l.id === lang)?.name}
          onPress={() => go("language")}
        />
        <NavRow
          theme={theme}
          icon="moon"
          title={t("settings.appearance")}
          value={t(dark ? "settings.theme.dark" : "settings.theme.light")}
          last
          onPress={() => go("appearance")}
        />
      </NavCard>

      <GroupTitle theme={theme}>{t("settings.group.models")}</GroupTitle>
      <NavCard theme={theme}>
        <NavRow
          theme={theme}
          icon="providers"
          title={t("settings.providers")}
          value={keyed.length ? t("settings.providers.count", { n: keyed.length }) : t("common.none")}
          onPress={() => go("providers")}
        />
        <NavRow theme={theme} icon="models" title={t("settings.models")} value={model || t("settings.model.none")} last onPress={() => go("models")} />
      </NavCard>

      <GroupTitle theme={theme}>{t("settings.group.storage")}</GroupTitle>
      <NavCard theme={theme}>
        <NavRow
          theme={theme}
          icon="cloud"
          title={t("settings.clouds")}
          value={clouds.length ? clouds.map(cloudName).join(", ") : t("settings.clouds.none")}
          onPress={() => go("clouds")}
        />
        <NavRow
          theme={theme}
          icon="terminal"
          title={t("settings.server")}
          value={store.serverVersion ? "v" + store.serverVersion : t("settings.server.off")}
          last
          onPress={() => go("server")}
        />
      </NavCard>

      <GroupTitle theme={theme}>{t("settings.group.about")}</GroupTitle>
      <NavCard theme={theme}>
        <NavRow theme={theme} icon="info" title={t("settings.versionAndUpdates")} value={store.appVersion} last onPress={() => go("about")} />
      </NavCard>
    </>
  );
}

function GroupTitle({ theme, children, first }: { theme: Theme; children: React.ReactNode; first?: boolean }) {
  return <Text style={[s.groupTitle, { color: theme.faint }, first && { marginTop: 2 }]}>{children}</Text>;
}

function NavCard({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return <View style={[s.navCard, { backgroundColor: theme.l1 }]}>{children}</View>;
}

function NavRow({
  theme,
  icon,
  title,
  value,
  last,
  onPress,
}: {
  theme: Theme;
  icon: IconName;
  title: string;
  value?: string;
  last?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.navRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.bdSoft },
        { backgroundColor: pressed ? theme.l2 : "transparent" },
      ]}
    >
      <Icon name={icon} size={17} color={theme.ink} />
      <Text style={{ fontSize: 14.5, color: theme.ink, flexShrink: 0 }} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ flex: 1, minWidth: 8 }} />
      {value ? (
        <Text style={{ fontSize: 13, color: theme.faint, flexShrink: 1 }} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <View style={{ transform: [{ rotate: "-90deg" }] }}>
        <Icon name="chevron-down" size={14} color={theme.faint} />
      </View>
    </Pressable>
  );
}

function Card({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return <View style={[s.card, { backgroundColor: theme.bg, borderColor: theme.bdSoft }]}>{children}</View>;
}

function Row({ theme, children, last }: { theme: Theme; children: React.ReactNode; last?: boolean }) {
  return (
    <View style={[s.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.bdSoft }]}>
      {children}
    </View>
  );
}

function Toggle({ theme, value, onChange }: { theme: Theme; value: boolean; onChange: (v: boolean) => void }) {
  return <Switch value={value} onValueChange={onChange} trackColor={{ false: theme.l3, true: theme.acc }} thumbColor="#ffffff" />;
}

function AppearanceSection({ theme, dark, setDark }: { theme: Theme; dark: boolean; setDark: (d: boolean) => void }) {
  const options: Array<{ id: boolean; name: string; icon: IconName }> = [
    { id: false, name: t("settings.theme.light"), icon: "sun" },
    { id: true, name: t("settings.theme.dark"), icon: "moon" },
  ];
  return (
    <NavCard theme={theme}>
      {options.map((o, i) => (
        <Pressable
          key={o.name}
          onPress={() => setDark(o.id)}
          style={({ pressed }) => [
            s.navRow,
            i < options.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.bdSoft },
            { backgroundColor: pressed ? theme.l2 : "transparent" },
          ]}
        >
          <Icon name={o.icon} size={17} color={theme.ink} />
          <Text style={{ flex: 1, fontSize: 14.5, color: theme.ink }}>{o.name}</Text>
          {dark === o.id ? <Icon name="check" size={15} color={theme.acc} /> : null}
        </Pressable>
      ))}
    </NavCard>
  );
}

function LanguageSection({ theme, lang, setLang }: { theme: Theme; lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <NavCard theme={theme}>
      {LANGS.map((o, i) => (
        <Pressable
          key={o.id}
          onPress={() => setLang(o.id)}
          style={({ pressed }) => [
            s.navRow,
            i < LANGS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.bdSoft },
            { backgroundColor: pressed ? theme.l2 : "transparent" },
          ]}
        >
          <Icon name="globe" size={17} color={theme.ink} />
          <Text style={{ flex: 1, fontSize: 14.5, color: theme.ink }}>{o.name}</Text>
          {lang === o.id ? <Icon name="check" size={15} color={theme.acc} /> : null}
        </Pressable>
      ))}
    </NavCard>
  );
}

function AboutSection({ theme }: { theme: Theme }) {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);

  const install = async () => {
    if (!store.update) return;
    setInstalling(true);
    setProgress(0);
    try {
      await installUpdate(store.update, setProgress);
    } finally {
      setInstalling(false);
    }
  };

  const check = async () => {
    setBusy(true);
    setNote("");
    const hardcodedRepo = "EshiStudio/OpenCode-Mobile";
    await store.setUpdateRepo(hardcodedRepo);
    const rel = await store.checkUpdate();
    setBusy(false);
    setNote(rel ? t("settings.about.available", { version: rel.version }) : t("settings.about.upToDate"));
  };

  return (
    <>
      <Card theme={theme}>
        <Row theme={theme} last>
          <View style={s.rowText}>
            <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>{t("settings.about.version")}</Text>
          </View>
          <Text style={{ fontSize: 13, color: theme.muted }}>{store.appVersion}</Text>
        </Row>
      </Card>

      <Pressable
        onPress={check}
        disabled={busy}
        style={({ pressed }) => [s.wideBtn, { backgroundColor: pressed ? theme.l3 : theme.sndOn }]}
      >
        <Text style={{ fontSize: 13.5, color: "#ffffff", fontWeight: "600" }}>
          {busy ? t("common.checking") : t("settings.about.check")}
        </Text>
      </Pressable>
      {note ? <Text style={{ fontSize: 12, color: theme.muted, marginTop: 10 }}>{note}</Text> : null}
      {store.update ? (
        <Pressable
          onPress={install}
          disabled={installing}
          style={({ pressed }) => [s.wideBtn, s.btnGhost, { borderColor: theme.bd, backgroundColor: pressed ? theme.l2 : "transparent" }]}
        >
          <Text style={{ fontSize: 13.5, color: theme.acc }}>
            {installing
              ? t("update.downloading", { percent: Math.round(progress * 100) })
              : t("settings.about.download", { version: store.update.version })}
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}

function BasicSection({ theme }: { theme: Theme }) {
  const store = useStore();
  return (
    <Card theme={theme}>
      <Row theme={theme}>
        <View style={s.rowText}>
          <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>{t("settings.autoAllow")}</Text>
          <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>{t("settings.autoAllowDesc")}</Text>
        </View>
        <Toggle theme={theme} value={store.settings.autoAllowPermissions} onChange={(v) => store.updateSettings({ autoAllowPermissions: v })} />
      </Row>
      <Row theme={theme}>
        <View style={s.rowText}>
          <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>{t("settings.localWork")}</Text>
          <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>
            {t("settings.localWorkDesc")}
          </Text>
        </View>
        <Toggle theme={theme} value={store.settings.localWork} onChange={(v) => store.updateSettings({ localWork: v })} />
      </Row>
      <Row theme={theme}>
        <View style={s.rowText}>
          <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>{t("settings.keepAwake")}</Text>
          <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>{t("settings.keepAwakeDesc")}</Text>
        </View>
        <Toggle theme={theme} value={store.settings.keepAwake} onChange={(v) => store.updateSettings({ keepAwake: v })} />
      </Row>
      <Row theme={theme}>
        <View style={s.rowText}>
          <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>{t("settings.showReasoning")}</Text>
          <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>{t("settings.showReasoningDesc")}</Text>
        </View>
        <Toggle theme={theme} value={store.settings.showReasoning} onChange={(v) => store.updateSettings({ showReasoning: v })} />
      </Row>
      <Row theme={theme}>
        <View style={s.rowText}>
          <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>{t("settings.expandShell")}</Text>
          <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>{t("settings.expandShellDesc")}</Text>
        </View>
        <Toggle theme={theme} value={store.settings.expandShell} onChange={(v) => store.updateSettings({ expandShell: v })} />
      </Row>
      <Row theme={theme} last>
        <View style={s.rowText}>
          <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>{t("settings.expandEdit")}</Text>
          <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>{t("settings.expandEditDesc")}</Text>
        </View>
        <Toggle theme={theme} value={store.settings.expandEdit} onChange={(v) => store.updateSettings({ expandEdit: v })} />
      </Row>
    </Card>
  );
}

/** Brand mark for a storage; Yandex has no authentic path on file, so it gets a cloud glyph. */
function CloudMark({ id }: { id: CloudId }) {
  if (id === "yandex") return <Icon name="cloud" size={17} color="#FC3F1D" />;
  if (id === "gdrive") return <DriveIcon size={17} />;
  return <BrandIcon providerID={id} size={17} colored />;
}

function CloudRow({ theme, cloud }: { theme: Theme; cloud: { id: CloudId; name: string; hint: string } }) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [clientId, setClientIdInput] = useState(store.clientIds[cloud.id] || "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState(false);

  React.useEffect(() => setClientIdInput(store.clientIds[cloud.id] || ""), [store.clientIds, cloud.id]);

  const connected = !!store.cloudTokens[cloud.id];
  const root = store.cloudRoots[cloud.id];
  // Google and Dropbox hand out short-lived tokens, so they sign in properly.
  const oauth = cloud.id === "gdrive" || cloud.id === "dropbox";
  const ready = !oauth || !!store.clientIds[cloud.id];

  const guard = async (fn: () => Promise<string>) => {
    setBusy(true);
    setNote("");
    setFailed(false);
    try {
      setNote(await fn());
      setToken("");
      setOpen(false);
    } catch (e) {
      setFailed(true);
      setNote(e instanceof Error ? e.message : t("settings.cloud.connectFailed"));
    }
    setBusy(false);
  };

  return (
    <View style={s.pitchRow}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
        <CloudMark id={cloud.id} />
        <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>
          {cloud.name}
        </Text>
        {connected ? (
          <>
            <Text style={[s.tag, { color: theme.muted, backgroundColor: theme.l3 }]}>{root || "opencode"}</Text>
            <View style={[s.dot, { backgroundColor: theme.ok }]} />
          </>
        ) : null}
        <View style={{ flex: 1 }} />
        {connected ? (
          <Pressable onPress={() => guard(() => store.connectCloud(cloud.id, ""))} hitSlop={10}>
            <Text style={{ fontSize: 12.5, color: theme.muted }}>{t("common.disconnect")}</Text>
          </Pressable>
        ) : (
          <Pressable
            disabled={busy}
            onPress={() => {
              if (oauth && ready) guard(() => store.signInCloud(cloud.id as "gdrive" | "dropbox"));
              else setOpen(!open);
            }}
            style={({ pressed }) => [s.connectBtn, { borderColor: theme.bd, backgroundColor: pressed ? theme.l3 : theme.bg }]}
          >
            <Icon name={oauth ? "link" : "plus"} size={11} color={theme.ink} />
            <Text style={{ fontSize: 12.5, color: theme.ink }}>
              {busy ? "…" : oauth ? (ready ? t("settings.cloud.signIn") : t("settings.cloud.setUp")) : t("common.connect")}
            </Text>
          </Pressable>
        )}
      </View>

      {open && !connected ? (
        <View style={{ marginTop: 12 }}>
          {oauth ? (
            <>
              <Text style={[s.fieldLabel, { color: theme.faint }]}>Client ID</Text>
              <TextInput
                value={clientId}
                onChangeText={setClientIdInput}
                placeholder={cloud.id === "gdrive" ? "…apps.googleusercontent.com" : t("settings.cloud.clientIdHint")}
                placeholderTextColor={theme.faint}
                autoCapitalize="none"
                autoCorrect={false}
                style={[s.textInput, { color: theme.ink, borderColor: theme.bd, backgroundColor: theme.bg }]}
              />
              <Text style={{ fontSize: 11, color: theme.faint, marginTop: 6, lineHeight: 15 }}>
                {t("settings.cloud.redirect")}
              </Text>
            </>
          ) : (
            <>
              <Text style={[s.fieldLabel, { color: theme.faint }]}>{t("settings.cloud.token")}</Text>
              <TextInput
                value={token}
                onChangeText={setToken}
                placeholder={t("settings.cloud.tokenPlaceholder")}
                placeholderTextColor={theme.faint}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={[s.textInput, { color: theme.ink, borderColor: theme.bd, backgroundColor: theme.bg }]}
              />
            </>
          )}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <Pressable
              disabled={busy}
              onPress={() =>
                oauth
                  ? guard(async () => {
                      await store.setClientId(cloud.id, clientId);
                      return await store.signInCloud(cloud.id as "gdrive" | "dropbox");
                    })
                  : guard(() => store.connectCloud(cloud.id, token))
              }
              style={({ pressed }) => [s.btn, { backgroundColor: pressed ? theme.l3 : theme.sndOn }]}
            >
              <Text style={{ fontSize: 12.5, color: "#ffffff" }}>
                {busy ? t("common.checking") : oauth ? t("settings.cloud.saveAndSignIn") : t("common.connect")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setOpen(false)}
              style={({ pressed }) => [s.btn, s.btnGhost, { borderColor: theme.bd, backgroundColor: pressed ? theme.l2 : "transparent" }]}
            >
              <Text style={{ fontSize: 12.5, color: theme.muted }}>{t("common.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {note ? (
        <Text style={{ fontSize: 11.5, marginTop: 10, color: failed ? theme.err : theme.ok }}>{note}</Text>
      ) : null}
    </View>
  );
}


function CloudsSection({ theme }: { theme: Theme }) {
  return (
    <>
      <Text style={{ fontSize: 12, color: theme.muted, marginBottom: 10, lineHeight: 17 }}>
        {t("settings.clouds.intro")}
      </Text>
      <ListCard theme={theme}>
        {CLOUD_IDS.map((id, i) => (
          <View
            key={id}
            style={i < CLOUD_IDS.length - 1 ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.bdSoft } : undefined}
          >
            <CloudRow theme={theme} cloud={{ id, name: cloudName(id), hint: cloudHint(id) }} />
          </View>
        ))}
      </ListCard>
    </>
  );
}

function ServerSection({
  theme,
  onOpenConnect,
  onDisconnectServer,
}: {
  theme: Theme;
  onOpenConnect: () => void;
  onDisconnectServer: () => void;
}) {
  const store = useStore();
  return (
    <>
      <ListCard theme={theme}>
        <View style={s.pitchRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
            <Icon name="terminal" size={16} color={theme.ink} />
            <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>
              {t("settings.server.card")}
            </Text>
            {store.serverVersion ? (
              <Text style={[s.tag, { color: theme.ok, backgroundColor: theme.okBg }]}>v{store.serverVersion}</Text>
            ) : null}
          </View>
          <Text style={{ fontSize: 12, color: theme.muted, marginTop: 5, lineHeight: 16 }}>
            {store.serverVersion
              ? t("settings.server.connected")
              : t("settings.server.optional")}
          </Text>
        </View>
      </ListCard>
      <Pressable
        onPress={store.connected ? onDisconnectServer : onOpenConnect}
        style={({ pressed }) => [
          s.wideBtn,
          s.btnGhost,
          { marginTop: 12, borderColor: theme.bd, backgroundColor: pressed ? theme.l2 : "transparent" },
        ]}
      >
        <Text style={{ fontSize: 13, color: store.connected ? theme.err : theme.ink }}>
          {t(store.connected ? "settings.server.disconnect" : "settings.server.connect")}
        </Text>
      </Pressable>
      <Text style={{ fontSize: 12, color: theme.muted, marginTop: 12, lineHeight: 17 }}>
        {t("settings.server.run")}
      </Text>
      <Text
        selectable
        style={{ fontFamily: "monospace", fontSize: 11.5, color: theme.ink, backgroundColor: theme.l1, padding: 10, borderRadius: 7, marginTop: 8 }}
      >
        opencode serve --hostname 0.0.0.0 --port 41111
      </Text>
    </>
  );
}


/** Where a connected provider's credentials came from. */
function sourceBadge(builtin: boolean): string {
  return t(builtin ? "settings.providers.sourceKey" : "settings.providers.sourceCustom");
}

function ListCard({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return <View style={[s.listCard, { backgroundColor: theme.l1, borderColor: theme.bdSoft }]}>{children}</View>;
}

/** A connected provider: name, where its key came from, and a way to drop it. */
function ConnectedRow({
  theme,
  preset,
  builtin,
  active,
  last,
  onPress,
  onDisconnect,
}: {
  theme: Theme;
  preset: ProviderPreset;
  builtin: boolean;
  active: boolean;
  last?: boolean;
  onPress: () => void;
  onDisconnect: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.listRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.bdSoft },
        { backgroundColor: pressed ? theme.l2 : "transparent" },
      ]}
    >
      <BrandIcon providerID={preset.id} size={16} color={theme.ink} />
      <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>
        {presetName(preset)}
      </Text>
      <Text style={[s.tag, { color: theme.muted, backgroundColor: theme.l3 }]}>{sourceBadge(builtin)}</Text>
      {active ? <View accessibilityLabel={t("settings.providers.activeLabel")} style={[s.dot, { backgroundColor: theme.ok }]} /> : null}
      <View style={{ flex: 1 }} />
      <Pressable onPress={onDisconnect} hitSlop={10}>
        <Text style={{ fontSize: 12.5, color: theme.muted }}>{t("common.disconnect")}</Text>
      </Pressable>
    </Pressable>
  );
}

/** An unconfigured provider, pitched with a one-liner and a connect button. */
function PopularRow({
  theme,
  preset,
  last,
  onConnect,
}: {
  theme: Theme;
  preset: ProviderPreset;
  last?: boolean;
  onConnect: () => void;
}) {
  return (
    <View style={[s.pitchRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.bdSoft }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
        <BrandIcon providerID={preset.id} size={16} color={theme.ink} />
        <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>
          {presetName(preset)}
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={onConnect}
          style={({ pressed }) => [s.connectBtn, { borderColor: theme.bd, backgroundColor: pressed ? theme.l3 : theme.bg }]}
        >
          <Icon name="plus" size={11} color={theme.ink} />
          <Text style={{ fontSize: 12.5, color: theme.ink }}>{t("common.connect")}</Text>
        </Pressable>
      </View>
      <Text style={{ fontSize: 12, color: theme.muted, marginTop: 5, lineHeight: 16 }}>{presetDesc(preset)}</Text>
    </View>
  );
}

type Dialog =
  | { kind: "connect"; preset: ProviderPreset }
  | { kind: "configure"; preset: ProviderPreset }
  | { kind: "custom" };

function ProvidersSection({ theme }: { theme: Theme }) {
  const store = useStore();
  const selected = store.local.presetID;
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [query, setQuery] = useState("");

  const connected = store.providers.filter((p) => store.keys[p.id] || !BUILTIN_IDS.includes(p.id));
  const rest = store.providers.filter((p) => !store.keys[p.id] && BUILTIN_IDS.includes(p.id));

  const q = query.trim().toLowerCase();
  const found = q
    ? rest.filter(
        (p) => presetName(p).toLowerCase().includes(q) || p.id.includes(q) || p.baseURL.toLowerCase().includes(q),
      )
    : [];
  const featured = rest.filter((p) => FEATURED_IDS.includes(p.id));
  const list = q ? found.slice(0, 40) : featured;

  return (
    <>
      {connected.length ? (
        <ListCard theme={theme}>
          {connected.map((p, i) => (
            <ConnectedRow
              key={p.id}
              theme={theme}
              preset={p}
              builtin={BUILTIN_IDS.includes(p.id)}
              active={selected === p.id}
              last={i === connected.length - 1}
              onPress={() => setDialog({ kind: "configure", preset: p })}
              onDisconnect={() => {
                if (BUILTIN_IDS.includes(p.id)) store.saveProvider(p.id, { key: "" });
                else store.removeProvider(p.id);
              }}
            />
          ))}
        </ListCard>
      ) : (
        <Text style={{ fontSize: 12.5, color: theme.muted, marginBottom: 4 }}>
          {t("settings.providers.emptyState")}
        </Text>
      )}

      <Text style={[s.sectionTitle, { color: theme.ink }]}>
        {q ? t("settings.providers.searchResults") : t("settings.providers.popular")}
      </Text>
      <View style={[s.search, { borderColor: theme.bd, backgroundColor: theme.l1 }]}>
        <Icon name="magnifying-glass" size={13} color={theme.faint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("settings.providers.searchPlaceholder", { n: rest.length })}
          placeholderTextColor={theme.faint}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ flex: 1, color: theme.ink, fontSize: 12.5, padding: 0 }}
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Icon name="close" size={12} color={theme.faint} />
          </Pressable>
        ) : null}
      </View>

      {list.length ? (
        <ListCard theme={theme}>
          {list.map((p, i) => (
            <PopularRow
              key={p.id}
              theme={theme}
              preset={p}
              last={i === list.length - 1}
              onConnect={() => setDialog({ kind: "connect", preset: p })}
            />
          ))}
        </ListCard>
      ) : (
        <Text style={{ fontSize: 12.5, color: theme.faint, paddingVertical: 20, textAlign: "center" }}>
          {q ? t("common.nothingFound") : t("settings.providers.allConnected")}
        </Text>
      )}
      {q && found.length > list.length ? (
        <Text style={{ fontSize: 11.5, color: theme.faint, marginTop: 8 }}>
          {t("settings.providers.shownFirst", { shown: list.length, total: found.length })}
        </Text>
      ) : null}

      <Text style={[s.sectionTitle, { color: theme.ink }]}>{t("settings.providers.other")}</Text>
      <ListCard theme={theme}>
        <View style={s.pitchRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
            <Icon name="models" size={16} color={theme.ink} />
            <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>
              {t("settings.providers.custom")}
            </Text>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => setDialog({ kind: "custom" })}
              style={({ pressed }) => [s.connectBtn, { borderColor: theme.bd, backgroundColor: pressed ? theme.l3 : theme.bg }]}
            >
              <Icon name="plus" size={11} color={theme.ink} />
              <Text style={{ fontSize: 12.5, color: theme.ink }}>{t("common.connect")}</Text>
            </Pressable>
          </View>
          <Text style={{ fontSize: 12, color: theme.muted, marginTop: 5, lineHeight: 16 }}>
            {t("settings.providers.customDesc")}
          </Text>
        </View>
      </ListCard>

      <ProviderDialog theme={theme} dialog={dialog} onClose={() => setDialog(null)} />
    </>
  );
}


/** The connect / configure / add-custom sheet. */
function ProviderDialog({ theme, dialog, onClose }: { theme: Theme; dialog: Dialog | null; onClose: () => void }) {
  const store = useStore();
  const preset = dialog && dialog.kind !== "custom" ? dialog.preset : null;
  const id = preset?.id || "";

  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [list, setList] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Each opening starts from what is currently stored for that provider.
  React.useEffect(() => {
    if (!dialog) return;
    setKey(preset ? store.keys[preset.id] || "" : "");
    setModel(preset ? store.local.modelByPreset[preset.id] || "" : "");
    setLabel("");
    setUrl("");
    setList(preset ? catalogModels(preset.id) : null);
    setErr("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog]);

  if (!dialog) return null;

  const configure = dialog.kind === "configure";
  const custom = dialog.kind === "custom";
  const name = preset ? presetName(preset) : t("dialog.providerFallback");
  const active = !!preset && store.local.presetID === preset.id;

  const title = custom
    ? t("dialog.addProvider")
    : configure
      ? t("dialog.configureProvider", { name })
      : t("dialog.connectProvider", { name });

  const fetchModels = async () => {
    if (!preset || !key.trim()) return;
    setLoading(true);
    // Save the key first so the shared cache (and the chat model picker) can use it.
    if (key.trim() !== store.keys[preset.id]) await store.saveProvider(preset.id, { key: key.trim() });
    setList(await store.fetchProviderModels(preset.id));
    setLoading(false);
  };

  const submit = async () => {
    if (custom) {
      const base = url.trim().replace(/\/+$/, "");
      if (!/^https?:\/\/.+/.test(base)) {
        setErr(t("dialog.errBadUrl"));
        return;
      }
      if (!model.trim()) {
        setErr(t("dialog.errNoModel"));
        return;
      }
      const newId = "custom_" + Date.now();
      await store.saveCustomPreset({
        id: newId,
        baseURL: base,
        model: model.trim(),
        name: label.trim() || t("settings.providers.customDefaultName"),
      });
      await store.saveProvider(newId, { key: key.trim(), model: model.trim() });
      store.setLocalPreset(newId);
      onClose();
      return;
    }
    if (!key.trim()) {
      setErr(t("dialog.errNoKey"));
      return;
    }
    await store.saveProvider(id, { key: key.trim(), model: model.trim() || preset?.model || "" });
    if (!configure) store.setLocalPreset(id);
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior="padding"
        style={[s.dlgScrim, { backgroundColor: theme.scrim }]}
      >
        <View style={[s.dlg, { backgroundColor: theme.bg, borderColor: theme.bdSoft }]}>
          <View style={s.dlgHead}>
            <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [s.iconBtn, { backgroundColor: pressed ? theme.l2 : "transparent" }]}>
              <Icon name="arrow-left" size={15} color={theme.muted} />
            </Pressable>
            <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [s.iconBtn, { backgroundColor: pressed ? theme.l2 : "transparent" }]}>
              <Icon name="close" size={14} color={theme.muted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 22 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
              {preset ? <BrandIcon providerID={preset.id} size={17} color={theme.ink} /> : <Icon name="models" size={17} color={theme.ink} />}
              <Text style={{ fontSize: 15.5, color: theme.ink, fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>
                {title}
              </Text>
            </View>

            <Text style={{ fontSize: 12.5, color: theme.muted, marginTop: 12, lineHeight: 18 }}>
              {custom
                ? t("dialog.customIntro")
                : configure
                  ? t("dialog.configureIntro", { name })
                  : t("dialog.connectIntro", { name })}
            </Text>

            {custom ? (
              <>
                <Text style={[s.dlgLabel, { color: theme.ink }]}>{t("dialog.name")}</Text>
                <TextInput
                  value={label}
                  onChangeText={setLabel}
                  placeholder={t("dialog.namePlaceholder")}
                  placeholderTextColor={theme.faint}
                  style={[s.dlgInput, { color: theme.ink, borderColor: theme.bd, backgroundColor: theme.bg }]}
                />
                <Text style={[s.dlgLabel, { color: theme.ink }]}>{t("dialog.baseUrl")}</Text>
                <TextInput
                  value={url}
                  onChangeText={setUrl}
                  placeholder="https://api.example.com/v1"
                  placeholderTextColor={theme.faint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={[s.dlgInput, { color: theme.ink, borderColor: theme.bd, backgroundColor: theme.bg }]}
                />
              </>
            ) : null}

            <Text style={[s.dlgLabel, { color: theme.ink }]}>{custom ? t("dialog.apiKey") : t("dialog.apiKeyOf", { name })}</Text>
            <TextInput
              value={key}
              onChangeText={setKey}
              placeholder={t("dialog.apiKey")}
              placeholderTextColor={theme.faint}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              style={[s.dlgInput, { color: theme.ink, borderColor: theme.bd, backgroundColor: theme.bg }]}
            />

            {configure || custom ? (
              <>
                <View style={s.dlgLabelRow}>
                  <Text style={[s.dlgLabel, { color: theme.ink, marginTop: 0 }]}>{t("dialog.model")}</Text>
                  {configure ? (
                    <Pressable onPress={fetchModels} hitSlop={8} disabled={!key.trim() || loading}>
                      <Text style={{ fontSize: 12, color: key.trim() ? theme.acc : theme.faint }}>
                        {loading ? t("common.loading") : t("dialog.loadList")}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <TextInput
                  value={model}
                  onChangeText={setModel}
                  placeholder={preset?.model || "model-id"}
                  placeholderTextColor={theme.faint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[s.dlgInput, { color: theme.ink, borderColor: theme.bd, backgroundColor: theme.bg }]}
                />
                {list ? (
                  list.length ? (
                    <View style={[s.modelList, { borderColor: theme.bdSoft }]}>
                      <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        {list.map((m) => (
                          <Pressable
                            key={m}
                            onPress={() => {
                              setModel(m);
                              setList(null);
                            }}
                            style={({ pressed }) => [s.modelItem, { backgroundColor: pressed ? theme.l2 : "transparent" }]}
                          >
                            <Text style={{ fontSize: 12, color: m === model ? theme.acc : theme.ink, flex: 1 }} numberOfLines={1}>
                              {m}
                            </Text>
                            {m === model ? <Icon name="check" size={12} color={theme.acc} /> : null}
                          </Pressable>
                        ))}
                      </ScrollView>
                    </View>
                  ) : (
                    <Text style={{ fontSize: 11.5, color: theme.warn, marginTop: 8 }}>
                      {t("dialog.noModelList")}
                    </Text>
                  )
                ) : null}
              </>
            ) : null}

            {err ? <Text style={{ fontSize: 12, color: theme.err, marginTop: 10 }}>{err}</Text> : null}

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18 }}>
              <Pressable onPress={submit} style={({ pressed }) => [s.btn, { backgroundColor: pressed ? theme.l3 : theme.sndOn }]}>
                <Text style={{ fontSize: 12.5, color: "#ffffff", fontWeight: "600" }}>
                  {custom ? t("dialog.add") : configure ? t("common.save") : t("common.continue")}
                </Text>
              </Pressable>
              {configure && !active ? (
                <Pressable
                  onPress={async () => {
                    await store.saveProvider(id, { key: key.trim(), model: model.trim() || preset?.model || "" });
                    store.setLocalPreset(id);
                    onClose();
                  }}
                  style={({ pressed }) => [s.btn, s.btnGhost, { borderColor: theme.bd, backgroundColor: pressed ? theme.l2 : "transparent" }]}
                >
                  <Text style={{ fontSize: 12.5, color: theme.ink }}>{t("dialog.use")}</Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ModelsSection({ theme }: { theme: Theme }) {
  const store = useStore();
  const cur = store.models.find((p) => p.id === store.providerId)?.models.find((m) => m.id === store.modelId);
  return (
    <Card theme={theme}>
      <Row theme={theme}>
        <View style={s.rowText}>
          <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>{t("settings.models.selected")}</Text>
          <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>{cur?.name || t("settings.model.none")}</Text>
        </View>
        {cur ? <BrandIcon providerID={store.providerId || ""} size={18} color={theme.muted} /> : null}
      </Row>
      <Row theme={theme} last>
        <View style={s.rowText}>
          <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>{t("settings.models.reasoning")}</Text>
          <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>{variantName(store.variant)}</Text>
        </View>
      </Row>
    </Card>
  );
}

const s = StyleSheet.create({
  window: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 52,
    paddingBottom: 12,
  },
  backBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  iconBtn: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  groupTitle: {
    fontSize: 12,
    marginTop: 22,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  navCard: { borderRadius: 12, overflow: "hidden" },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 15,
  },
  wideBtn: {
    marginTop: 16,
    height: 44,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    alignSelf: "flex-start",
    fontSize: 12.5,
    marginTop: 8,
    borderRadius: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: "hidden",
  },
  card: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 },
  rowText: { flex: 1, minWidth: 0 },

  sectionTitle: { fontSize: 13, fontWeight: "600", marginTop: 22, marginBottom: 9 },
  fieldLabel: { fontSize: 11, letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 4 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  listCard: { borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 13,
    paddingVertical: 13,
  },
  tag: {
    fontSize: 10.5,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: "hidden",
  },
  pitchRow: { paddingHorizontal: 13, paddingVertical: 12 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  connectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },

  dlgScrim: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  dlg: { width: "100%", maxHeight: "86%", borderRadius: 12, borderWidth: 1 },
  dlgHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 4,
  },
  dlgLabel: { fontSize: 12.5, fontWeight: "600", marginTop: 16, marginBottom: 6 },
  dlgLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16, marginBottom: 6 },
  dlgInput: {
    height: 40,
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 11,
    fontSize: 13,
  },

  modelList: { borderWidth: 1, borderRadius: 7, marginTop: 8, overflow: "hidden" },
  modelItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 9 },

  btn: { paddingHorizontal: 15, paddingVertical: 10, borderRadius: 7 },
  btnGhost: { borderWidth: 1 },
  textInput: {
    height: 38,
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 12.5,
    marginTop: 5,
  },
});
