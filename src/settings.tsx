import React, { useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { BrandIcon, Icon } from "./icons";
import { Theme } from "./theme";
import { useStore, variantName } from "./store";
import { PRESETS } from "./local-ai";

type Section = "basic" | "hotkeys" | "servers" | "providers" | "models";

const SECTIONS: Array<{ id: Section; label: string; group: string; icon: string }> = [
  { id: "basic", label: "Основные", group: "Приложение", icon: "sliders" },
  { id: "hotkeys", label: "Горячие клавиши", group: "Приложение", icon: "code-lines" },
  { id: "servers", label: "Серверы", group: "Сервер", icon: "providers" },
  { id: "providers", label: "Провайдеры", group: "Сервер", icon: "settings-gear" },
  { id: "models", label: "Модели", group: "Сервер", icon: "models" },
];

export function SettingsScreen({ theme, open, onClose }: { theme: Theme; open: boolean; onClose: () => void }) {
  const store = useStore();
  const [section, setSection] = useState<Section>("basic");
  const tx = React.useRef(new Animated.Value(-520)).current;

  React.useEffect(() => {
    Animated.timing(tx, { toValue: open ? 0 : -520, duration: 220, useNativeDriver: true }).start();
  }, [open, tx]);

  const current = SECTIONS.find((s) => s.id === section);

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { zIndex: 50, opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" } as never,
      ]}
    >
      <View style={s.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </View>
      <Animated.View style={[s.window, { backgroundColor: theme.bg, transform: [{ translateX: tx }] }]}>
        <View style={s.head}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: theme.ink }}>Настройки</Text>
          <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [s.iconBtn, { backgroundColor: pressed ? theme.l2 : "transparent" }]}>
            <Icon name="close" size={14} color={theme.muted} />
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", flex: 1, minHeight: 0 }}>
          {/* rail */}
          <View style={{ width: 96, flexShrink: 0, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: theme.bdSoft }}>
            <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
              {SECTIONS.map((sec) => {
                const on = section === sec.id;
                return (
                  <View key={sec.id}>
                    {sec.group !== (SECTIONS[SECTIONS.indexOf(sec) - 1]?.group ?? "") ? (
                      <Text style={[s.railGroup, { color: theme.faint }]}>{sec.group}</Text>
                    ) : null}
                    <Pressable
                      onPress={() => setSection(sec.id)}
                      style={({ pressed }) => [s.railItem, { backgroundColor: on || pressed ? theme.l2 : "transparent" }]}
                    >
                      <Icon name={(sec.icon as never) ?? "sliders"} size={15} color={on ? theme.ink : theme.muted} />
                      <Text style={{ fontSize: 12.5, color: on ? theme.ink : theme.muted, marginLeft: 8, flexShrink: 1 }} numberOfLines={1}>
                        {sec.label}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
              <Text style={{ fontSize: 10.5, color: theme.faint, paddingVertical: 16, paddingHorizontal: 12 }}>
                OpenCode Mobile · {store.serverVersion || ""}
              </Text>
            </ScrollView>
          </View>

          {/* content */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: theme.ink, marginBottom: 12 }}>{current?.label}</Text>
              {section === "basic" ? <BasicSection theme={theme} /> : null}
              {section === "hotkeys" ? <HotkeysSection theme={theme} /> : null}
              {section === "servers" ? <ServersSection theme={theme} /> : null}
              {section === "providers" ? <ProvidersSection theme={theme} /> : null}
              {section === "models" ? <ModelsSection theme={theme} /> : null}
            </ScrollView>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

function Card({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return (
    <View style={[s.card, { backgroundColor: theme.bg, borderColor: theme.bdSoft }]}>{children}</View>
  );
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

function BasicSection({ theme }: { theme: Theme }) {
  const store = useStore();
  return (
    <Card theme={theme}>
      <Row theme={theme}>
        <View style={s.rowText}>
          <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>Язык</Text>
          <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>Изменить язык отображения OpenCode</Text>
        </View>
        <Text style={{ fontSize: 13, color: theme.ink }}>Русский ▾</Text>
      </Row>
      <Row theme={theme}>
        <View style={s.rowText}>
          <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>Автоматически принимать разрешения</Text>
          <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>Запросы на разрешения будут одобряться автоматически</Text>
        </View>
        <Toggle theme={theme} value={store.settings.autoAllowPermissions} onChange={(v) => store.updateSettings({ autoAllowPermissions: v })} />
      </Row>
      <Row theme={theme}>
        <View style={s.rowText}>
          <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>Локальная работа</Text>
          <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>
            Дать нейросети доступ к устройству для локальной работы: создание папок и файлов
          </Text>
        </View>
        <Toggle theme={theme} value={store.settings.localWork} onChange={(v) => store.updateSettings({ localWork: v })} />
      </Row>
      <Row theme={theme}>
        <View style={s.rowText}>
          <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>Оболочка терминала</Text>
          <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>Выберите оболочку для терминала. Совместимые оболочки также используются агентом при вызове инструментов.</Text>
        </View>
        <Text style={{ fontSize: 13, color: theme.ink }}>Авто (по умолчанию) ▾</Text>
      </Row>
      <Row theme={theme}>
        <View style={s.rowText}>
          <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>Показывать сводки рассуждений</Text>
          <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>Отображать сводки рассуждений модели</Text>
        </View>
        <Toggle theme={theme} value={store.settings.showReasoning} onChange={(v) => store.updateSettings({ showReasoning: v })} />
      </Row>
      <Row theme={theme}>
        <View style={s.rowText}>
          <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>Разворачивать элементы инструмента shell</Text>
          <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>Показывать элементы инструмента shell развернутыми</Text>
        </View>
        <Toggle theme={theme} value={store.settings.expandShell} onChange={(v) => store.updateSettings({ expandShell: v })} />
      </Row>
      <Row theme={theme} last>
        <View style={s.rowText}>
          <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>Разворачивать элементы инструмента edit</Text>
          <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>Показывать элементы инструментов edit, write и patch развернутыми</Text>
        </View>
        <Toggle theme={theme} value={store.settings.expandEdit} onChange={(v) => store.updateSettings({ expandEdit: v })} />
      </Row>
    </Card>
  );
}

function HotkeysSection({ theme }: { theme: Theme }) {
  const keys: Array<[string, string]> = [
    ["⌘ / ctrl + O", "Открыть сессии"],
    ["⌘ / ctrl + N", "Новая сессия"],
    ["⌘ / ctrl + Enter", "Запросить ответ"],
    ["esc", "Закрыть меню/шит"],
    ["⌘ / ctrl + ,", "Настройки"],
  ];
  return (
    <Card theme={theme}>
      {keys.map(([k, v], i) => (
        <Row key={k} theme={theme} last={i === keys.length - 1}>
          <View style={s.rowText}>
            <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>{v}</Text>
          </View>
          <Text style={{ fontSize: 12.5, color: theme.muted, fontFamily: "monospace" }}>{k}</Text>
        </Row>
      ))}
    </Card>
  );
}

function ServersSection({ theme }: { theme: Theme }) {
  const store = useStore();
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <>
      <Text style={{ fontSize: 12, color: theme.faint, marginBottom: 8 }}>
        Веб-диск — облако для сохранения файлов. Когда локальная работа выключена, сохранение доступно только через него.
      </Text>
      <Card theme={theme}>
        <Row theme={theme}>
          <View style={s.rowText}>
            <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>Яндекс Диск</Text>
            <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>
              {store.yandexToken ? "подключен ✓" : "не подключен"} · OAuth-токен
            </Text>
          </View>
          {store.yandexToken ? <Text style={{ fontSize: 12, color: theme.ok }}>✓</Text> : null}
        </Row>
        <Row theme={theme}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 11.5, color: theme.faint }}>Токен OAuth Яндекс OAuth</Text>
            <TextInput
              value={token}
              onChangeText={setToken}
              placeholder="y0_AgAAAA…"
              placeholderTextColor={theme.faint}
              autoCapitalize="none"
              secureTextEntry
              style={[s.textInput, { color: theme.ink, borderColor: theme.bd }]}
            />
            <Pressable
              onPress={async () => {
                await store.saveYandex(token.trim());
                setSaved(true);
                setTimeout(() => setSaved(false), 1800);
              }}
              style={({ pressed }) => [s.keyBtn, { alignSelf: "flex-start", marginTop: 10, backgroundColor: pressed ? theme.l3 : theme.sndOn }]}
            >
              <Text style={{ fontSize: 12, color: "#ffffff" }}>{saved ? "Сохранено ✓" : "Сохранить токен"}</Text>
            </Pressable>
          </View>
        </Row>
        <Row theme={theme} last>
          <View style={s.rowText}>
            <Text style={{ fontSize: 13, color: theme.ink, fontWeight: "600" }}>Сервер opencode (опционально)</Text>
            <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>
              {store.serverVersion ? `подключено · v${store.serverVersion}` : "для работы через сервер на ПК"}
            </Text>
          </View>
        </Row>
      </Card>
    </>
  );
}

function ProviderEditor({
  theme,
  id,
  label,
  baseURL,
  defaultModel,
  selected,
  onSelect,
  onSave,
}: {
  theme: Theme;
  id: string;
  label: string;
  baseURL: string;
  defaultModel: string;
  selected: boolean;
  onSelect: () => void;
  onSave: (key: string, model: string | undefined) => Promise<void>;
}) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [saved, setSaved] = useState(false);

  const doSave = async (mk: boolean) => {
    await onSave(key.trim(), mk ? model.trim() || undefined : undefined);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <Row theme={theme}>
      <Pressable onPress={() => { setOpen(!open); }} style={{ flex: 1, minWidth: 0 }} hitSlop={4}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }} numberOfLines={1}>
            {label}
          </Text>
          {selected ? <Text style={[s.badge, { color: theme.acc, backgroundColor: theme.l2 }]}>выбран</Text> : null}
          <Icon name="chevron-down" size={12} color={theme.faint} />
        </View>
        <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }} numberOfLines={1}>
          {store.keys[id] ? "ключ задан · " : "ключ не задан · "}
          {baseURL}
        </Text>
      </Pressable>
      {open ? (
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
            <Pressable
              onPress={onSelect}
              style={({ pressed }) => [s.keyBtn, { backgroundColor: pressed ? theme.l2 : theme.l1 }]}
            >
              <Text style={{ fontSize: 12, color: selected ? theme.acc : theme.muted }}>{selected ? "Используется" : "Использовать"}</Text>
            </Pressable>
          </View>
          <Text style={{ fontSize: 11.5, color: theme.faint, marginTop: 10 }}>API-ключ</Text>
          <TextInput
            value={key}
            onChangeText={setKey}
            placeholder="sk-…"
            placeholderTextColor={theme.faint}
            secureTextEntry
            autoCapitalize="none"
            style={[s.textInput, { color: theme.ink, borderColor: theme.bd }]}
          />
          <Text style={{ fontSize: 11.5, color: theme.faint, marginTop: 8 }}>Модель</Text>
          <TextInput
            value={model}
            onChangeText={setModel}
            placeholder={defaultModel}
            placeholderTextColor={theme.faint}
            autoCapitalize="none"
            autoCorrect={false}
            style={[s.textInput, { color: theme.ink, borderColor: theme.bd }]}
          />
          <Pressable onPress={() => doSave(true)} style={({ pressed }) => [s.keyBtn, { alignSelf: "flex-start", marginTop: 10, backgroundColor: pressed ? theme.l3 : theme.sndOn }]}>
            <Text style={{ fontSize: 12, color: "#ffffff" }}>{saved ? "Сохранено ✓" : "Сохранить"}</Text>
          </Pressable>
        </View>
      ) : null}
    </Row>
  );
}

