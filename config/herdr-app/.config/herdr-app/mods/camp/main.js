// The camp: That Monkey's lazy-hero interface for Herdr. One mod, several roles picked by props.role,
// so the state, the lines and the art live in one place.
import { View, div } from "gpui-kit";
import { props } from "herdr";
import { Band } from "./roles/band.js";

const ROLES = { band: Band };

export default class Camp extends View {
  init(p, cx) {
    const Role = ROLES[p?.role] ?? Band;
    this.role = new Role(cx);
  }

  render(cx) {
    return this.role ? this.role.render(cx, props()) : div();
  }

  async close(cx) {
    this.role?.close?.(cx);
  }
}
