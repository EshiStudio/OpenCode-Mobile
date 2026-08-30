import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  InteractionManager,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Icon } from "./icons";
import { Attachment, useStore } from "./store";
import { imageDataUrl, isTextual, keepLocally, pickMedia, textPreview } from "./media";
import { Theme } from "./theme";
import { sessionTitle, variantName } from "./store";
import { MessageView, PendingShim } from "./message";
import { BottomSheet, RowList, SheetRow } from "./sheet";
import { useDrawerSwipe } from "./swipe";
import { BUILTIN_IDS } from "./local-ai";
import { installUpdate } from "./update";
import { SessionsPanel, visibleSessions } from "./panel";
import { SettingsScreen } from "./settings";
import { Composer } from "./composer";
import { Avatar, Wordmark } from "./ui";
import { catalogModels, presetName } from "./local-ai";
import { CLOUD_IDS, CloudId, cloudName } from "./clouds";
import { LocalProject } from "./storage";
import { Lang, t } from "./i18n";
import { ProviderPreset } from "./storage";
import { PermissionRequest, ProviderWithModels, SessionInfo, StoredMessage } from "./types";

export function ChatScreen({
  theme,
  dark,
  setDark,
  lang,
  setLang,
  onOpenConnect,
  onDisconnectServer,
}: {
  theme: Theme;
  dark: boolean;
  setDark: (d: boolean) => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  onOpenConnect: () => void;
  onDisconnectServer: () => void;
}) {
  const store = useStore();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Undo rewrites the working tree, so it asks first.
  const confirmRevert = useCallback(
    (messageID: string) => {
      Alert.alert(t("message.revert"), t("message.revertConfirm"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("message.revert"),
          style: "destructive",
          onPress: () => {
            store.revertTo(messageID).catch((e: unknown) => {
              Alert.alert(t("message.revertFailed"), e instanceof Error ? e.message : undefined);
            });
          },
        },
      ]);
    },
    [store],
  );

  const drawerSwipe = useDrawerSwipe({
    open: drawerOpen,
    onOpen: () => setDrawerOpen(true),
    onClose: () => setDrawerOpen(false),
  });
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sheet, setSheet] = useState<null | "model" | "effort" | "attach" | "project" | "branch" | "settings" | "more" | "filePick" | "sessions">(null);
  const [fileQuery, setFileQuery] = useState("");
  const [fileRows, setFileRows] = useState<SheetRow[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingPerm, setPendingPerm] = useState<PermissionRequest | null>(null);
  const [permRemember, setPermRemember] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<StoredMessage>>(null);

  const localMode = store.isLocal;
  const pool = localMode
    ? store.local.sessions.map((l) => ({
        id: l.id,
        title: l.title,
        time: { updated: l.when },
        directory: t("chat.device"),
      } as SessionInfo))
    : store.sessions;
  const msgs: StoredMessage[] = localMode && store.activeId
    ? (store.local.messages[store.activeId] || []).map((m, i) => ({
        info: {
          id: `loc-${store.activeId}-${i}`,
          role: m.role,
          sessionID: store.activeId as string,
          time: { created: store.local.sessions.find((s) => s.id === store.activeId)?.when || Date.now() },
        },
        parts: [
          { id: `locp-${i}`, type: "text", text: m.content },
          ...(m.files || []).map((f, j) => ({
            id: `locf-${i}-${j}`,
            type: "file" as const,
            mime: f.mime || (f.kind === "image" ? "image/*" : "application/octet-stream"),
            filename: f.name,
            url: f.uri,
          })),
        ],
      }))
    : (store.activeId ? store.messages[store.activeId] || [] : []);
  const active = pool.find((s) => s.id === store.activeId) || null;
  const activeStatus = store.activeId ? store.statuses[store.activeId] : undefined;
  const busyHere = !!activeStatus && (activeStatus.type === "busy" || activeStatus.type === "retry");

  // keep server list fresh
  useEffect(() => {
    const t = setInterval(() => {
      store.refresh();
    }, 15000);
    return () => clearInterval(t);
  }, [store.refresh]);

  useEffect(() => {
    if (store.permissions.length && store.permissions[0]?.sessionID === store.activeId) {
      setPendingPerm(store.permissions[0]);
    }
  }, [store.permissions, store.activeId]);
  useEffect(() => {
    if (!store.permissions.length) setPendingPerm(null);
  }, [store.permissions.length]);

  const toggleMsg = (_sid: string, mid: string) => {
    setExpanded((e) => ({ ...e, [mid]: !e[mid] }));
  };

  const modelName = localMode
    ? (presetName(store.providers.find((p) => p.id === store.local.presetID)) || store.local.presetID) + " · " + store.local.model
    : modelDisplayName(store.models, store.providerId, store.modelId);
  const modelRowsMemo = React.useMemo(
    () =>
      localMode
        ? localModelRows(store.providers, store.keys, store.providerModels, store.local.presetID, store.local.model)
        : modelRows(store.models, store.providerId, store.modelId),
    [
      localMode,
      store.providers,
      store.keys,
      store.providerModels,
      store.local.presetID,
      store.local.model,
      store.models,
      store.providerId,
      store.modelId,
    ],
  );
  const projDir = active?.directory || pool.find((s) => s.directory)?.directory;
  const pickedCloud = CLOUD_IDS.find((id) => id === store.preferredCloud && store.cloudTokens[id]);
  const projName = localMode ? (pickedCloud ? cloudName(pickedCloud) : t("chat.device")) : baseName(projDir) || t("common.dash");
  const projAv = localMode ? t("chat.deviceLetter") : projName[0]?.toUpperCase() || t("chat.projectLetter");

  const headerSub = active
    ? `${active.model?.providerID || "opencode"} · ${variantName(active.model?.variant || store.variant)}`
    : t("chat.pickProject");

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]} {...drawerSwipe.panHandlers}>
      {localMode && store.error ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, marginBottom: 6, padding: 9, borderRadius: 8, backgroundColor: theme.errBg }}>
          <Icon name="warning" size={14} color={theme.err} />
          <Text style={{ flex: 1, color: theme.err, fontSize: 12 }}>{store.error}</Text>
          <Pressable onPress={store.clearError} hitSlop={8}>
            <Icon name="close" size={13} color={theme.err} />
          </Pressable>
        </View>
      ) : null}
      <Header
        theme={theme}
        title={active ? sessionTitle(active) : t("chat.newSession")}
        projectAv={active ? sessionTitle(active).trim().charAt(0).toUpperCase() || projAv : projAv}
        brandMark={localMode}
        hasSession={!!active}
        update={store.update}
        onMenu={() => setDrawerOpen(true)}
        onCloseSession={closeActive}
        onNew={onNew}
        onMore={() => setSheet("more")}
        onPickSession={() => setSheet("sessions")}
        onInstallUpdate={() => {
          if (store.update) installUpdate(store.update).catch(() => {});
        }}
      />

      <View style={{ flex: 1, minHeight: 0 }}>
        {msgs.length === 0 && !busyHere ? (
          <EmptyState theme={theme} />
        ) : (
          <FlatList
            ref={listRef}
            data={msgs}
            keyExtractor={(m) => m.info.id}
            renderItem={({ item }) => (
              <MessageView
                theme={theme}
                msg={item}
                expanded={!!expanded[item.info.id]}
                onToggle={() => toggleMsg(store.activeId!, item.info.id)}
                showReasoning={store.settings.showReasoning}
                expandShell={store.settings.expandShell}
                expandEdit={store.settings.expandEdit}
                onRestore={(body) => {
                  setDraft(body);
                  Keyboard.dismiss();
                }}
                onRevert={store.connected ? confirmRevert : undefined}
              />
            )}
            ListFooterComponent={busyHere ? <PendingShim theme={theme} /> : null}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />
        )}
      </View>

      <Composer
        theme={theme}
        value={draft}
        onChange={setDraft}
        canSend={!!draft.trim()}
        busy={busyHere}
        modelName={modelName}
        providerID={localMode ? store.local.presetID : store.providerId || ""}
        variant={store.variant}
        projectName={active ? undefined : projName}
        projectAv={active ? undefined : undefined}
        branch={active ? null : null}
        attachments={store.attachments}
        onSend={() => {
          const v = draft;
          setDraft("");
          store.send(v, store.attachments);
        }}
        onStop={store.abort}
        onAttach={() => setSheet("attach")}
        onPickModel={() => {
          setSheet("model");
          if (localMode) {
            store.providers
              .filter((p) => store.keys[p.id] && !store.providerModels[p.id]?.length)
              .forEach((p) => {
                store.fetchProviderModels(p.id);
              });
          }
        }}
        onPickVariant={() => setSheet("effort")}
        onPickProject={() => setSheet("project")}
        onPickBranch={() => setSheet("branch")}
        onRemoveAttach={(i) => store.removeAttachment(i)}
      />

      <SessionsPanel
        theme={theme}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNew={() => {
          setDrawerOpen(false);
          onNew();
        }}
        onSettings={() => {
          setDrawerOpen(false);
          // The composer may still hold focus; settings opens with no field focused.
          Keyboard.dismiss();
          setSettingsOpen(true);
        }}
        onHelp={() => {
          setDrawerOpen(false);
          setHelpOpen(true);
        }}
      />
      <SettingsScreen
        theme={theme}
        dark={dark}
        setDark={setDark}
        lang={lang}
        setLang={setLang}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onOpenConnect={() => {
          setSettingsOpen(false);
          onOpenConnect();
        }}
        onDisconnectServer={onDisconnectServer}
      />{helpOpen ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 45, backgroundColor: theme.scrim, alignItems: "center", justifyContent: "center", padding: 24 }]}>
          <View style={{ width: "100%", maxWidth: 380, backgroundColor: theme.bg, borderRadius: 12, padding: 18 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: theme.ink, marginBottom: 10 }}>{t("chat.help")}</Text>
            <Text style={{ fontSize: 12.5, color: theme.muted, lineHeight: 19 }}>
              {t("chat.help.body")}
            </Text>
            <Text style={{ fontFamily: "monospace", fontSize: 11.5, color: theme.ink, backgroundColor: theme.l1, padding: 10, borderRadius: 7, marginVertical: 10 }}>
              opencode serve --hostname 0.0.0.0 --port 41111
            </Text>
            <Text style={{ fontSize: 12.5, color: theme.muted, lineHeight: 19 }}>
              {t("chat.help.address")}
            </Text>
            <Pressable
              onPress={() => setHelpOpen(false)}
              style={{ marginTop: 14, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: theme.sndOn }}
            >
              <Text style={{ color: "#fff", fontSize: 13.5 }}>{t("common.gotIt")}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* sheets */}
      <BottomSheet theme={theme} open={sheet === "model"} title={t("chat.model")} onClose={() => setSheet(null)}>
        <RowList
          key="model-list"
          theme={theme}
          searchable
          searchPlaceholder={t("chat.searchModels")}
          rows={modelRowsMemo}
          onPick={(r) => {
            const [prov, model] = r.id.split("::");
            if (localMode) {
              if (prov !== store.local.presetID) store.setLocalPreset(prov);
              store.setLocalModel(model);
            } else {
              store.setModel(prov, model);
            }
            setSheet(null);
          }}
        />
      </BottomSheet>

      <BottomSheet theme={theme} open={sheet === "effort"} title={t("chat.reasoning")} onClose={() => setSheet(null)}>
        <RowList
          theme={theme}
          rows={store.variants.map((v) => ({
            id: v,
            name: variantName(v),
            selected: v === store.variant,
          }))}
          onPick={(r) => {
            store.setVariant(r.id as never);
            setSheet(null);
          }}
        />
      </BottomSheet>

      <BottomSheet theme={theme} open={sheet === "attach"} title={t("chat.addToContext")} onClose={() => setSheet(null)}>
        <RowList
          theme={theme}
          rows={attachRows()}
          onPick={(r) => {
            setSheet(null);
            if (r.id === "project") {
              setSheet("filePick");
              return;
            }
            if (r.id === "photo" || r.id === "media" || r.id === "file") {
              attachFrom(r.id);
            }
          }}
        />
      </BottomSheet>

      <BottomSheet theme={theme} open={sheet === "filePick"} title={t("chat.projectFile")} onClose={() => setSheet(null)}>
        <FilePicker
          theme={theme}
          query={fileQuery}
          setQuery={setFileQuery}
          rows={fileRows}
          setRows={setFileRows}
          onPick={(f) => {
            setAttachAtlas(f);
            setSheet(null);
          }}
        />
      </BottomSheet>

      <BottomSheet theme={theme} open={sheet === "project"} title={t("chat.project")} onClose={() => setSheet(null)}>
        <RowList
          theme={theme}
          rows={storageRows(
            store.cloudTokens,
            store.cloudRoots,
            store.local.activeProject ? `project:${store.local.activeProject}` : store.preferredCloud,
            store.local.projects,
          )}
          onPick={(r) => {
            // Picking a project scopes the sessions to it and follows its folder
            // to whichever storage holds it; picking a storage clears that.
            if (r.id.startsWith("project:")) {
              const id = r.id.slice("project:".length);
              const project = store.local.projects.find((p) => p.id === id);
              store.setActiveProject(id);
              if (project) store.setPreferredCloud(project.cloud);
            } else {
              store.setActiveProject("");
              store.setPreferredCloud(r.id);
            }
            setSheet(null);
          }}
        />
      </BottomSheet>

      <BottomSheet theme={theme} open={sheet === "sessions"} title={t("chat.pickSession")} onClose={() => setSheet(null)}>
        <RowList
          theme={theme}
          searchable
          rows={visibleSessions(store).map((sess) => ({
            id: sess.id,
            name: sessionTitle(sess),
            selected: sess.id === store.activeId,
            icon: "folder",
          }))}
          onPick={(r) => {
            store.openSession(r.id);
            setSheet(null);
          }}
        />
      </BottomSheet>

      <BottomSheet theme={theme} open={sheet === "branch"} title={t("chat.branch")} onClose={() => setSheet(null)}>
        <RowList theme={theme} rows={[{ id: "1", name: "master" }]} onPick={() => setSheet(null)} />
      </BottomSheet>

      <BottomSheet theme={theme} open={sheet === "more"} title={active ? sessionTitle(active) : t("chat.session")} onClose={() => setSheet(null)}>
        <MoreRows
          theme={theme}
          active={active}
          onRename={() => {
            if (active) {
              setRenaming(active.id);
              setRenameValue(sessionTitle(active));
            }
          }}
          onDelete={() => {
            if (active) store.deleteSession(active.id);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      </BottomSheet>

      {/* rename dialog */}
      {renaming ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 40, backgroundColor: theme.scrim, alignItems: "center", paddingTop: 180 }]}>
          <View style={{ width: "82%", backgroundColor: theme.bg, borderRadius: 12, padding: 16 }}>
            <Text style={{ fontSize: 13.5, fontWeight: "600", color: theme.ink, marginBottom: 12 }}>{t("chat.rename")}</Text>
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              style={{ borderWidth: 1, borderColor: theme.bd, borderRadius: 7, padding: 10, fontSize: 13.5, color: theme.ink }}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 16, marginTop: 14 }}>
              <Pressable onPress={() => setRenaming(null)}>
                <Text style={{ fontSize: 13.5, color: theme.muted }}>{t("common.cancel")}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (renaming && renameValue.trim()) store.renameSession(renaming, renameValue.trim());
                  setRenaming(null);
                }}
              >
                <Text style={{ fontSize: 13.5, color: theme.acc }}>{t("common.save")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {/* permission dialog */}
      {pendingPerm ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 45, backgroundColor: theme.scrim, justifyContent: "center", padding: 24 }]}>
          <View style={{ backgroundColor: theme.bg, borderRadius: 12, padding: 18 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="shield" size={16} color={theme.acc} />
              <Text style={{ fontSize: 13.5, fontWeight: "600", color: theme.ink }}>{t("chat.permission")}</Text>
            </View>
            <Text style={{ marginTop: 10, fontSize: 13.5, lineHeight: 20, color: theme.ink }}>
              {pendingPerm.title}
            </Text>
            {pendingPerm.pattern ? (
              <Text style={{ fontFamily: "monospace", fontSize: 11.5, color: theme.muted, marginTop: 6 }}>
                {pendingPerm.pattern}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 }}>
              <Pressable onPress={() => setPermRemember(!permRemember)} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 16, height: 16, borderRadius: 4, borderWidth: 1, borderColor: permRemember ? theme.acc : theme.bd, alignItems: "center", justifyContent: "center" }}>
                  {permRemember ? <Icon name="check" size={11} color={theme.acc} /> : null}
                </View>
                <Text style={{ fontSize: 12.5, color: theme.muted }}>{t("chat.rememberChoice")}</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable
                style={{ flex: 1, height: 38, borderRadius: 8, borderWidth: 1, borderColor: theme.bd, alignItems: "center", justifyContent: "center" }}
                onPress={() => {
                  store.respondPermission(pendingPerm, "deny", permRemember);
                  setPendingPerm(null);
                  setPermRemember(false);
                }}
              >
                <Text style={{ color: theme.err, fontSize: 13.5 }}>{t("chat.deny")}</Text>
              </Pressable>
              <Pressable
                style={{ flex: 1, height: 38, borderRadius: 8, backgroundColor: theme.sndOn, alignItems: "center", justifyContent: "center" }}
                onPress={() => {
                  store.respondPermission(pendingPerm, "allow", permRemember);
                  setPendingPerm(null);
                  setPermRemember(false);
                }}
              >
                <Text style={{ color: "#ffffff", fontSize: 13.5 }}>{t("chat.allow")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );

  function onNew() {
    store.createNew().then((id) => {
      InteractionManager.runAfterInteractions(() => {
        store.openSession(id);
      });
      setDrawerOpen(false);
    });
  }

  function closeActive() {
    store.closeSession();
  }

  function setAttachAtlas(f: { name: string; path: string }) {
    store.addAttachments([{ kind: "file", name: f.name, path: f.path }]);
  }

  /**
   * Picks from the device and turns each file into something a model can read:
   * images become data URLs, text files travel as their head, and everything
   * else is referred to by path so the file tools can open it.
   */
  async function attachFrom(kind: "photo" | "media" | "file") {
    let picked;
    try {
      picked = await pickMedia(kind);
    } catch {
      return;
    }
    const out: Attachment[] = [];
    for (const raw of picked) {
      const p = await keepLocally(raw);
      const base = { name: p.name, uri: p.uri, mime: p.mime, size: p.size };
      if (p.isImage) {
        const data = await imageDataUrl(p);
        out.push({ ...base, kind: "image", text: data || undefined });
      } else if (isTextual(p.name, p.mime)) {
        out.push({ ...base, kind: "file", text: (await textPreview(p)) || undefined });
      } else {
        out.push({ ...base, kind: "file" });
      }
    }
    store.addAttachments(out);
  }
}

