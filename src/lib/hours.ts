import { MALL_HOURS, Store } from "./stores";

type Window = { open: number; close: number } | null; // minutes since midnight

function parseWindow(s: string | undefined): Window {
  if (!s || s === "closed") return null;
  const [a, b] = s.split("-");
  const toM = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return { open: toM(a), close: toM(b) };
}

export function windowForDay(store: Store, dow: number): Window {
  const h = store.hours ?? "mall";
  const src = h === "mall" ? MALL_HOURS : h;
  // 0=Sun, 1-5=Mon-Fri, 6=Sat
  if (dow === 0) return parseWindow(src.sun);
  if (dow === 6) return parseWindow(src.sat);
  return parseWindow(src.mon_fri);
}

export function isOpenAt(store: Store, when: Date): boolean {
  const w = windowForDay(store, when.getDay());
  if (!w) return false;
  const m = when.getHours() * 60 + when.getMinutes();
  return m >= w.open && m < w.close;
}
