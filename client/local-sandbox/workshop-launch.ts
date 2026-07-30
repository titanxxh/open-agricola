/**
 * Workshop-side glue for the browser-local sandbox: decides whether the
 * playtest runs locally, assembles a `LocalGameConfig` from workshop state,
 * and hands it to the embedded game iframe via sessionStorage (same-origin).
 */
import { SANDBOX_EXECUTOR } from '../config'
import type { LocalCardInput, LocalGameConfig } from './protocol.ts'

const STASH_KEY = 'open-agricola-local-sandbox-config'

export type WorkshopSandboxCardLike = {
  card_type: 'minor' | 'occupation'
  card_json: Record<string, unknown>
  effect_code: string | null
  art_url: string | null
}

export type WorkshopSandboxSettingsLike = {
  player_count: number
  deck_ids: string[]
  enable_through_the_seasons: boolean
  enable_farmers_of_the_moor: boolean
  allow_incomplete_farmers_of_the_moor_minor_deal: boolean
}

export const isBrowserSandbox = (): boolean => SANDBOX_EXECUTOR === 'browser'

export const buildLocalGameConfig = (
  cards: ReadonlyArray<WorkshopSandboxCardLike>,
  settings: WorkshopSandboxSettingsLike,
): LocalGameConfig => ({
  cards: cards.map((card): LocalCardInput => ({
    cardType: card.card_type,
    cardJson: card.card_json as LocalCardInput['cardJson'],
    source: card.effect_code,
    artUrl: card.art_url,
  })),
  playerCount: settings.player_count,
  deckIds: settings.deck_ids,
  enableThroughTheSeasons: settings.enable_through_the_seasons,
  enableFarmersOfTheMoor: settings.enable_farmers_of_the_moor,
  allowIncompleteFarmersOfTheMoorMinorDeal: settings.allow_incomplete_farmers_of_the_moor_minor_deal,
})

export const stashLocalSandboxConfig = (config: LocalGameConfig): void => {
  sessionStorage.setItem(STASH_KEY, JSON.stringify(config))
}

export const readLocalSandboxConfig = (): LocalGameConfig | null => {
  try {
    const raw = sessionStorage.getItem(STASH_KEY)
    return raw ? JSON.parse(raw) as LocalGameConfig : null
  } catch {
    return null
  }
}