function ProvidersSection({ theme }: { theme: Theme }) {
  const store = useStore();
  const [topKey, setTopKey] = useState<Record<string, { add: boolean }>>({});
  void topKey;
  const presetList = PRESETS;
  const selected = store.local.presetID;
  return (
    <>
      <Text style={{ fontSize: 12, color: theme.faint, marginBottom: 8 }}>
        Приложение работает сразу: добавьте API-ключ нужного провайдера и выберите его для общения с нейросетью.
      </Text>
      <Card theme={theme}>
        {presetList.map((p, i) => (
          <ProviderEditor
            key={p.id}
            theme={theme}
            id={p.id}
            label={p.label}
            baseURL={p.baseURL}
            defaultModel={p.model}
            selected={selected === p.id}
            onSelect={() => {
              store.setLocalPreset(p.id);
              if (!store.local.model) store.setLocalModel(p.model);
            }}
            onSave={async (k, m) => {
              await store.savePresetKey(p.id, k, m || p.model);
            }}
          />
        ))}
      </Card>
      <Text style={{ fontSize: 11.5, color: theme.faint, marginTop: 12, marginBottom: 8 }}>
        Совместимо с любым OpenAI-провайдером: укажите свой адрес и модель.
      </Text>
      <Card theme={theme}>
        {store.presets
          .filter((p) => !PRESETS.some((x) => x.id === p.id))
          .map((p, i) => (
            <ProviderEditor
              key={p.id}
              theme={theme}
              id={p.id}
              label={p.label || "Пользовательский"}
              baseURL={p.baseURL}
              defaultModel={p.model}
              selected={selected === p.id}
              onSelect={() => store.setLocalPreset(p.id)}
              onSave={(k, m) => store.savePresetKey(p.id, k, m)}
            />
          ))}
        <CustomPresetRow theme={theme} />
      </Card>
    </>
  );
}

