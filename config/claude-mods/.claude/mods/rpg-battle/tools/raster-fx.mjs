#!/usr/bin/env node
// Adds Raster cells beside frames already baked by bake-fx.mjs: reads <dir>/meta.json and its PNGs, writes
// raster-<C>x<R>.json for each size, leaving the pictures as they are.
//
//   node tools/raster-fx.mjs <assets/fx/name> 22x7[,11x4] [--coverage 0.12]

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { decodePNG, writeRasters } from './raster.mjs'

const [dir, sizes, flag, value] = process.argv.slice(2)
const coverage = flag === '--coverage' ? Number(value) : undefined
if (!dir || !sizes) {
  console.error('usage: node tools/raster-fx.mjs <baked fx dir> CxR[,CxR...]')
  process.exit(1)
}
const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'))
const pictures = Array.from({ length: meta.frames }, (_, n) => decodePNG(readFileSync(join(dir, `${n}.png`))))
const { w, h } = pictures[0]
console.log(`${dir}: ${pictures.length} frames, ${w}x${h} px`)
writeRasters(dir, pictures.map(p => p.rgba), w, h, sizes.split(','), coverage)