function Header({
  theme,
  title,
  projectAv,
  brandMark,
  hasSession,
  update,
  onMenu,
  onCloseSession,
  onNew,
  onMore,
  onPickSession,
  onInstallUpdate,
}: {
  theme: Theme;
  title: string;
  projectAv: string;
  brandMark?: boolean;
  hasSession: boolean;
  update: { version: string; apkUrl: string; pageUrl: string } | null;
  onMenu: () => void;
  onCloseSession: () => void;
  onNew: () => void;
  onMore: () => void;
  /** Long press on the title: jump straight to another session. */
  onPickSession: () => void;
  onInstallUpdate: () => void;
}) {
  return (
    <View style={[styles.header, { paddingTop: 6 }]}>
      <Pressable onPress={onMenu} style={({ pressed }) => [styles.iconBtn, { backgroundColor: pressed ? theme.l2 : "transparent" }]}>
        <Icon name="menu" size={18} color={theme.muted} />
      </Pressable>

      {/* The session name sits in the middle; the actions hold the two corners. */}
      <View style={styles.headerMid}>
        <Pressable
          onPress={onMore}
          onLongPress={onPickSession}
          delayLongPress={280}
          style={({ pressed }) => [styles.tab, { backgroundColor: pressed ? theme.l3 : theme.l2 }]}
        >
          <Avatar theme={theme} letter={projectAv} size={20} mark={brandMark && !hasSession} />
          <Text style={{ fontSize: 13, color: theme.ink, flexShrink: 1 }} numberOfLines={1}>
            {title}
          </Text>
          {hasSession ? (
            <Pressable onPress={onCloseSession} hitSlop={10} style={{ padding: 3 }}>
              <Icon name="close" size={12} color={theme.faint} />
            </Pressable>
          ) : null}
        </Pressable>
      </View>

      {update ? (
        <Pressable
          accessibilityLabel={t("chat.update", { version: update.version })}
          onPress={onInstallUpdate}
          style={({ pressed }) => [styles.iconBtn, { backgroundColor: pressed ? theme.l3 : theme.l2 }]}
        >
          <Icon name="download" size={16} color={theme.acc} />
        </Pressable>
      ) : null}

      <Pressable onPress={onNew} style={({ pressed }) => [styles.iconBtn, { backgroundColor: pressed ? theme.l2 : "transparent" }]}>
        <Icon name="plus" size={18} color={theme.muted} />
      </Pressable>
    </View>
  );
}

