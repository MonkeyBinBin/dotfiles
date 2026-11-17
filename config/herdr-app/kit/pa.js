// Dispatch's PA board, hanging from the departure board: dispatch-toast queues each notification here and the board
// opens the PA window under its right side while anything is queued (it knows where it is; a toast doesn't).
export const PA = {
  key: "dispatch.pa", // shared: the queued announcements, newest first, [{ id, title, body, level, action, until }]
  open: "dispatch.pa.open", // shared: the overlay id of the PA window while it's up, so the board knows when it's gone
  rows: 3, // announcements shown at once: what needs the person first, then the newest
  keep: 12, // announcements queued at most, so a burst of notices can't push out one that needs the person
};