function CustomPresetRow({ theme }: { theme: Theme }) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [model, setModel] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <Row theme={theme}>
      <Pressable onPress={() => setOpen(!open)} style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="models" size={15} color={theme.muted} />
          <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>Пользовательский провайдер</Text>
          <Icon name="chevron-down" size={12} color={theme.faint} />
        </View>
        {!open ? (
          <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>
            Добавить провайдера, совместимого с OpenAI
          </Text>
        ) : null}
      </Pressable>
      {open ? (
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 11.5, color: theme.faint, marginTop: 8 }}>Название</Text>
          <TextInput value={label} onChangeText={setLabel} placeholder="Мой провайдер" placeholderTextColor={theme.faint} style={[s.textInput, { color: theme.ink, borderColor: theme.bd }]} />
          <Text style={{ fontSize: 11.5, color: theme.faint, marginTop: 8 }}>Адрес (base URL)</Text>
          <TextInput value={url} onChangeText={setUrl} placeholder="https://api.example.com/v1" placeholderTextColor={theme.faint} autoCapitalize="none" style={[s.textInput, { color: theme.ink, borderColor: theme.bd }]} />
          <Text style={{ fontSize: 11.5, color: theme.faint, marginTop: 8 }}>Модель</Text>
          <TextInput value={model} onChangeText={setModel} placeholder="model-id" placeholderTextColor={theme.faint} autoCapitalize="none" style={[s.textInput, { color: theme.ink, borderColor: theme.bd }]} />
          <Pressable
            onPress={async () => {
              if (url.trim() && model.trim()) {
                const id = "custom_" + Date.now();
                await store.saveCustomPreset({ id, baseURL: url.trim(), model: model.trim(), name: label.trim() || "Пользовательский" });
                store.setLocalPreset(id);
                setSaved(true);
                setTimeout(() => setSaved(false), 1800);
              }
            }}
            style={({ pressed }) => [s.keyBtn, { alignSelf: "flex-start", marginTop: 10, backgroundColor: pressed ? theme.l3 : theme.sndOn }]}
          >
            <Text style={{ fontSize: 12, color: "#ffffff" }}>{saved ? "Добавлено ✓" : "Добавить"}</Text>
          </Pressable>
        </View>
      ) : null}
    </Row>
  );
}

function ModelsSection({ theme }: { theme: Theme }) {
  const store = useStore();
  const cur = store.models.find((p) => p.id === store.providerId)?.models.find((m) => m.id === store.modelId);
  return (
    <Card theme={theme}>
      <Row theme={theme}>
        <View style={s.rowText}>
          <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>Выбранная модель</Text>
          <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>{cur?.name || "не выбрана"}</Text>
        </View>
        {cur ? <BrandIcon providerID={store.providerId || ""} size={18} color={theme.muted} /> : null}
      </Row>
      <Row theme={theme} last>
        <View style={s.rowText}>
          <Text style={{ fontSize: 13.5, color: theme.ink, fontWeight: "600" }}>Размышления</Text>
          <Text style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>{variantName(store.variant)}</Text>
        </View>
      </Row>
    </Card>
  );
}

const s = StyleSheet.create({
  scrim: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.30)" },
  window: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "100%",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 60,
    paddingBottom: 8,
  },
  iconBtn: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  railGroup: {
    fontSize: 10.5,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 5,
  },
  railItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
  },
  rowText: { flex: 1, minWidth: 0 },
  badge: { fontSize: 10, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  keyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 7,
  },
  textInput: {
    height: 38,
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 12.5,
    marginTop: 4,
  },
});
