import { defineMinorCard } from '../card-source'
import type { ActionFlow, Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E78_SleightofHand'
const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const hasBuildingResources = BUILDING_RESOURCES.some(
      (r) => (player.resources[r] ?? 0) > 0,
    )
    if (!hasBuildingResources) return
    return {
      type: 'leaf',
      actionId: 'exchange',
      sourceCard: CARD_ID,
      actionContext: {
        batchExchange: {
          cardId: CARD_ID,
          maxTotal: 4,
          promptKey: 'ui.interactionSleightOfHand',
          requireAtLeastOne: false,
        },
      },
    } satisfies ActionFlow
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E78_SleightofHand = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Sleight of Hand',
    deck: 'E',
    number: 78,
    category: 'BUILDING_RESOURCES_-_REED',
    desc: ['When you play this card, you can immediately exchange up to 4 building resources for an equal number of other building resources.'],
    prerequisite: '3 Occupations',
    occupationPrerequisites: { min: 3 },
  },
  impl: cardImpl,
})

export const E78_SleightofHand_impl = E78_SleightofHand.impl
