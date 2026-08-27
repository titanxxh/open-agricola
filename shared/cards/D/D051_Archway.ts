import { definePlayerActionCard } from '../card-source'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import type { CardImpl } from '../registry'

const CARD_ID = 'D051_Archway'
registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'all',
  createDefinition: (_ownerId) => ({
    id: CARD_ID,
    nameKey: 'cards.D051_Archway.name',
    descriptionKey: 'cards.D051_Archway.desc',
    canBeExecutedByPlayer: () => true,
    execute: ({ player }) => {
      player.resources.food += 1
      return {
        type: 'ok',
        resourcesGained: { food: 1 },
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
  onBeforeReturnHome: (state, player) => {
    const d51Space = state.actionSpaces.find((s) => s.id === CARD_ID)
    const worker = d51Space?.takenBy.find((entry) => entry.playerId === player.id)
    if (!worker) return
    const actionContext = {
      moveFarmerSourceSpaceId: CARD_ID,
      moveFarmerWorkerId: worker.workerId,
    }
    return {
      type: 'leaf',
      actionId: 'move-farmer-to-space',
      params: { excludeSpaceId: CARD_ID, workerId: worker.workerId },
      sourceCard: CARD_ID,
      actionContext,
      optional: true,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D051_Archway = definePlayerActionCard({
  meta: {
    id: CARD_ID,
    name: "Archway",
    deck: "D",
    number: 51,
    playerActionCardType: 'minor',
    category: "FOOD_PROVIDER",
    desc: ["This card is an action space for all. A player who uses it immediately gets 1 <FOOD>. Immediately before the returning home phase, they can use an unoccupied action space with the person from this card."],
    cost: {"clay":2},
    vp: 4,
    prerequisite: "No Occupations",
    occupationPrerequisites: {"max":0},
  },
  impl: cardImpl,
})

export const D051_Archway_impl = D051_Archway.impl
