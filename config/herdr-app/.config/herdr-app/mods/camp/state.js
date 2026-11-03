// What the whole camp is up to, shared by every role.
import { layout } from "herdr";

export const ART = "mods/camp/assets";
// Status order: who needs the person first.
export const RANK = { blocked: 0, done: 1, working: 2, idle: 3 };
export const LABEL = { blocked: "求援", done: "凱旋", working: "出征", idle: "待命" };

/** The mood every agent adds up to (the band adds "happy" for a moment when one finishes). */
export function baseMood(list) {
  if (list.some((a) => a.status === "blocked")) return "alarm";
  if (list.some((a) => a.status === "working")) return "sleep";
  return "idle";
}

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

/** The sidebar is a rail when it's narrower than 160 px (dragged, or folded by the toggle). */
export const sidebarNarrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;
export const sidebarWidth = () => find(layout(), "sidebar")?.size?.px;

/** "剛剛", "12 分", "3 時" since ms. */
export function since(ms, now = Date.now()) {
  if (!ms) return "";
  const m = Math.floor((now - ms) / 60000);
  if (m < 1) return "剛剛";
  if (m < 60) return `${m} 分`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} 時` : `${Math.floor(h / 24)} 天`;
}
