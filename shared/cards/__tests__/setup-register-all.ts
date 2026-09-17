import { CardRegistry } from '../registry'
import { setActiveCardRegistry } from '../active-registry'
import { ensureCatalogLookupsInstalled } from '../install-catalog-lookups'
import { guardCardImplListeners } from './listener-purity-guard'

ensureCatalogLookupsInstalled()

const [
  { ALL_CARD_IMPLS },
  { allOccupationCards, allMinorImprovementCards },
  { majorCardDefinitions },
] = await Promise.all([
  import('../register-all'),
  import('../catalog'),
  import('../major'),
])

// Direct `impl.listeners[i].handler(ctx)` calls in focused tests bypass
// executeCardListener, so guard the registered functions themselves.
guardCardImplListeners(ALL_CARD_IMPLS)

const defaultRegistry = new CardRegistry()
for (const [cardId, impl] of Object.entries(ALL_CARD_IMPLS)) {
  defaultRegistry.loadImpl(cardId, impl, { protected: true })
}
defaultRegistry.syncModifiersFromCatalog(
  allOccupationCards,
  allMinorImprovementCards,
)
defaultRegistry.registerEffects(majorCardDefinitions, { protected: true })
setActiveCardRegistry(defaultRegistry)
