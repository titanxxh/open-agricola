import { resourceFetch } from './resource-fetch'
/**
 * Client-side card metadata service.
 *
 * Loads generated card metadata and exposes synchronous lookups for UI components.
 * Production builds pin an exact content fingerprint. Replaces direct imports of
 * `shared/cards/catalog.ts` / `shared/cards/major` from the client, which
 * would otherwise pull 886 card instances (~260KB gzip) into the main bundle.
 *
 * The manifest is built by `scripts/build-cards-manifest.ts` — keep the
 * `CardMeta` type in sync with that script's output.
 */
import {
  getCustomCardMetadata,
  type CustomCardMetadata,
} from '../../shared/cards/custom-card-metadata'
import type { CardExchange } from '../../shared/contract/cards'
import { fetchVerifiedResource } from './fetch-verified-resource'

export type CardMeta = {
  authored?: true
  id: string
  name: string
  deck: string
  number: number
  /** Construction type: mirrors the backing card class. */
  type?: 'occupation' | 'minor' | 'major' | 'playerAction'
  playerActionCardType?: 'minor' | 'occupation'
  category?: string
  desc?: string[]
  rules?: string[]
  cost?: Record<string, number>
  altCosts?: Record<string, number>[]
  exchanges?: CardExchange[]
  players?: string
  prerequisite?: unknown
  vp?: number
  isCookery?: boolean
  isBaking?: boolean
  passing?: boolean
  returnCards?: string[]
  alsoCountsAs?: string[]
  enablesPalisades?: boolean
  artUrl?: string
  scanDeck?: 'L' | 'X' | 'legendairy-forest'
  scanNumber?: string
  scanArt?: string
  scanOverlay?: string
  locales?: Record<string, {
    name: string
    desc: string[]
    rules?: string[]
    prerequisite?: string
  }>
}

export type CardManifestEntry = {
  meta: CardMeta
  module: string
  reaches: string[]
}

export type CardsManifestPayload = Record<string, CardManifestEntry>

const fetchManifest = (): Promise<Response> => {
  const base =
    (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/'
  const normalised = base.endsWith('/') ? base : `${base}/`
  const sha256: string | undefined = import.meta.env.VITE_CARDS_MANIFEST_SHA256
  if (!sha256) return resourceFetch(`${normalised}cards-manifest.json`, { cache: 'no-cache' })
  if (!/^[a-f0-9]{64}$/.test(sha256)) return Promise.reject(new Error('Invalid cards manifest fingerprint'))
  return fetchVerifiedResource(`${normalised}cards-manifest.${sha256}.json`, sha256)
}

let manifestPromise: Promise<Record<string, CardMeta>> | null = null
let manifestCache: Record<string, CardMeta> | null = null

export const hasCardsManifest = (): boolean => manifestCache !== null

export const loadCardsManifest = (): Promise<Record<string, CardMeta>> => {
  if (manifestCache) return Promise.resolve(manifestCache)
  if (!manifestPromise) {
    manifestPromise = fetchManifest()
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

const customCardToMeta = ({ cardJson: card, cardType }: CustomCardMetadata): CardMeta => ({
  authored: true,
  id: card.id,
  name: card.name,
  deck: card.deck,
  number: card.number,
  type: cardType,
  category: card.category,
  desc: card.desc,
  rules: card.rules,
  cost: card.cost as Record<string, number> | undefined,
  altCosts: card.altCosts as Record<string, number>[] | undefined,
  exchanges: card.exchanges,
  players: card.players,
  prerequisite: card.prerequisite,
  vp: card.vp,
  isCookery: card.isCookery,
  isBaking: card.isBaking,
  passing: card.passing,
  returnCards: card.returnCards,
  alsoCountsAs: card.alsoCountsAs,
  locales: card.locales,
})

const getCustomCardMeta = (id: string): CardMeta | undefined => {
  if (!id.startsWith('CUSTOM_')) return undefined
  const custom = getCustomCardMetadata(id)
  return custom ? customCardToMeta(custom) : undefined
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