function baseName(dir?: string): string {
  if (!dir) return "";
  const parts = dir.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || "";
}

function EmptyState({ theme }: { theme: Theme }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 70 }}>
      <Wordmark theme={theme} />
    </View>
  );
}

function modelDisplayName(models: ProviderWithModels[], providerID: string | null, modelID: string | null): string {
  if (!providerID || !modelID) return t("chat.modelPlaceholder");
  for (const p of models) {
    if (p.id === providerID) {
      const m = p.models.find((x) => x.id === modelID);
      if (m) return m.name;
    }
  }
  return modelID;
}

const OCM_PROVIDERS = ["opencode", "opencode-go"];

/**
 * Models for on-device mode. Providers answer /models over the network, so fall
 * back to the preset's default id until that list arrives.
 */
function localModelRows(
  providers: ProviderPreset[],
  keys: Record<string, string>,
  cached: Record<string, string[]>,
  presetID: string,
  modelID: string,
): SheetRow[] {
  const rows: SheetRow[] = [];
  for (const p of providers) {
    // Custom endpoints may need no key at all, so their presence is what counts;
    // a built-in provider without a key is simply not set up yet.
    if (!keys[p.id] && BUILTIN_IDS.includes(p.id)) continue;
    const label = presetName(p);
    const known = cached[p.id]?.length ? cached[p.id] : catalogModels(p.id);
    const ids = known.length ? known : [p.model, modelID].filter(Boolean);
    for (const id of Array.from(new Set(ids))) {
      rows.push({
        id: `${p.id}::${id}`,
        name: id,
        groupOf: label,
        selected: p.id === presetID && id === modelID,
        brand: { id: p.id },
      });
    }
  }
  return rows;
}

