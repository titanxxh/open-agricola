import { PlayerActionCard } from '../types'
import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import { collectAccumulatedResources } from '../../actions/effects/collect'
import { incCounter } from '../__stubs__/helpers'
import type { CardImpl } from '../registry'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'C39_StudioBoat'

// In games with 1-3 players, C39 acts as the Traveling Players accumulation
// space (which is only added by the action board itself in 4-player games).
// In games with 4 players, the global Traveling Players action space exists,
// so C39 contributes only the +1 bonus VP each time *its owner* places a
// farmer there. See BGA: modules/php/Cards/C/C39_StudioBoat.php.

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'all',
  shouldRegister: (state) => state.players.length < 4,
  createDefinition: (ownerId) => ({
    id: CARD_ID,
    nameKey: 'cards.C39_StudioBoat.name',
    descriptionKey: 'cards.C39_StudioBoat.desc',
    canBeExecutedByPlayer: () => true,
    execute: ({ player, space }) => {
      const gained: Record<string, number> = {}
      if (space.resources.food > 0) {
        gained.food = space.resources.food
      }
      collectAccumulatedResources(player, space)

      // BGA: bonus VP only when the owner is the actor.
      if (player.id === ownerId) {
        incCounter(player, CARD_ID, 'bonusVp')
      }

      return {
        type: 'ok',
        resourcesGained: gained,
      }
    },
  }),
})

const travelingPlayersOwnerVp: CardListenerRegistration = {
  id: 'C39-studio-boat-traveling-players-vp',
  cardIds: [CARD_ID],
  // scope defaults to 'player' — actor must own C39 for the listener to fire.
  // 1-3p path: traveling-players action space does not exist (see
  // common-traveling-players.ts `players: [4]`), so this listener is dormant
  // and the 1-3p +1 VP is granted by the execute() handler above.
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // context.space is the action space the farmer was placed on (resolved
    // from the engine's activeSpaceId). Only fire on the global Traveling
    // Players accumulation space, which exists only in 4-player games.
    if (context.space?.id !== 'traveling-players') return
    return {
      flow: {
        type: 'leaf',
        actionId: 'bonus-vp',
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

export const C39_StudioBoat = new PlayerActionCard({
  id: CARD_ID,
  name: 'Studio Boat',
  deck: 'C',
  number: 39,
  category: 'POINTS_PROVIDER',
  desc: [
    'Each time you use the __Traveling Players__ accumulation space, you also get 1 bonus <SCORE>. In games with 1-3 players, this card is considered __Traveling Players__ (same effect as __Fishing__).',
  ],
  cost: { wood: 1 },
})

export const C39_StudioBoat_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => {
      const newSpaces = createPlayerActionSpaces(state)
      for (const space of newSpaces) {
        if (!state.actionSpaces.some((s) => s.id === space.id)) {
          state.actionSpaces.push(space)
        }
      }
    },
    onRoundStart: (state, _player) => {
      if (state.players.length >= 4) return
      const space = state.actionSpaces.find((s) => s.id === CARD_ID)
      if (!space) return
      space.resources.food = (space.resources.food ?? 0) + 1
    },
  },
  listeners: [travelingPlayersOwnerVp],
  reaches: [] as readonly string[],
} satisfies CardImpl
