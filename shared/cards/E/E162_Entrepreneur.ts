import { Occupation } from '../types'
import { getCardStack } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow, Resource } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E162_Entrepreneur'

const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

const getMissingBuildingResources = (player: { resources: Resource }): (keyof Resource)[] =>
  BUILDING_RESOURCES.filter((res) => (player.resources[res] ?? 0) === 0)

export const E162_Entrepreneur = new Occupation({
  id: CARD_ID,
  name: 'Entrepreneur',
  deck: 'E',
  number: 162,
  desc: ['At the start of each round, you can move 1 <FOOD> to this card or discard 1 <FOOD> from it. If you do either, you get 1 building resource of a type you currently do not have.'],
  cost: {},
  players: '4+',
})

export const E162_Entrepreneur_impl = {
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {

    const missingResources = getMissingBuildingResources(player)
    if (missingResources.length === 0) return

    const stack = getCardStack(player, CARD_ID)
    const hasFood = player.resources.food >= 1
    const hasStoredFood = stack.length > 0
    if (!hasFood && !hasStoredFood) return

    // Auto-pick first missing resource
    const gainResource = missingResources[0]!

    const children: ActionFlow[] = []

    // Option A: Move 1 food to this card → gain missing resource
    if (hasFood) {
      children.push({
        type: 'seq',
        choiceLabelKey: 'ui.interactionResourceExchange',
        choiceLabelParams: { resourcesPaid: { food: 1 }, resourcesGained: { [gainResource]: 1 } },
        children: [
          { type: 'leaf', actionId: 'pay-resources', params: { food: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'push-to-card-stack', sourceCard: CARD_ID, params: { item: 'food' } },
          gainLeaf(CARD_ID, { [gainResource]: 1 }),
        ],
      })
    }

    // Option B: Discard 1 food from card → gain missing resource
    if (hasStoredFood) {
      children.push({
        type: 'seq',
        choiceLabelKey: 'ui.interactionEntrepreneurDiscard',
        children: [
          { type: 'leaf', actionId: 'pop-card-stack', sourceCard: CARD_ID },
          gainLeaf(CARD_ID, { [gainResource]: 1 }),
        ],
      })
    }

    if (children.length === 0) return

    return {
      type: 'xor',
      optional: true,
      children,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
