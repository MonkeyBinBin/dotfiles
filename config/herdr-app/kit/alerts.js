// The alert sounds, played by the layout's own mods instead of Herdr (settings.json has Herdr's sounds off), so each
// layout rings its own: the sub its 8-bit fanfare and alarm, dispatch its PA chimes. Like Herdr's: a sound when an
// agent comes to need the person (blocked) or finishes while they aren't looking (Herdr reports that as `done`).
// Call watch() from a render that runs while the layout shows; the first call only takes note of where things stand.
import { agents, checking, playSound } from "herdr";

export class Alerts {
  /** sounds: { done, blocked }, files relative to the app's folder. */
  constructor(sounds) {
    this.sounds = sounds;
    this.seen = null; // address -> status
  }

  watch() {
    const now = new Map(agents().map((a) => [a.address, a.status]));
    let ring = null;
    if (this.seen) {
      for (const [address, status] of now) {
        if (this.seen.get(address) === status || !this.sounds[status]) continue;
        // a blocked agent outranks a finished one when both happen at once
        if (status === "blocked" || !ring) ring = status;
      }
    }
    this.seen = now;
    if (ring && !checking()) playSound(this.sounds[ring]);
  }
}
