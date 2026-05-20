import type { ActionFlow, Resource } from '../../contract/types'
import type { CardImpl } from '../registry'
import { E78_SleightofHand } from '../../cards-display/E/E78_SleightofHand'

const CARD_ID = E78_SleightofHand.id

const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

export const E78_SleightofHand_impl = {
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
