import { defineOccupationCard } from '../card-source'
import type { ActionFlow, GameState } from '../../contract/types'
import { createPlayerActionSpaces, registerPlayerActionSpace } from '../player-action-space'
import { wrapOptional } from '../../actions/flow'
import type { CardImpl } from '../registry'

const CARD_ID = 'B171_GreenhouseBuilder'

const revealedActionIds = (state: GameState): Set<string> =>
  new Set(state.roundActionOrder.filter((id): id is string => typeof id === 'string'))

const greenhouseBranches = (state: GameState): ActionFlow[] => {
  const revealed = revealedActionIds(state)
  const branches: ActionFlow[] = []
  if (revealed.has('fencing')) {
    branches.push({ type: 'leaf', actionId: 'fence', sourceCard: CARD_ID, choiceLabelKey: 'actions.fencing.name' })
  }
  if (revealed.has('house-redevelopment')) {
    branches.push({
      type: 'seq',
      sourceCard: CARD_ID,
      choiceLabelKey: 'actions.house-redevelopment.name',
      children: [
        { type: 'leaf', actionId: 'renovate-house', sourceCard: CARD_ID },
        wrapOptional({ type: 'leaf', actionId: 'improvement', sourceCard: CARD_ID, actionContext: { types: ['major', 'minor'] } }),
      ],
    })
  }
  if (revealed.has('vegetable-seeds')) {
    branches.push({
      type: 'leaf',
      actionId: 'gain',
      params: { vegetable: 1 },
      sourceCard: CARD_ID,
      choiceLabelKey: 'actions.vegetable-seeds.name',
    })
  }
  return branches
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
      player.id === ownerId && greenhouseBranches(state).length > 0,
    execute: ({ state }) => ({
      type: 'flow',
      flow: {
        type: 'xor',
        children: greenhouseBranches(state),
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

export const B171_GreenhouseBuilder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Greenhouse Builder',
    deck: 'B',
    number: 171,
    category: 'ACTIONS_BOOSTER',
    desc: ['This is an action space for you only. It provides a choice of "Fencing", "House Redevelopment", or "Vegetable Seeds" if the corresponding action space is already in play.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const B171_GreenhouseBuilder_impl = B171_GreenhouseBuilder.impl
