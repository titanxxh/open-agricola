/**
 * Client-side card metadata service.
 *
 * Fetches `public/cards-manifest.json` at app startup (see `App.tsx`) and
 * exposes synchronous lookups for UI components. Replaces direct imports of
 * `shared/cards/catalog.ts` / `shared/cards/major` from the client, which
 * would otherwise pull 886 card instances (~260KB gzip) into the main bundle.
 *
 * The manifest is built by `scripts/build-cards-manifest.ts` — keep the
 * `CardMeta` type in sync with that script's output.
 */
import {
  getCustomMinorImprovement,
  getCustomOccupation,
} from '../../shared/cards/custom-registry'
import type { CardBase } from '../../shared/cards/types'

export type CardMeta = {
  id: string
  name: string
  deck: string
  number: number
  /** Construction type: mirrors the backing card class. */
  type?: 'occupation' | 'minor' | 'major' | 'playerAction'
  category?: string
  desc?: string[]
  cost?: Record<string, number>
  altCosts?: Record<string, number>[]
  players?: string
  newSet?: boolean
  prerequisite?: unknown
  vp?: number
  isCookery?: boolean
  isBaking?: boolean
  passing?: boolean
  returnCards?: string[]
  alsoCountsAs?: string[]
}

export type CardManifestEntry = {
  meta: CardMeta
  module: string
  reaches: string[]
}

export type CardsManifestPayload = Record<string, CardManifestEntry>

const resolveManifestUrl = (): string => {
  const base =
    (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/'
  const normalised = base.endsWith('/') ? base : `${base}/`
  return `${normalised}cards-manifest.json`
}

let manifestPromise: Promise<Record<string, CardMeta>> | null = null
let manifestCache: Record<string, CardMeta> | null = null

export const loadCardsManifest = (): Promise<Record<string, CardMeta>> => {
  if (manifestCache) return Promise.resolve(manifestCache)
  if (!manifestPromise) {
    const url = resolveManifestUrl()
    manifestPromise = fetch(url)
      .then((res) => {
        if (!res.ok) {
          throw new Error(
            `[card-meta] manifest fetch failed ${res.status} ${res.statusText}`,
          )
        }
        return res.json() as Promise<CardsManifestPayload>
      })
      .then((payload) => {
        const flat: Record<string, CardMeta> = {}
        for (const [id, entry] of Object.entries(payload)) {
          if (entry?.meta) flat[id] = entry.meta
        }
        manifestCache = flat
        return flat
      })
      .catch((err) => {
        // Reset so a subsequent call can retry.
        manifestPromise = null
        throw err
      })
  }
  return manifestPromise
}

const customCardToMeta = (card: CardBase, type: 'minor' | 'occupation'): CardMeta => ({
  id: card.id,
  name: card.name,
  deck: card.deck,
  number: card.number,
  type,
  category: card.category,
  desc: card.desc,
  // Custom cards use simple Partial<Resource> costs (ComplexCost is majors-only).
  cost: card.cost as Record<string, number> | undefined,
  altCosts: card.altCosts,
  players: card.players,
  newSet: card.newSet,
  prerequisite: card.prerequisite,
  vp: card.vp,
  isCookery: card.isCookery,
  isBaking: card.isBaking,
  passing: card.passing,
  returnCards: card.returnCards,
  alsoCountsAs: card.alsoCountsAs,
})

const getCustomCardMeta = (id: string): CardMeta | undefined => {
  if (!id.startsWith('CUSTOM_')) return undefined
  const minor = getCustomMinorImprovement(id)
  if (minor) return customCardToMeta(minor, 'minor')
  const occupation = getCustomOccupation(id)
  if (occupation) return customCardToMeta(occupation, 'occupation')
  return undefined
}

/**
 * Synchronous lookup; returns undefined if neither the static manifest nor the
 * runtime custom-card registry knows this id.
 */
export const getCardMeta = (id: string): CardMeta | undefined =>
  manifestCache?.[id] ?? getCustomCardMeta(id)

/** Test-only helper: discard cache + in-flight promise. Do not call from runtime. */
export const __resetCardsManifestCache = (): void => {
  manifestCache = null
  manifestPromise = null
}
