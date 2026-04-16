import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import type { ActionFlow, Resource } from '../../game/types'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E78_SleightofHand'

/**
 * E78 Sleight of Hand (Minor Improvement, E, 78)
 * When you play this card, you can immediately exchange up to 4 building
 * resources for an equal number of other building resources.
 *
 * BGA: onBuy uses SPECIAL_EFFECT argsTradeResources — player picks up to 4
 * resources to discard and an equal number to receive (different types).
 *
 * Simplified: offer optional 1:1 exchanges of building resources, up to 4 times.
 * Each exchange: pay 1 building resource, gain 1 different building resource.
 * Implemented as a sequence of up to 4 optional XOR exchanges.
 */

const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

const buildSingleExchange = (): ActionFlow => ({
  type: 'xor',
  optional: true,
  children: BUILDING_RESOURCES.flatMap((pay) =>
    BUILDING_RESOURCES
      .filter((gain) => gain !== pay)
      .map((gain) => ({
        type: 'seq' as const,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { [pay]: 1 } }),
          gainLeaf(CARD_ID, { [gain]: 1 }),
        ],
      })),
  ),
})

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    // Check if the player has any building resources to exchange
    const hasBuildingResources = BUILDING_RESOURCES.some(
      (r) => (player.resources[r] ?? 0) > 0,
    )
    if (!hasBuildingResources) return

    // Offer up to 4 sequential optional exchanges
    return {
      type: 'seq',
      optional: true,
      children: [
        buildSingleExchange(),
        buildSingleExchange(),
        buildSingleExchange(),
        buildSingleExchange(),
      ],
    }
  },
})

export const E78_SleightofHand = new MinorImprovement({
  id: CARD_ID,
  name: 'Sleight of Hand',
  deck: 'E',
  number: 78,
  category: 'RESOURCE_WOOD',
  desc: ['When you play this card, you can immediately exchange up to 4 building resources for an equal number of other building resources.'],
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
})
