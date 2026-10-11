// The cast bar for surfaces that draw SVG: the charge and the landing flash run by SMIL in the surface's
// sandboxed frame, so nothing blits; the hook draws again only when the call lands and when the flash is over.

import type { Landing } from './register'

// CSS pixels a column is taken to span; an overestimate only scales the bar down to its slot.
const COLUMN_PX = 8
const HEIGHT = 6

// The bar's size in CSS pixels, given to the Svg: a sandboxed frame left to size itself takes the browser's default
// 150px height.
export const castSize = (columns: number) => ({ width: columns * COLUMN_PX, height: HEIGHT })

const hex = (rgb: number): string => `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`

const shell = (width: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}">` +
  `<clipPath id="c"><rect width="${width}" height="${HEIGHT}" rx="${HEIGHT / 2}"/></clipPath>` +
  `<g clip-path="url(#c)"><rect width="${width}" height="${HEIGHT}" fill="#3a3a3a"/>${body}</g></svg>`

// One charge sweeps the bar in `chargeMs` behind a white head, then the full bar pulses for `pulseMs`; again.
export const chargeSvg = (color: number, columns: number, chargeMs: number, pulseMs: number): string => {
  const width = columns * COLUMN_PX
  const cycle = chargeMs + pulseMs
  const full = (chargeMs / cycle).toFixed(4)
  const pulse = [0, 0.25, 0.5, 0.75].map(step => ((chargeMs + pulseMs * step) / cycle).toFixed(4))
  const c = hex(color)
  return shell(
    width,
    `<linearGradient id="f"><stop offset="0" stop-color="${c}" stop-opacity="0.55"/><stop offset="1" stop-color="${c}"/></linearGradient>` +
      `<rect height="${HEIGHT}" width="0" fill="url(#f)">` +
      `<animate attributeName="width" values="0;${width};${width}" keyTimes="0;${full};1" dur="${cycle}ms" repeatCount="indefinite"/>` +
      `<animate attributeName="fill" values="url(#f);${c};#ffffff;${c};#ffffff" keyTimes="0;${pulse.join(';')}" calcMode="discrete" dur="${cycle}ms" repeatCount="indefinite"/>` +
      `</rect>` +
      `<rect y="0" width="${COLUMN_PX}" height="${HEIGHT}" fill="#ffffff">` +
      `<animate attributeName="x" values="0;${width - COLUMN_PX};${width}" keyTimes="0;${full};1" dur="${cycle}ms" repeatCount="indefinite"/>` +
      `</rect>`,
  )
}

// The landing, once through in `flashMs`: a hit glows in the skill's colour and fades, a miss blinks red, a
// fled call greys out.
export const flashSvg = (landing: Landing, color: number, columns: number, flashMs: number): string => {
  const width = columns * COLUMN_PX
  if (landing === 'miss') {
    return shell(
      width,
      `<rect width="${width}" height="${HEIGHT}" fill="#ff3b3b">` +
        `<animate attributeName="fill" values="#ff3b3b;#5a1010" calcMode="discrete" dur="${Math.round(flashMs / 2.5)}ms" repeatCount="indefinite"/>` +
        `</rect>`,
    )
  }
  const fill = landing === 'fled' ? '#808080' : hex(color)
  return shell(
    width,
    `<rect width="${width}" height="${HEIGHT}" fill="${fill}">` +
      (landing === 'hit' ? `<animate attributeName="fill" values="#ffffff;${fill}" keyTimes="0;0.2" calcMode="discrete" dur="${flashMs}ms" fill="freeze"/>` : '') +
      `<animate attributeName="opacity" values="1;1;0.15" keyTimes="0;0.4;1" dur="${flashMs}ms" fill="freeze"/>` +
      `</rect>`,
  )
}
