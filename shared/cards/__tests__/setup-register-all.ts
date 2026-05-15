/**
 * Vitest setup file — runs once per worker before any test module executes.
 *
 * Responsibility: publish a default active `CardRegistry` so tests that don't
 * construct a `GameSession` still see every card's listeners / effects via
 * `getRegisteredCardListeners()` / `getCardEffect()`. Tests that want an
 * isolated slate call `setActiveCardRegistry(new CardRegistry())`; tests that
 * construct a `GameSession` get their own fresh registry (GameCore publishes
 * one in its constructor).
 *
 * Also stubs `fetch` for `cards-manifest.json` so client components that
 * synchronously read `getCardMeta()` work under test.
 *
 * Historical note: this file also used to import `GameSession` first to
 * force a specific module load order, working around a TDZ-prone late-bind
 * between `shared/cards/catalog.ts` and `shared/cards-display/types.ts`.
 * That workaround is no longer needed — `catalog.ts` now directly exports
 * the registered-card lookups synchronously, with no late-bound setter.
 *
 * Consumed via `vitest.config.ts` -> `test.setupFiles`.
 */
import { CardRegistry } from '../registry'
import { setActiveCardRegistry } from '../active-registry'
import { ALL_CARD_IMPLS } from '../register-all'
import { allOccupationCards, allMinorImprovementCards } from '../catalog'
import { majorCardDefinitions } from '../major'

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
defaultRegistry.registerEffects(majorCardDefinitions)
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
