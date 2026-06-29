import { definePlayerActionCard } from '../card-source'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import type { CardImpl } from '../registry'

const CARD_ID = 'D023_PioneeringSpirit'
registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'owner',
  createDefinition: (ownerId) => ({
    id: CARD_ID,
    nameKey: 'cards.D023_PioneeringSpirit.name',
    descriptionKey: 'cards.D023_PioneeringSpirit.desc',
    canBeExecutedByPlayer: (state, player) => {
      if (player.id !== ownerId) return false
      return state.round >= 3 && state.round <= 8
    },
    execute: ({ state }) => {
      if (state.round >= 3 && state.round <= 5) {
        // Renovation action
        return {
          type: 'flow',
          flow: { type: 'leaf', actionId: 'renovate-house', sourceCard: CARD_ID },
        }
      }
      // Rounds 6-8: choice of vegetable, pig, or cattle
      return {
        type: 'request',
        request: {
          kind: 'choice',
          options: [
            { value: 'vegetable', labelKey: 'resources.vegetable', sourceCard: CARD_ID },
            { value: 'boar', labelKey: 'resources.boar', sourceCard: CARD_ID },
            { value: 'cattle', labelKey: 'resources.cattle', sourceCard: CARD_ID },
          ],
        },
        promptKey: 'ui.interactionPioneeringSpirit',
      }
    },
    resolveChoice: ({ player }, choice) => {
      const resource = choice as 'vegetable' | 'boar' | 'cattle'
      if (['vegetable', 'boar', 'cattle'].includes(resource)) {
        player.resources[resource] += 1
        return { type: 'ok', resourcesGained: { [resource]: 1 } }
      }
      return { type: 'ok' }
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
