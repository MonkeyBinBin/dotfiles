import type { EngineInterface } from 'claude-code'

// The big moments of rpg-hud's game, cried out in the band's big pixel letters for a moment: a level up, a boss
// appearing or slain, the hero knocked out or revived, a commit saved or a push delivered, a companion sent off in
// the background back from its quest. The band shows the facts again once it passes.

export const BANNER_MS = 2500
// Ticks each colour of a banner's shimmer holds on the terminal.
export const SHIMMER_TICKS = 4

export type BannerColor = 'yellow' | 'red' | 'green' | 'magenta' | 'cyan'

export type Banner = { word: string; icon: string; label: string; color: BannerColor; until: number }

// What the banners read of rpg-hud's state; all of it absent when that mod is not running.
export type HudMoments = {
  // Until when the status panel glows after a level up.
  flashUntil?: number
  bossFx?: { event: 'appear' | 'hit' | 'defeat'; at: number; boss: { name: string } } | null
  // `isBackground`: sent with run_in_background, so nothing in the transcript waits on its return.
  pets?: readonly { status: string; endedAt?: number; description: string; isBackground?: boolean }[]
  knockout?: { state: 'down' | 'up'; at: number } | null
  mapFx?: { event: 'save' | 'deliver'; at: number } | null
}

// Another plugin's state is read-only. Read while drawing, so its writes redraw the band.
export async function readMoments($: EngineInterface): Promise<HudMoments> {
  // The engine lists every value a module reads, so each key is written out.
  const [flash, fx, pets, knockout, mapFx] = await Promise.all([
    $.state.get({ plugin: 'rpg-hud', key: 'flashUntil' } as never).catch(() => undefined),
    $.state.get({ plugin: 'rpg-hud', key: 'bossFx' } as never).catch(() => undefined),
    $.state.get({ plugin: 'rpg-hud', key: 'pets' } as never).catch(() => undefined),
    $.state.get({ plugin: 'rpg-hud', key: 'knockout' } as never).catch(() => undefined),
    $.state.get({ plugin: 'rpg-hud', key: 'mapFx' } as never).catch(() => undefined),
  ])
  return {
    flashUntil: flash?.value as HudMoments['flashUntil'],
    bossFx: fx?.value as HudMoments['bossFx'],
    pets: pets?.value as HudMoments['pets'],
    knockout: knockout?.value as HudMoments['knockout'],
    mapFx: mapFx?.value as HudMoments['mapFx'],
  }
}

// A label stays short, so the banner's block never crowds the slime off the band.
const LABEL_MAX = 30
const short = (text: string): string => (text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}…` : text)

// The banner showing at `now`, the biggest moment first: a slain boss, a boss appearing, a knockout, a level up,
// a revive, a delivery, a save, a return.
// A pet the turn waited on reports in the transcript already; only one sent off in the background gets a banner.
export const bannerFor = (moments: HudMoments, now: number): Banner | undefined => {
  const fx = moments.bossFx
  if (fx != null && now - fx.at < BANNER_MS) {
    if (fx.event === 'defeat') return { word: 'VICTORY!', icon: '⚑', label: short(`${fx.boss.name} is defeated`), color: 'yellow', until: fx.at + BANNER_MS }
    if (fx.event === 'appear') return { word: 'BOSS!', icon: '☠', label: short(`a wild ${fx.boss.name} appears`), color: 'red', until: fx.at + BANNER_MS }
  }
  const ko = moments.knockout
  if (ko != null && ko.state === 'down' && now - ko.at < BANNER_MS) {
    return { word: 'GAME OVER', icon: '💀', label: 'a clean cast revives the hero', color: 'red', until: ko.at + BANNER_MS }
  }
  if (moments.flashUntil !== undefined && moments.flashUntil > now) {
    return { word: 'LEVEL UP!', icon: '✦', label: 'the hero grows stronger', color: 'magenta', until: moments.flashUntil }
  }
  if (ko != null && ko.state === 'up' && now - ko.at < BANNER_MS) {
    return { word: 'REVIVE!', icon: '✨', label: 'every heart restored', color: 'green', until: ko.at + BANNER_MS }
  }
  const map = moments.mapFx
  if (map != null && now - map.at < BANNER_MS) {
    return map.event === 'deliver'
      ? { word: 'DELIVERED!', icon: '🏰', label: 'the loot reaches the castle', color: 'yellow', until: map.at + BANNER_MS }
      : { word: 'SAVED!', icon: '💾', label: 'progress saved', color: 'cyan', until: map.at + BANNER_MS }
  }
  const back = (moments.pets ?? [])
    .filter(pet => pet.isBackground === true && pet.status === 'ok' && pet.endedAt !== undefined && now - pet.endedAt < BANNER_MS)
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0]
  if (back?.endedAt !== undefined) {
    return { word: 'QUEST CLEAR', icon: '♣', label: short(`${back.description} returned`), color: 'green', until: back.endedAt + BANNER_MS }
  }
  return undefined
}
