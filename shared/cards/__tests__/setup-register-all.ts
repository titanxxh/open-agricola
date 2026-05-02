/**
 * Vitest setup file — runs once per worker before any test module executes.
 *
 * Two responsibilities:
 *
 * 1. **Module load order**: there is a pre-existing TDZ cycle between
 *    `shared/cards/catalog.ts` and `shared/cards/D/D95_SiteManager.ts` (via
 *    `shared/game/minor-improvements.ts`). The cycle resolves correctly only
 *    when `minor-improvements.ts` is loaded before `catalog.ts` reaches its
 *    first card import. Importing `GameSession` here forces the same load
 *    order the server uses at runtime.
 *
 * 2. **Default active `CardRegistry`**: tests that don't construct a
 *    `GameSession` still need every card's listeners / effects reachable via
 *    `getRegisteredCardListeners()` / `getCardEffect()`. We build one
 *    registry, load every card's impl, and publish it as the active
 *    registry. Tests that want an isolated slate publish a fresh registry
 *    via `setActiveCardRegistry(new CardRegistry())`; tests that construct
 *    a `GameSession` get their own fresh registry (GameCore publishes one
 *    in its constructor).
 *
 * Consumed via `vitest.config.ts` -> `test.setupFiles`.
 */
// Pull in GameSession first — walks the real game-core import graph so
// minor-improvements.ts loads before catalog.ts.
import '../../../server/game/authoritative-session'
import { CardRegistry } from '../registry'
import { setActiveCardRegistry } from '../active-registry'
import { ALL_CARD_IMPLS } from '../register-all'
import { allOccupationCards, allMinorImprovementCards } from '../catalog'

const defaultRegistry = new CardRegistry()
for (const [cardId, impl] of Object.entries(ALL_CARD_IMPLS)) {
  defaultRegistry.loadImpl(cardId, impl)
}
// Mirror GameCore's per-session sync so unit tests reading getCardModifiers
// without booting a full session see catalog-derived modifier data.
defaultRegistry.syncModifiersFromCatalog(
  allOccupationCards,
  allMinorImprovementCards,
)
setActiveCardRegistry(defaultRegistry)

// PR-4: preload cards-manifest.json so client components that call
// `getCardMeta()` (PlayerCard, cardText, ActionBoard) have synchronous data
// under test, matching the runtime `App.tsx` pre-render bootstrap.
import fs from 'node:fs'
import path from 'node:path'
import {
  __resetCardsManifestCache,
  loadCardsManifest,
} from '../../../client/services/card-meta'

const manifestPath = path.resolve(__dirname, '../../../public/cards-manifest.json')
if (fs.existsSync(manifestPath)) {
  const raw = fs.readFileSync(manifestPath, 'utf8')
  const payload = JSON.parse(raw)
  const existingFetch =
    typeof globalThis.fetch === 'function' ? globalThis.fetch : undefined
  // Stub fetch for the manifest URL; delegate everything else to any existing
  // fetch implementation (tests that need real fetches can still override).
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url
    if (url.endsWith('cards-manifest.json')) {
      return {
        ok: true,
        status: 200,
        json: async () => payload,
      } as unknown as Response
    }
    if (existingFetch) return existingFetch(input as never, init)
    throw new Error(`[test-setup] fetch(${url}) unmocked`)
  }) as typeof fetch
  __resetCardsManifestCache()
  await loadCardsManifest()
}
