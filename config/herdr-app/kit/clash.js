// Agents stepping on each other: at work in one checkout, on one branch. A worktree is its own checkout, so it never clashes.
// `checkout(agent)` says which: a string, or null when not known (yet) or not a git repo.
const BUSY = new Set(["working", "blocked"]);

/** The groups of two or more busy agents sharing a checkout. */
export function clashes(list, checkout) {
  const groups = new Map();
  for (const a of list) {
    const at = BUSY.has(a.status) ? checkout(a) : null;
    if (at) groups.set(at, [...(groups.get(at) ?? []), a]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}
