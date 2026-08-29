export type Theme = {
  dark: boolean;
  bg: string;
  l1: string;
  l2: string;
  l3: string;
  ink: string;
  muted: string;
  faint: string;
  bd: string;
  bdSoft: string;
  wm: string;
  ok: string;
  okBg: string;
  err: string;
  errBg: string;
  warn: string;
  scrim: string;
  acc: string;
  avBg: string;
  avFg: string;
  sndOn: string;
  sndOff: string;
};

const LIGHT: Theme = {
  dark: false,
  bg: "#ffffff",
  l1: "#fafafa",
  l2: "#f4f4f4",
  l3: "#ededed",
  ink: "#161616",
  muted: "#6b6b6b",
  faint: "#9a9a9a",
  bd: "rgba(0,0,0,0.10)",
  bdSoft: "rgba(0,0,0,0.07)",
  wm: "#f1f1f1",
  ok: "#1d783c",
  okBg: "rgba(73,201,112,0.13)",
  err: "#b82d35",
  errBg: "rgba(241,72,79,0.10)",
  warn: "#ac8833",
  scrim: "rgba(0,0,0,0.34)",
  acc: "#3b5cf6",
  avBg: "#3f3f3f",
  avFg: "#ffffff",
  sndOn: "#242424",
  sndOff: "#e4e4e4",
};

const DARK: Theme = {
  dark: true,
  bg: "#161616",
  l1: "#1d1d1d",
  l2: "#242424",
  l3: "#2e2e2e",
  ink: "#fafafa",
  muted: "#aeaeae",
  faint: "#7d7d7d",
  bd: "rgba(255,255,255,0.11)",
  bdSoft: "rgba(255,255,255,0.07)",
  wm: "#202020",
  ok: "#49c970",
  okBg: "rgba(73,201,112,0.12)",
  err: "#f1484f",
  errBg: "rgba(241,72,79,0.12)",
  warn: "#f6c251",
  scrim: "rgba(0,0,0,0.55)",
  acc: "#7698fd",
  avBg: "#d2d2d2",
  avFg: "#161616",
  sndOn: "#5c5c5c",
  sndOff: "#303030",
};

export function makeTheme(dark: boolean): Theme {
  return dark ? DARK : LIGHT;
}
