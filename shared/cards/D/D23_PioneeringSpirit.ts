import { PlayerActionCard } from '../types'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import type { CardImpl } from '../registry'

const CARD_ID = 'D23_PioneeringSpirit'

// Owner-only action space.
// Rounds 3-5: provides a Renovation action.
// Rounds 6-8: choice of 1 vegetable, 1 pig, or 1 cattle.
registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'owner',
  createDefinition: (ownerId) => ({
    id: CARD_ID,
    nameKey: 'cards.D23_PioneeringSpirit.name',
    descriptionKey: 'cards.D23_PioneeringSpirit.desc',
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
        type: 'choice',
        promptKey: 'ui.interactionPioneeringSpirit',
        options: [
          { value: 'vegetable', labelKey: 'resources.vegetable', sourceCard: CARD_ID },
          { value: 'boar', labelKey: 'resources.boar', sourceCard: CARD_ID },
          { value: 'cattle', labelKey: 'resources.cattle', sourceCard: CARD_ID },
        ],
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

export const D23_PioneeringSpirit = new PlayerActionCard({
  id: CARD_ID,
  name: "Pioneering Spirit",
  deck: "D",
  number: 23,
  category: "ACTIONS_BOOSTER",
  desc: ["This card is an action space for you only. In rounds 3-5, it provides a __Renovation__ action. In rounds 6-8, it provides your choice of 1 <VEGETABLE>, <PIG>, or <CATTLE>."],
  cost: {},
  newSet: true,
})

export const D23_PioneeringSpirit_impl = {
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