function modelRows(models: ProviderWithModels[], providerID: string | null, modelID: string | null): SheetRow[] {
  const rows: SheetRow[] = [];
  for (const p of models) {
    if (!OCM_PROVIDERS.includes(p.id)) continue;
    const names = p.models.map((m) => ({
      id: `${p.id}::${m.id}`,
      name: m.name,
      badge: m.free ? t("chat.free") : undefined,
      groupOf: p.name,
      selected: m.id === modelID && p.id === providerID,
      brand: { id: p.id },
    }));
    rows.push(...names);
  }
  return rows;
}

/** Built per call so the labels follow the interface language. */
function attachRows(): SheetRow[] {
  return [
    { id: "photo", name: t("chat.attach.photo"), desc: t("chat.attach.photoDesc"), icon: "photo" },
    { id: "media", name: t("chat.attach.media"), desc: t("chat.attach.mediaDesc"), icon: "grid" },
    { id: "file", name: t("chat.attach.file"), desc: t("chat.attach.fileDesc"), icon: "open-file" },
    { id: "project", name: t("chat.attach.project"), desc: t("chat.attach.projectDesc"), icon: "folder" },
  ];
}

/** Where work is stored: the device, plus every attached cloud. */
/**
 * Where work is kept: the device, each attached cloud, and every project.
 *
 * A project is a folder in one of those, so it belongs in the same list — its
 * row says which storage it lives in, so "MyProject" on the device and one on
 * a disk are told apart at a glance.
 */
