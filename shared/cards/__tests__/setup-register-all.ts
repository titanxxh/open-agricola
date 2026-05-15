import { CardRegistry } from '../registry'
import { setActiveCardRegistry } from '../active-registry'
import { ensureCatalogLookupsInstalled } from '../install-catalog-lookups'

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

const defaultRegistry = new CardRegistry()
for (const [cardId, impl] of Object.entries(ALL_CARD_IMPLS)) {
  defaultRegistry.loadImpl(cardId, impl)
}
defaultRegistry.syncModifiersFromCatalog(
  allOccupationCards,
  allMinorImprovementCards,
)
defaultRegistry.registerEffects(majorCardDefinitions)
setActiveCardRegistry(defaultRegistry)
