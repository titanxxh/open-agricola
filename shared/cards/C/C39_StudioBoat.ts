import { registerPlayerActionSpace, createPlayerActionSpaces } from '../player-action-space'
import { collectAccumulatedResources } from '../../actions/effects/collect'
import { incCounter } from '../__stubs__/helpers'
import type { CardImpl } from '../registry'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { C39_StudioBoat } from '../../cards-display/C/C39_StudioBoat'
export { C39_StudioBoat }

const CARD_ID = C39_StudioBoat.id

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
    computeBonusScore: (_state, player) =>
      player.cardStates?.[CARD_ID]?.counters?.bonusVp ?? 0,
  },
  listeners: [travelingPlayersOwnerVp],
  reaches: [] as readonly string[],
} satisfies CardImpl
