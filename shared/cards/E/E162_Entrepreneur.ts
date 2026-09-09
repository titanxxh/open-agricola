import { defineOccupationCard } from '../card-source'
import { getCardStack, popFromCardStack } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionDefinition, ActionFlow, Resource } from '../../contract/types'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'E162_Entrepreneur'
const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

const getMissingBuildingResources = (player: { resources: Resource }): (keyof Resource)[] =>
  BUILDING_RESOURCES.filter((res) => (player.resources[res] ?? 0) === 0)

const DISCARD_FOOD = `card_${CARD_ID}_discardFood`
const discardFood: ActionDefinition = {
  id: DISCARD_FOOD,
  nameKey: 'ui.interactionEntrepreneurDiscard',
  descriptionKey: 'ui.interactionEntrepreneurDiscard',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => getCardStack(player, CARD_ID).length > 0,
  execute: ({ player, eventSink }) => {
    if (getCardStack(player, CARD_ID).length === 0) return { type: 'fail', errorKey: 'log.actionFail' }
    popFromCardStack(player, CARD_ID)
    eventSink?.emit<'card.stackChanged'>({
      type: 'card.stackChanged', cardId: CARD_ID, targetPlayerId: player.id,
      resources: { food: 1 }, delta: -1, reason: 'discard',
    })
    return { type: 'ok' }
  },
}
registerAdHocAction(discardFood)

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {

    const missingResources = getMissingBuildingResources(player)
    if (missingResources.length === 0) return

    const stack = getCardStack(player, CARD_ID)
    const hasFood = player.resources.food >= 1
    const hasStoredFood = stack.length > 0
    if (!hasFood && !hasStoredFood) return

    const gain: ActionFlow = {
      type: 'xor',
      children: missingResources.map((resource) => gainLeaf(CARD_ID, { [resource]: 1 })),
    }

    const children: ActionFlow[] = []

    // Option A: Move 1 food to this card → gain missing resource
    if (hasFood) {
      children.push({
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'pay', params: { food: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'push-to-card-stack', sourceCard: CARD_ID, params: { item: 'food' } },
          gain,
        ],
      })
    }

    // Option B: Discard 1 food from card → gain missing resource
    if (hasStoredFood) {
      children.push({
        type: 'seq',
        choiceLabelKey: 'ui.interactionEntrepreneurDiscard',
        children: [
          { type: 'leaf', actionId: DISCARD_FOOD, sourceCard: CARD_ID },
          gain,
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

export const E162_Entrepreneur = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Entrepreneur',
    deck: 'E',
    number: 162,
    desc: ['At the start of each round, you can move 1 <FOOD> to this card or discard 1 <FOOD> from it. If you do either, you get 1 building resource of a type you currently do not have.'],
    cost: {},
    players: '4+',
    category: 'BUILDING_RESOURCES',
  },
  impl: cardImpl,
})

export const E162_Entrepreneur_impl = E162_Entrepreneur.impl
