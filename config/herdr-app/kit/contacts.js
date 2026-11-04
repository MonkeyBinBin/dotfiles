// Contact numbers, C1.., in the order the terminals were made (the number in their address), so a sub keeps its
// number while it works. The cards show them and the agent keys (sub-tabs) jump by them.
const made = (address) => Number(address.match(/\d+/)?.[0] ?? 0);

/** Agents oldest first. */
export const byContact = (list) => [...list].sort((a, b) => made(a.address) - made(b.address) || (a.address < b.address ? -1 : 1));

/** address -> "C1", "C2", ... */
export const contacts = (list) => new Map(byContact(list).map((a, i) => [a.address, `C${i + 1}`]));
