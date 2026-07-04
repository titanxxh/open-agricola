import { defineOccupationCard } from '../card-source'
import { canStartFencing } from '../../actions/effects/fencing'
import { buildRenovationPlan } from '../../actions/effects/renovation'
import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import { createPlayerActionSpaces, registerPlayerActionSpace } from '../player-action-space'
import { wrapOptional } from '../../actions/flow'
import type { CardImpl } from '../registry'

const CARD_ID = 'B171_GreenhouseBuilder'

const revealedActionIds = (state: GameState): Set<string> =>
  new Set(state.roundActionOrder.slice(0, state.round).filter((id): id is string => typeof id === 'string'))

const canRenovate = (player: PlayerState) =>
  buildRenovationPlan(player, 'clay') !== null || buildRenovationPlan(player, 'stone') !== null

const greenhouseBranches = (state: GameState, player: PlayerState): ActionFlow[] => {
  const revealed = revealedActionIds(state)
  const branches: ActionFlow[] = []
  if (revealed.has('fencing') && canStartFencing(state, player)) {
    branches.push({ type: 'leaf', actionId: 'fence', sourceCard: CARD_ID, choiceLabelKey: 'actions.fencing.name' })
  }
  if (revealed.has('house-redevelopment') && canRenovate(player)) {
    branches.push({
      type: 'seq',
      sourceCard: CARD_ID,
      choiceLabelKey: 'actions.house-redevelopment.name',
      children: [
        { type: 'leaf', actionId: 'renovate-house', sourceCard: CARD_ID, actionContext: { renovationActionSpace: true } },
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
      player.id === ownerId && greenhouseBranches(state, player).length > 0,
    execute: ({ state, player }) => ({
      type: 'flow',
      flow: {
        type: 'xor',
        children: greenhouseBranches(state, player),
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
    desc: ['This is an action space for you only. It provides a choice of __Fencing__, __House Redevelopment__, or __Vegetable Seeds__ if the corresponding action space is already in play.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const B171_GreenhouseBuilder_impl = B171_GreenhouseBuilder.impl
