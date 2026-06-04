import { definePlayerActionCard } from '../card-source'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import { getStoredResource, setStoredResource } from '../helpers/card-storage'
import type { CardImpl } from '../registry'

const CARD_ID = 'D116_TreeInspector'

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'owner',
  createDefinition: (ownerId) => ({
    id: CARD_ID,
    nameKey: 'cards.D116_TreeInspector.name',
    descriptionKey: 'cards.D116_TreeInspector.desc',
    canBeExecutedByPlayer: (_state, player) => {
      if (player.id !== ownerId) return false
      return getStoredResource(player, CARD_ID, 'wood') > 0
    },
    execute: ({ player }) => {
      const stored = getStoredResource(player, CARD_ID, 'wood')
      if (stored <= 0) return { type: 'ok' }
      // Collect all stored wood via take-from-card
      return {
        type: 'flow',
        flow: {
          type: 'leaf',
          actionId: 'take-from-card',
          params: { wood: stored },
          sourceCard: CARD_ID,
        },
      }
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
  onRoundStart: (state, player) => {
    // Check if the newly revealed action this round is a Quarry
    const revealedAction = state.roundActionOrder[state.round - 1]
    if (revealedAction === 'western-quarry' || revealedAction === 'eastern-quarry') {
      // Discard all stored wood
      setStoredResource(player, CARD_ID, 'wood', 0)
      return
    }
    // Otherwise accumulate 1 wood
    const current = getStoredResource(player, CARD_ID, 'wood')
    setStoredResource(player, CARD_ID, 'wood', current + 1)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D116_TreeInspector = definePlayerActionCard({
  meta: {
    id: "D116_TreeInspector",
    name: "Tree Inspector",
    deck: "D",
    number: 116,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["This card is a __1 <WOOD>__ accumulation space for you only. Each time the newly revealed action space card is a __Quarry__ accumulation space, you must discard all <WOOD> from this card."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const D116_TreeInspector_impl = D116_TreeInspector.impl
