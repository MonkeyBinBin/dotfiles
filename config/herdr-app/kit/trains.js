// Dispatch's train codes, C01.., X02..: the agent's tool letter and its number in the order the terminals were made,
// so a train keeps its code while it runs. The board, the tracks and the toast all name a train by it.
import { toolOf } from "./escorts.js";
import { byContact } from "./contacts.js";

const LETTER = { claude: "C", codex: "X", gemini: "G", other: "A" };

/** The code of the agent at index `i` of byContact's order. */
export const trainCode = (a, i) => `${LETTER[toolOf(a)]}${String(i + 1).padStart(2, "0")}`;

/** address -> "C01", "X02", ... for every agent in `list`. */
export const trainCodes = (list) => new Map(byContact(list).map((a, i) => [a.address, trainCode(a, i)]));
