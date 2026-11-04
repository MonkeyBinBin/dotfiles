// The radio: words sent straight to one or more agents, without going through another agent. Tick who hears it, pick a standing
// order or type one, Enter or SEND. An order only fills the box: nothing goes out until it's sent. An agent waiting on a
// question can't be tuned in: what's sent would answer it. Props: { terminal?, overlay }.
import { div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { agents, closeOverlay, hc, notify, setShared } from "herdr";
import { framed } from "../kit/frame.js";
import { key as keyPlate } from "../kit/panel.js";
import { sprite } from "../kit/sprite.js";
import { INK, STATUS_INK, WORD, contacts, titleOf } from "../state.js";
import { byContact } from "../kit/contacts.js";

const ORDERS = [
  ["COMMIT", "請 commit 目前的變更。"],
  ["MERGE", "請 merge 回 main。"],
  ["CHECK", "請檢查目前的改動，只回報需要處理的問題。"],
  ["STATUS", "請回報目前的進度。"],
];

export class Radio {
  constructor(cx) {
    this.picked = new Set();
    this.tuned = false;
    this.sending = false;
    this.note = null;
    this.text = "";
    this.input = InputState.new({ placeholder: "Message" });
    this.input.on("change", (_e, cx) => {
      const had = Boolean(this.text.trim());
      this.text = this.input.value();
      if (had !== Boolean(this.text.trim())) cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.send(cx));
    // the dialog takes the keyboard as it opens: ask again once it has
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
  }

  close() {
    setShared("sub.radio.open", null);
  }

  // Who can hear it now: ticked, still there, and not waiting on a question.
  hearers(list) {
    return list.filter((a) => this.picked.has(a.address) && a.status !== "blocked");
  }

  send(cx) {
    const to = this.hearers(agents()), text = this.text.trim();
    if (!to.length || !text || this.sending) return;
    this.sending = true;
    this.note = null;
    const ids = contacts(agents());
    cx.spawn(async (cx) => {
      const failed = [];
      for (const a of to) {
        const r = await hc(["send", a.address, text]).catch((e) => ({ code: 1, stderr: String(e) }));
        if (r.code !== 0) failed.push(ids.get(a.address));
      }
      this.sending = false;
      if (failed.length) this.note = `Couldn't reach ${failed.join(", ")}`;
      else {
        notify({ title: "Radio", body: `Sent to ${to.map((a) => ids.get(a.address)).join(", ")}`, timeout: 3000 });
        closeOverlay(this.overlay);
      }
      cx.notify();
    });
    cx.notify();
  }

  row(a, id) {
    const blocked = a.status === "blocked", on = this.picked.has(a.address) && !blocked;
    return h_flex().id(`r-${a.address}`).h(30).flex_none().px(6).gap(8).items_center().when(!blocked, (el) => el.hover((s) => s.bg(INK.rule)))
      .on_click((_e, cx) => {
        if (blocked) return;
        if (this.picked.has(a.address)) this.picked.delete(a.address);
        else this.picked.add(a.address);
        cx.notify();
      })
      .child(div().size(12).flex_none().border(2).border_color(on ? INK.gold : INK.dim).when(on, (el) => el.bg(INK.gold)))
      .child(div().w(24).flex_none().text_color(INK.dim).child(id))
      .child(sprite(`lamp-${a.status ?? "idle"}`, 10).flex_none())
      .child(div().flex_1().min_w(0).truncate().text_color(blocked ? INK.dim : INK.hi).child(titleOf(a)))
      .child(div().flex_none().max_w(150).truncate().text_color(INK.dim).child(a.space_name ?? ""))
      .child(div().w(64).flex_none().text_right().text_color(STATUS_INK[a.status]).child(blocked ? "ANSWER IT" : WORD[a.status]));
  }

  render(_cx, p) {
    const list = agents(), ids = contacts(list);
    this.overlay = p.overlay;
    // tuned once: to the agent it was opened on, else the one in focus
    if (!this.tuned) {
      this.tuned = true;
      const first = p.terminal ?? list.find((a) => a.focused)?.address;
      if (first) this.picked.add(first);
    }
    const ready = this.hearers(list).length > 0 && Boolean(this.text.trim()) && !this.sending;
    return framed("brass", v_flex().size_full().p(14).gap(10).bg(INK.glass).text_size(12)
      .child(h_flex().justify_between().items_center()
        .child(div().text_size(22).text_color(INK.hi).child("RADIO"))
        .child(div().text_color(INK.dim).child("Esc to close")))
      .child(div().flex_1().min_h(0).child(framed("well", v_flex().id("radio-crew").size_full().p(2).overflow_y_scrollbar()
        .when(!list.length, (el) => el.child(div().p(8).text_color(INK.dim).child("No crew out.")))
        .children(byContact(list).map((a) => this.row(a, ids.get(a.address)))))))
      .child(h_flex().gap(6).children(ORDERS.map(([label, text]) => keyPlate(`order-${label}`, label, false, 30, (cx) => {
        this.input.set_value(text);
        this.text = text;
        cx.notify();
      }))))
      .child(h_flex().flex_none().h(36).gap(6)
        .child(div().flex_1().min_w(0).h_full().cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .child(framed("well", div().size_full().px(8).flex().items_center().child(Input.new(this.input).h_full().w_full().text_size(12).text_color(INK.hi)))))
        .child(keyPlate("radio-send", this.sending ? "…" : "SEND", ready, 36, (cx) => this.send(cx))))
      .when(Boolean(this.note), (el) => el.child(div().text_color(INK.red).child(this.note))), { fill: INK.glass });
  }
}
