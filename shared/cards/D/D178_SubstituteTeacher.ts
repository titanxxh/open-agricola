import { defineOccupationCard } from '../card-source'
import type { GameState } from '../../contract/types'
import { isLessonsSpaceId } from '../helpers/lessons-spaces'
import { createPlayerActionSpaces, registerPlayerActionSpace } from '../player-action-space'
import type { CardImpl } from '../registry'

const CARD_ID = 'D178_SubstituteTeacher'

const areAllVisibleLessonsOccupied = (state: GameState) => {
  const lessonsSpaces = state.actionSpaces.filter((space) => isLessonsSpaceId(space.id))
  return lessonsSpaces.length >= 3 && lessonsSpaces.every((space) => space.takenBy.length > 0)
}

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'owner',
  createDefinition: (ownerId) => ({
    id: CARD_ID,
    nameKey: `cards.${CARD_ID}.name`,
    descriptionKey: `cards.${CARD_ID}.desc`,
    strictCanExecute: true,
    canBeExecutedByPlayer: (state, player) =>
      player.id === ownerId && areAllVisibleLessonsOccupied(state),
    execute: () => ({
      type: 'flow',
      flow: {
        type: 'xor',
        children: [
          { type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { clay: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { reed: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { stone: 1 }, sourceCard: CARD_ID },
          { type: 'leaf', actionId: 'gain', params: { grain: 1, vegetable: 1 }, sourceCard: CARD_ID },
        ],
      },
    }),
  }),
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => {
      const newSpaces = createPlayerActionSpaces(state)
      for (const space of newSpaces) {
        if (!state.actionSpaces.some((entry) => entry.id === space.id)) {
          state.actionSpaces.push(space)
        }
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D178_SubstituteTeacher = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Substitute Teacher',
    deck: 'D',
    number: 178,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Each time all three __Lessons__ action spaces are occupied, you can use this card with a person to get your choice of 1 building resource or 1 crop of each type.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const D178_SubstituteTeacher_impl = D178_SubstituteTeacher.impl
