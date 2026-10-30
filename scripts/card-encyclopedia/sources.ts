import { catalogCardDefinitions } from '../../shared/cards/catalog.generated'
import { majorCardDefinitionsList } from '../../shared/cards/major/generated'
import { sixPlayerDuplicateMajorImprovementIds, standardMajorImprovementIds } from '../../shared/cards/major/supply'
import type { MajorCardDisplay } from '../../shared/cards/major/types'
import type { CardDefinition } from '../../shared/contract/cards'
import { moorSpecialActionCardDefinitions } from '../../shared/moor/special-action-cards'
import { moorStartCards, type MoorStartCardDefinition } from '../../shared/moor/start-cards'
import { parentCards, type ParentCardDefinition } from '../../shared/parents'
import { seasonIds, type SeasonId } from '../../shared/seasons/types'

export type OrdinaryCardSource = CardDefinition & { kind: 'minor' | 'occupation' | 'playerAction' }
export type MajorCardSource = MajorCardDisplay & { kind: 'major' }
export type MoorSpecialActionCardSource = (typeof moorSpecialActionCardDefinitions)[number]

/** Production definitions only; nothing here runs a Card Impl. */
export type EncyclopediaSources = {
  readonly ordinaryCards: readonly OrdinaryCardSource[]
  readonly majorCards: readonly MajorCardSource[]
  readonly baseMajorIds: readonly string[]
  readonly fiveSixMajorIds: readonly string[]
  readonly parentCards: readonly ParentCardDefinition[]
  readonly moorSpecialActionCards: readonly MoorSpecialActionCardSource[]
  readonly moorStartCards: readonly MoorStartCardDefinition[]
  readonly seasons: readonly SeasonId[]
}

export const loadEncyclopediaSources = (): EncyclopediaSources => ({
  ordinaryCards: catalogCardDefinitions,
  majorCards: majorCardDefinitionsList,
  baseMajorIds: standardMajorImprovementIds,
  fiveSixMajorIds: sixPlayerDuplicateMajorImprovementIds,
  parentCards,
  moorSpecialActionCards: moorSpecialActionCardDefinitions,
  moorStartCards,
  seasons: seasonIds,
})
