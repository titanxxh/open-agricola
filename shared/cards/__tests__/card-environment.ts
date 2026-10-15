import { beforeEach } from 'vitest'
import { CardRegistry } from '../registry'
import { getActiveCardRegistry, setActiveCardRegistry } from '../active-registry'
import { ALL_CARD_IMPLS } from '../register-all'
import { allMinorImprovementCards, allOccupationCards } from '../catalog'
import { majorCardDefinitions } from '../major'

const officialRules = new CardRegistry()
for (const [cardId, impl] of Object.entries(ALL_CARD_IMPLS)) {
  officialRules.loadImpl(cardId, impl, { protected: true })
}
officialRules.syncModifiersFromCatalog(allOccupationCards, allMinorImprovementCards)
officialRules.registerEffects(majorCardDefinitions, { protected: true })

export const createOfficialCardRegistry = (): CardRegistry => officialRules.clone()

/** Opt a direct-rule suite into its own fresh environment for each test. */
export function installOfficialCardRegistry(): void {
  beforeEach(() => {
    const previous = getActiveCardRegistry()
    setActiveCardRegistry(createOfficialCardRegistry())
    return () => setActiveCardRegistry(previous)
  })
}
