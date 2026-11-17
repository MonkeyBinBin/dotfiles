// What the whole railway is up to, shared by every role: each agent is a train with a code, a destination (its title)
// and a status word, in the inks of a night dispatch office (amber LED on black, signal lamps).
import { agents, spaces, terminals, shared, setShared } from "herdr";
import { byContact } from "./kit/contacts.js";
import { trainCode } from "./kit/trains.js";

export const ICON = "mods/dispatch/icons";

export const INK = {
  night: "#07090b", board: "#0d1013", flap: "#15191d", flapLo: "#1b2025", seam: "#030405",
  // Solari's off-white on matte black flaps; the status column keeps the signal colours
  cream: "#f2ead8", creamDim: "#8a8476", stopFlap: "#3a0d0a", stopFlapLo: "#45110d",
  amber: "#ffb03a", amberDim: "#8a5c1c", amberFaint: "#3a2a12",
  green: "#5cf08a", yellow: "#ffe05a", red: "#ff4a3a", redDeep: "#4a0e0a", steel: "#6a8aa8", steelDim: "#34465a",
  rail: "#5a4a36", plate: "#e8a03a", plateLo: "#d08c2c", plateText: "#1e1406",
};

// Who needs the person first.
export const RANK = { blocked: 0, done: 1, working: 2, idle: 3 };
export const WORD = { working: "RUNNING", done: "ARRIVED", blocked: "SIGNAL STOP", idle: "DEPOT" };
export const STATUS_INK = { working: INK.amber, done: INK.yellow, blocked: INK.red, idle: INK.steel };
// The signal lamp beside each track.
export const LAMP = { working: INK.green, done: INK.yellow, blocked: INK.red, idle: INK.steelDim };

export const tabsById = () => new Map(spaces().flatMap((s) => s.tabs.map((tb) => [tb.id, tb])));

/** Every agent as a train, oldest first: { agent, code, dest, line, remark, status, since }; its line is its space. */
export function trains() {
  const tabs = tabsById(), terms = new Map(terminals().map((t) => [t.address, t]));
  return byContact(agents()).map((a, i) => {
    const tab = tabs.get(a.tab);
    return {
      agent: a,
      code: trainCode(a, i),
      dest: a.title || tab?.name || a.program?.name || a.address,
      line: a.space_name ?? "",
      remark: remarkOf(a, terms.get(a.address)),
      status: a.status,
      since: (a.status === "working" ? tab?.working_since : null) ?? tab?.changed_at ?? null,
    };
  });
}

/** The board's order: whoever needs the person first, then by number. */
export const boardOrder = (list) => [...list].sort((a, b) => RANK[a.status] - RANK[b.status] || (a.code < b.code ? -1 : 1));

/** "NOW", "12M", "3H", "2D". */
export function since(ms, now = Date.now()) {
  if (!ms) return "";
  const m = Math.floor((now - ms) / 60000);
  if (m < 1) return "NOW";
  if (m < 60) return `${m}M`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}H` : `${Math.floor(h / 24)}D`;
}

// What Claude Code reports on its terminal (the helm-bridge mod): what it's doing, why it stopped, how its tanks are.
const labelsOf = (a) => terminals().find((t) => t.address === a.address)?.labels ?? {};
export const workIcon = (a) => labelsOf(a)["cc.op"] || "";
export const stopReason = (a) => labelsOf(a)["cc.sos"] || "";
/** The board's remark for a train, given its terminal: why it stopped, else what the agent last reported ("Running
 *  tests", a summary), on one line. */
const remarkOf = (a, term) =>
  ((a.status === "blocked" && term?.labels?.["cc.sos"]) || term?.report?.msg || "").replace(/\s+/g, " ").trim();

/** The cab's gauges: water = context used, coal = budget used (0..100), wrench = failed calls in a row. */
export function gaugesOf(a) {
  const l = labelsOf(a);
  return { water: Number(l["cc.o2"] || 0), coal: Number(l["cc.fuel"] || 0), faults: Number(l["cc.hull"] || 0) };
}

/** The icon for what a stop is about ("Bash: git push", "Question", "linear:save_issue"). */
export function stopIcon(reason) {
  const tool = reason.split(":")[0];
  if (tool === "Question") return "ask";
  if (["Edit", "MultiEdit", "Write", "NotebookEdit"].includes(tool)) return "edit";
  if (tool === "Bash") return "bash";
  if (["Read", "Grep", "Glob"].includes(tool)) return "read";
  if (["WebFetch", "WebSearch"].includes(tool)) return "web";
  if (["Agent", "Task"].includes(tool)) return "agent";
  return "gear";
}

// The train models (scripts/herdr-sub/fx/dispatch/train.js). A running service draws a new one at random each run; the
// one a train stands in is shared, so its pane header shows the same train pulling in.
export const MODELS = ["emu", "bullet", "dmu", "loco", "tram"];
export const randomModel = () => MODELS[Math.floor(Math.random() * MODELS.length)];
const MODEL_KEY = "dispatch.trains";
export const modelOf = (address) => shared(MODEL_KEY)?.[address] ?? MODELS[(Number(address.match(/\d+/)?.[0]) || 0) % MODELS.length];
export function rememberModel(address, model) {
  const all = shared(MODEL_KEY) ?? {};
  if (all[address] !== model) setShared(MODEL_KEY, { ...all, [address]: model });
}
