import { definePlayerActionCard } from '../card-source'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import { isSpaceOccupied, spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'D51_Archway'
registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'all',
  createDefinition: (_ownerId) => ({
    id: CARD_ID,
    nameKey: 'cards.D51_Archway.name',
    descriptionKey: 'cards.D51_Archway.desc',
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
    // Only the player whose worker is on D51 gets the move effect
    const d51Space = state.actionSpaces.find((s) => s.id === CARD_ID)
    if (!d51Space || !spaceHasPlayer(d51Space, player.id)) return
    // Check if there are unoccupied action spaces the player can use
    const hasAvailable = state.actionSpaces.some(
      (s) => !isSpaceOccupied(s) && s.id !== CARD_ID && s.canBeExecutedByPlayer(state, player),
    )
    if (!hasAvailable) return
    return {
      type: 'leaf',
      actionId: 'move-farmer-to-space',
      params: { excludeSpaceId: CARD_ID },
      sourceCard: CARD_ID,
      optional: true,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D51_Archway = definePlayerActionCard({
  meta: {
    id: CARD_ID,
    name: "Archway",
    deck: "D",
    number: 51,
    category: "FOOD_PROVIDER",
    desc: ["This card is an action space for all. A player who uses it immediately gets 1 <FOOD>. Immediately before the returning home phase, they can use an unoccupied action space with the person from this card."],
    cost: {"clay":2},
    vp: 4,
    prerequisite: "No Occupations",
    occupationPrerequisites: {"max":0},
  },
  impl: cardImpl,
})

export const D51_Archway_impl = D51_Archway.impl
