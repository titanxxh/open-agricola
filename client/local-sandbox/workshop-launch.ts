/**
 * Workshop-side glue for the browser-local sandbox, the only place Workshop
 * code runs (ADR 0052): assembles a `LocalGameConfig` from workshop state and
 * hands it to the embedded game iframe via sessionStorage (same-origin). The
 * game iframe reports its status back with `LOCAL_SANDBOX_STATUS`.
 */
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
  card_edition?: 'classic'
  classic_deck_ids?: string[]
  enable_through_the_seasons: boolean
  enable_farmers_of_the_moor: boolean
  allow_incomplete_farmers_of_the_moor_minor_deal: boolean
  enable_snake_opening: boolean
}

export const toLocalCard = (card: WorkshopSandboxCardLike): LocalCardInput => ({
  cardType: card.card_type,
  cardJson: card.card_json as LocalCardInput['cardJson'],
  source: card.effect_code,
  artUrl: card.art_url,
})

/** A pinned Draft Version snapshot (`pin-version` response) as a sandbox card. */
export const pinnedVersionToLocalCard = (cardJson: Record<string, unknown>, artUrl: string | null): LocalCardInput => {
  const definition = { ...cardJson }
  const source = definition._code
  delete definition._code
  delete definition._compiled
  const cardType = definition.card_type
  if (cardType !== 'minor' && cardType !== 'occupation') throw new Error('Pinned version has no card type')
  if (typeof source !== 'string' || !source.trim()) throw new Error('Pinned version has no source')
  return { cardType, cardJson: definition as LocalCardInput['cardJson'], source, artUrl }
}

export const buildLocalGameConfig = (
  cards: ReadonlyArray<LocalCardInput>,
  settings: WorkshopSandboxSettingsLike,
  launch: { instanceId: string; seed: number },
): LocalGameConfig => ({
  instanceId: launch.instanceId,
  seed: launch.seed,
  cards: [...cards],
  playerCount: settings.player_count,
  deckIds: settings.deck_ids,
  ...(settings.card_edition === 'classic'
    ? { cardEdition: 'classic', classicDeckIds: settings.classic_deck_ids }
    : {}),
  enableThroughTheSeasons: settings.enable_through_the_seasons,
  enableFarmersOfTheMoor: settings.enable_farmers_of_the_moor,
  allowIncompleteFarmersOfTheMoorMinorDeal: settings.allow_incomplete_farmers_of_the_moor_minor_deal,
  enableSnakeOpening: settings.enable_snake_opening,
})

export const stashLocalSandboxConfig = (config: LocalGameConfig, ownerKey: string): void => {
  sessionStorage.setItem(STASH_KEY, JSON.stringify({ owner: ownerKey, config }))
}

// Reject a stash left by a different account on a shared browser (the config
// carries unpublished effect_code source). Same-origin sessionStorage survives
// logout within a tab, so ownership is verified on read rather than trusted.
export const readLocalSandboxConfig = (ownerKey: string): LocalGameConfig | null => {
  try {
    const raw = sessionStorage.getItem(STASH_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { owner?: string; config?: LocalGameConfig }
    if (parsed.owner !== ownerKey || !parsed.config) {
      sessionStorage.removeItem(STASH_KEY)
      return null
    }
    return parsed.config
  } catch {
    return null
  }
}

/** Message type the embedded game posts to its Workshop parent. */
export const LOCAL_SANDBOX_STATUS = 'open-agricola:local-sandbox-status'

export type LocalSandboxStatus =
  | { type: typeof LOCAL_SANDBOX_STATUS; kind: 'running'; instanceId: string; cardWarnings: string[] }
  | { type: typeof LOCAL_SANDBOX_STATUS; kind: 'failed'; instanceId: string; error: string }

export const parseLocalSandboxStatus = (value: unknown): LocalSandboxStatus | null => {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  if (data.type !== LOCAL_SANDBOX_STATUS || typeof data.instanceId !== 'string') return null
  if (data.kind === 'running' && Array.isArray(data.cardWarnings)
    && data.cardWarnings.every((warning): warning is string => typeof warning === 'string')) {
    return { type: LOCAL_SANDBOX_STATUS, kind: 'running', instanceId: data.instanceId, cardWarnings: data.cardWarnings }
  }
  if (data.kind === 'failed' && typeof data.error === 'string') {
    return { type: LOCAL_SANDBOX_STATUS, kind: 'failed', instanceId: data.instanceId, error: data.error }
  }
  return null
}
