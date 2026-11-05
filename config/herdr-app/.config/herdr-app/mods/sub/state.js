// What the whole sub is up to, shared by every role.
import { agents, focused, spaces, terminals, openOverlay, closeOverlay, run, setShared } from "herdr";

export const ART = "mods/sub/assets";
// Status order: who needs the person first.
export const RANK = { blocked: 0, done: 1, working: 2, idle: 3 };
export const WORD = { blocked: "SOS", done: "LOOT", working: "DIVING", idle: "PARKED" };

// The sub's inks: phosphor on dark glass, sea blues, brass and steel plates.
export const INK = {
  glass: "#03150f", hi: "#b8ffd8", mid: "#5cdc94", dim: "#2f7f56", rule: "#0d3f28",
  red: "#ff5a4a", redSoft: "#ff8a7a", gold: "#ffd25a", idle: "#5a8aa8",
  sea: "#d8f8ff", seaDim: "#6aa0c0", seaId: "#5a8aa8", ruler: "#8ad8ff",
  brassText: "#2a1a06", brassShine: "#ecc874", steelText: "#8ab8b4", steelShadow: "#061214",
};
export const STATUS_INK = { blocked: INK.red, done: INK.gold, working: INK.mid, idle: INK.idle };

// Why an agent is calling for help, when it says: Claude Code reports it as a label on its terminal (the helm-bridge mod).
export const sosReason = (a) => labelsOf(a)["cc.sos"] || "";

const labelsOf = (a) => terminals().find((t) => t.address === a.address)?.labels ?? {};
const WARN_AT = 70, CRITICAL_AT = 90, HULL_AT = 3;

// What an agent is working on, as an icon's name, while it says so (helm-bridge's cc.op).
export const workIcon = (a) => labelsOf(a)["cc.op"] || "";

// Its warnings as icons' names: air and fuel past the status line's amber, a run of failed calls.
export function gaugesOf(a) {
  const labels = labelsOf(a), o2 = Number(labels["cc.o2"] || 0), fuel = Number(labels["cc.fuel"] || 0), hull = Number(labels["cc.hull"] || 0);
  const gauges = [];
  if (o2 >= WARN_AT) gauges.push(o2 >= CRITICAL_AT ? "o2-critical" : "o2");
  if (fuel >= WARN_AT) gauges.push(fuel >= CRITICAL_AT ? "fuel-critical" : "fuel");
  if (hull >= HULL_AT) gauges.push("hull");
  return gauges;
}

// The icon for what that reason is about (helm-bridge's words: "Bash: git push", "linear:save_issue", "Question").
export function sosIcon(reason) {
  const tool = reason.split(":")[0];
  if (tool === "Question") return "ask";
  if (["Edit", "MultiEdit", "Write", "NotebookEdit"].includes(tool)) return "edit";
  if (tool === "Bash") return "bash";
  if (["Read", "Grep", "Glob"].includes(tool)) return "read";
  if (["WebFetch", "WebSearch"].includes(tool)) return "web";
  if (["Agent", "Task"].includes(tool)) return "agent";
  return "gear";
}

export const toolName = (a) => a.program?.name ?? a.app ?? "agent";
export const titleOf = (a) => a.title || a.program?.name || a.address;

/** "now", "12m", "3h", "2d" since ms. */
export function since(ms, now = Date.now()) {
  if (!ms) return "";
  const m = Math.floor((now - ms) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

/** Each agent's tab, for its clocks. */
export const tabsById = () => new Map(spaces().flatMap((s) => s.tabs.map((tb) => [tb.id, tb])));

/** When the agent went under: its tab's working_since, else when its status last changed. */
export const underSince = (a, tabs) => tabs.get(a.tab)?.working_since ?? tabs.get(a.tab)?.changed_at;

// Under this long a working sub is under pressure (the warning ring); parked this long it overgrows (minutes).
export const PRESSURE_MIN = 30, MOSS_MIN = 60;
/** Minutes since an idle agent's tab last changed: how long it has been parked. */
export const minutesParked = (a, tabs, now = Date.now()) => {
  const at = tabs.get(a.tab)?.changed_at;
  return at ? (now - at) / 60000 : 0;
};

/** 0 at the surface .. 1 at the seabed, for minutes under: log-scaled, an hour reaches the bottom. */
export const RULER = [1, 5, 15, 30, 60];
export const depthOf = (min) => Math.max(0, Math.min(1, Math.log1p(Math.max(0, min)) / Math.log1p(60)));
export const minutesUnder = (a, tabs, now = Date.now()) => {
  const at = underSince(a, tabs);
  return at ? (now - at) / 60000 : 0;
};

export { contacts } from "./kit/contacts.js";

export { toolOf, escortsOf, sosEscorts } from "./kit/escorts.js";

/** A small stable hash of a string, for each contact's bearing on the scope. */
export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The pane an agent is in, if the person can see it right now: in the shown tab, and not behind a zoomed pane. */
function paneOnScreen(address) {
  const a = agents().find((x) => x.address === address), now = focused();
  if (a?.tab !== now.tab) return null;
  return tabsById().get(a.tab)?.zoomed && a.pane !== now.pane ? null : a.pane;
}

/** The periscope: a floating window over the work (drag it anywhere; it reopens where it was dropped) showing
 *  one agent's live terminal under a brass bar, so the person can watch it without leaving their tab. Opening
 *  another replaces it in place. A terminal has one size, so a window onto one already on screen would squeeze it
 *  there too: that agent's pane takes the focus and flashes its header instead (the pane role reads "sub.flash"). */
let scopeId = null;
export const FLASH_MS = 1200;
export function periscope(address) {
  const pane = paneOnScreen(address);
  if (pane) {
    if (scopeId) closeOverlay(scopeId);
    scopeId = null;
    run("pane.focus", { pane });
    setShared("sub.flash", { pane, until: Date.now() + FLASH_MS });
    return;
  }
  scopeId = openOverlay({
    kind: "window", key: "periscope", width: 760, height: 480,
    layout: {
      type: "column", border: { width: 4, color: "#c89c48" }, radius: 16, background: "#03150f",
      children: [
        { type: "block", size: { px: 36 }, content: { mod: "sub", props: { role: "scope", terminal: address } } },
        { type: "block", content: { terminal: address } },
      ],
    },
  });
}

/** Goes to an agent (a double-click), putting the periscope away first. */
export function goTo(address) {
  if (scopeId) closeOverlay(scopeId);
  scopeId = null;
  run("agent.focus", { terminal: address });
}

/** The radio dialog, tuned to one agent. */
export function radio(address) {
  openOverlay({ mod: "sub", kind: "dialog", width: 560, height: 430, frame: "none", props: { role: "radio", terminal: address } });
}

/** A sub's right-click menu, at the pointer: periscope, go to, radio, pin, rename its tab, close it. */
export function subMenu(address) {
  openOverlay({ mod: "sub", kind: "popup", width: 190, height: 212, frame: "none", props: { role: "menu", terminal: address } });
}
