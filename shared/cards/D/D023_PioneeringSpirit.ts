import { definePlayerActionCard } from '../card-source'
import { registerPlayerActionSpace, createPlayerActionSpaces, definePlayerActionSpaceFlow } from '../player-action-space'
import type { CardImpl } from '../registry'

const CARD_ID = 'D023_PioneeringSpirit'
const RENOVATION_ROUNDS = { start: 3, end: 5 }
const GOODS_ROUNDS = { start: 6, end: 8 }
registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'owner',
  createDefinition: (ownerId) => definePlayerActionSpaceFlow({
    id: CARD_ID,
    nameKey: 'cards.D023_PioneeringSpirit.name',
    descriptionKey: 'cards.D023_PioneeringSpirit.desc',
    canBeExecutedByPlayer: (state, player) => {
      if (player.id !== ownerId) return false
      return state.round >= RENOVATION_ROUNDS.start && state.round <= GOODS_ROUNDS.end
    },
    flowFactory: ({ state, previewMode }) => {
      const renovation = { type: 'leaf' as const, actionId: 'renovate-house', sourceCard: CARD_ID }
      const goods = { type: 'xor' as const, promptKey: 'ui.interactionPioneeringSpirit' as const,
        children: ['vegetable', 'boar', 'cattle'].map(resource => ({ type: 'leaf' as const,
          actionId: 'gain', sourceCard: CARD_ID, params: { [resource]: 1 }, choiceLabelKey: `resources.${resource}`, optionId: resource })) }
      return previewMode === 'base' ? { type: 'xor', children: [
        { type: 'seq', choiceLabelKey: 'ui.ruleRoundRange', choiceLabelParams: RENOVATION_ROUNDS, children: [renovation] },
        { ...goods, choiceLabelKey: 'ui.ruleRoundRange', choiceLabelParams: GOODS_ROUNDS },
      ] } : state.round <= RENOVATION_ROUNDS.end ? renovation : goods
    },
  }),
})

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, _player) => {
    const newSpaces = createPlayerActionSpaces(state)
    for (const space of newSpaces) {
      if (!state.actionSpaces.some((s) => s.id === space.id)) {
        state.actionSpaces.push(space)
      }
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D023_PioneeringSpirit = definePlayerActionCard({
  meta: {
    id: CARD_ID,
    name: "Pioneering Spirit",
    deck: "D",
    number: 23,
    playerActionCardType: 'minor',
    category: "ACTIONS_BOOSTER",
    desc: ["This card is an action space for you only. In rounds 3-5, it provides a __Renovation__ action. In rounds 6-8, it provides your choice of 1 <VEGETABLE>, <PIG>, or <CATTLE>."],
    cost: {},
  },
  impl: cardImpl,
})

export const D023_PioneeringSpirit_impl = D023_PioneeringSpirit.impl
