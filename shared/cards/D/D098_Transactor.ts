import { defineOccupationCard } from '../card-source'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D098_Transactor'
const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBeforeHarvest: (state, _player) => {
    if (state.round !== 14) return
    const hasBuildingResources = state.actionSpaces.some((space) =>
      BUILDING_RESOURCES.some((resource) => (space.resources[resource] ?? 0) > 0),
    )
    if (!hasBuildingResources) return
    const children: ActionFlow[] = state.actionSpaces
      .filter((space) =>
        BUILDING_RESOURCES.some((resource) => (space.resources[resource] ?? 0) > 0),
      )
      .map((space) => ({
        type: 'leaf',
        actionId: 'collect',
        actionContext: { spaceId: space.id, resourceTypes: BUILDING_RESOURCES },
        sourceCard: CARD_ID,
      }))
    return {
      type: 'seq',
      optional: true,
      promptKey: 'ui.cards.D098_Transactor.prompt',
      children,
      sourceCard: CARD_ID,
    } satisfies ActionFlow
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D098_Transactor = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Transactor",
    deck: "D",
    number: 98,
    category: "POINTS_PROVIDER",
    desc: ["Immediately before the final harvest at the end of round 14, you can take all the building resources that are left on the entire game board."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const D098_Transactor_impl = D098_Transactor.impl
