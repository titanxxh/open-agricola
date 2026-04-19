import { PlayerActionCard } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import { collectAccumulatedResources } from '../../actions/effects/collect'
import { incCounter } from '../__stubs__/helpers'

const CARD_ID = 'C39_StudioBoat'

/**
 * C39 Studio Boat (Minor Improvement, PlayerActionCard):
 * In 1-3 player games, this acts as a Traveling Players accumulation space.
 * It accumulates 1 food per round.
 * When any player uses it, they collect the accumulated food.
 * Additionally, the card owner receives +1 bonus VP each time anyone uses it.
 *
 * Note: The standard PlayerActionCard infrastructure forces gainPerRound to {},
 * so we use onRoundStart to manually add food to the space's resources each round.
 *
 * Player restriction: 1-3 players (Traveling Players is only in 4-player games,
 * so StudioBoat fills that gap).
 */

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'all',
  createDefinition: (ownerId) => ({
    id: CARD_ID,
    nameKey: 'cards.C39_StudioBoat.name',
    descriptionKey: 'cards.C39_StudioBoat.desc',
    canBeExecutedByPlayer: () => true,
    execute: ({ state, player, space }) => {
      // Collect accumulated food (like traveling players)
      const gained: Record<string, number> = {}
      if (space.resources.food > 0) {
        gained.food = space.resources.food
      }
      collectAccumulatedResources(player, space)

      // Owner gets +1 bonus VP
      const owner = state.players.find((p) => p.id === ownerId)
      if (owner) {
        incCounter(owner, CARD_ID, 'bonusVp')
      }

      return {
        type: 'ok',
        resourcesGained: gained,
      }
    },
  }),
})

registerCardEffect({
  id: CARD_ID,
  // On buy: create the action space
  onBuy: (state) => {
    const newSpaces = createPlayerActionSpaces(state)
    for (const space of newSpaces) {
      if (!state.actionSpaces.some((s) => s.id === space.id)) {
        state.actionSpaces.push(space)
      }
    }
  },
  // Each round start: accumulate 1 food on the action space
  // (since PlayerActionCard infra forces gainPerRound to {}, we do it manually)
  onRoundStart: (state, _player) => {
    const space = state.actionSpaces.find((s) => s.id === CARD_ID)
    if (!space) return
    space.resources.food = (space.resources.food ?? 0) + 1
  },
})

export const C39_StudioBoat = new PlayerActionCard({
  id: CARD_ID,
  name: 'Studio Boat',
  deck: 'C',
  number: 39,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you use the __Traveling Players__ accumulation space, you also get 1 bonus <SCORE>. In games with 1-3 players, this card is considered __Traveling Players__ (same effect as __Fishing__).',
  ],
  cost: { wood: 2, reed: 1 },
  players: '1-3',
})