function storageRows(
  clouds: Record<string, string>,
  roots: Record<string, string>,
  picked: string,
  projects: LocalProject[],
): SheetRow[] {
  const rows: SheetRow[] = [
    {
      id: "",
      name: t("chat.storage.device"),
      desc: t("chat.storage.deviceDesc"),
      selected: !picked,
      icon: "folder",
    },
  ];
  for (const id of CLOUD_IDS) {
    if (!clouds[id]) continue;
    rows.push({
      id,
      name: cloudName(id),
      desc: roots[id] || "opencode",
      selected: picked === id,
      brand: { id, colored: true },
    });
  }
  for (const project of projects) {
    rows.push({
      id: `project:${project.id}`,
      name: project.name,
      desc: project.cloud ? cloudName(project.cloud as CloudId) : t("chat.storage.device"),
      groupOf: t("project.title"),
      selected: picked === `project:${project.id}`,
      icon: "folder",
    });
  }
  return rows;
}

function FilePicker({
  theme,
  query,
  setQuery,
  rows,
  setRows,
  onPick,
}: {
  theme: Theme;
  query: string;
  setQuery: (v: string) => void;
  rows: SheetRow[];
  setRows: (rows: SheetRow[]) => void;
  onPick: (f: { name: string; path: string }) => void;
}) {
  const store = useStore();
  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.fileSearch, { borderColor: theme.bdSoft }]}>
        <Icon name="magnifying-glass" size={14} color={theme.faint} />
        <TextInput
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            if (v.trim().length > 1) {
              store.findFiles?.(v.trim()).then((res) => {
                setRows(
                  (res || []).map((r, i) => ({
                    id: String(i),
                    name: r.split(/[\\/]/).pop() || r,
                    desc: r,
                    icon: "folder",
                  })),
                );
              });
            } else {
              setRows([]);
            }
          }}
          placeholder={t("chat.searchFiles")}
          placeholderTextColor={theme.faint}
          style={{ flex: 1, color: theme.ink, fontSize: 13.5, marginLeft: 6 }}
        />
      </View>
      <RowList
        theme={theme}
        rows={rows}
        emptyText={t("chat.startTyping")}
        onPick={(r) => onPick({ name: r.name, path: String(r.desc || r.name) })}
      />
    </View>
  );
}

function MoreRows({ theme, active, onRename, onDelete, onClose }: { theme: Theme; active: { id: string } | null; onRename: () => void; onDelete: () => void; onClose: () => void }) {
  const store = useStore();
  return (
    <RowList
      theme={theme}
      rows={[
        { id: "rename", name: t("chat.rename"), icon: "pencil-line" },
        { id: "share", name: t("chat.shareSession"), icon: "share" },
        { id: "review", name: t("chat.openReview"), icon: "review" },
        active
          ? { id: "delete", name: t("chat.deleteSession"), icon: "trash" }
          : { id: "none", name: "", icon: "plus" },
      ].filter((r) => r.id !== "none")}
      onPick={(r) => {
        if (r.id === "rename") {
          onRename();
          onClose();
        } else if (r.id === "delete") {
          onDelete();
        } else {
          onClose();
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  headerMid: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center" },
  iconBtn: { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 9,
    paddingLeft: 7,
    paddingRight: 6,
    height: 34,
    maxWidth: 230,
    flexShrink: 1,
  },
  fileSearch: {
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


