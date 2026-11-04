// An agent's escorts: the helpers it has out that aren't in agents().
import { agents, panes, terminals } from "herdr";

const ESCORT_LABEL = "cc.sub.";

/** "claude" | "codex" | "gemini" | "other": the livery of a sub or an escort. */
export function toolOf(a) {
  const app = `${a.app ?? ""} ${a.program?.key ?? ""} ${a.program?.name ?? ""}`.toLowerCase();
  if (app.includes("claude")) return "claude";
  if (app.includes("codex")) return "codex";
  if (app.includes("gemini")) return "gemini";
  return "other";
}

/** `{ key, name, status, tool, since?, address? }` for each of an agent's escorts.
 *  - Claude Code's in-process subagents aren't terminals, so its hooks report them as labels on its terminal
 *    (config/claude/.config/claude/herdr-subagents.sh): no `address`, nothing to look at, always working.
 *  - Terminals it started with `hc run` and that have no pane, and theirs, with an `address` for the periscope. A
 *    helper never reads as done: that news is its parent's. */
export function escortsOf(address, all = terminals(), shown = new Set(panes().map((p) => p.terminal))) {
  const me = all.find((t) => t.address === address);
  const inProcess = Object.entries(me?.labels ?? {}).filter(([k]) => k.startsWith(ESCORT_LABEL)).map(([k, v]) => {
    const at = v.lastIndexOf("@");
    return { key: k, name: v.slice(0, at) || "agent", status: "working", tool: "claude", since: Number(v.slice(at + 1)) * 1000 };
  });
  const started = all.filter((t) => t.parent === address && t.state === "live" && !shown.has(t.address)).flatMap((t) => [
    {
      key: t.address, address: t.address, name: t.name || t.template || t.program?.name || t.address, tool: toolOf(t),
      status: t.status === "error" ? "blocked" : t.status === "done" ? "idle" : t.status,
    },
    ...escortsOf(t.address, all, shown),
  ]);
  return [...inProcess, ...started];
}

/** The escorts waiting on the person: they sound the same alarms a blocked agent does. */
export const sosEscorts = (list = agents()) => list.flatMap((a) => escortsOf(a.address)).filter((e) => e.status === "blocked");
