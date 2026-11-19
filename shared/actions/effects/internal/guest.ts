import type { ActionDefinition, ActionFlow, GuestRecord, GuestWorkerSource } from '../../../contract/types'
import { grantGuest, isWorkEndWindowOpen, readGuestPlacementScope, voidGuest } from '../../../domain/guests'
import { hasLegalPlaceFarmerTargets } from '../place-farmer'

function voidGuestLeaf(guest: GuestRecord): ActionFlow {
  return {
    type: 'leaf', actionId: 'guest', choiceLabelKey: 'ui.interactionDecline',
    params: { operation: 'void', guestId: guest.id },
  }
}

/**
 * Guest bookkeeping for native card flows and for rotation.
 *
 * - `grant` hands the acting player a Guest from the leaf's source card. Rotation
 *   offers it on any of the owner's work turns in its round. Once the work-end
 *   window has begun no work turn follows, so a Guest for the current round is
 *   placed at once instead, or void.
 * - `grant-immediate` hands over a Guest that is placed within this flow, or void.
 * - `void` drops a Guest the player declines to dispatch.
 */
export const guestAction: ActionDefinition = {
  id: 'guest',
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params, sourceCard, eventSink, actionHooks }) => {
    if ((params?.operation === 'grant' || params?.operation === 'grant-immediate') && sourceCard) {
      const round: unknown = params.operation === 'grant-immediate' ? state.round : params.round ?? state.round
      const where = readGuestPlacementScope(params.where)
      if (typeof round !== 'number' || !Number.isSafeInteger(round) || round < state.round || where === null) {
        return { type: 'fail', errorKey: 'log.cardEffectFail' }
      }
      const immediate = params.operation === 'grant-immediate' || (round === state.round && isWorkEndWindowOpen(state))
      const guest = grantGuest(player, { sourceCardId: sourceCard, round, where })
      eventSink?.emit<'guest.granted'>({
        type: 'guest.granted',
        playerId: player.id,
        guestId: guest.id,
        cardId: guest.sourceCardId,
        targetRound: guest.round,
      })
      if (!immediate) return { type: 'ok' }
      const workerSource: GuestWorkerSource = { kind: 'guest', guestId: guest.id }
      const actionContext = { workerSource }
      const forfeit = voidGuestLeaf(guest)
      if (!hasLegalPlaceFarmerTargets(state, player, actionHooks, sourceCard, actionContext)) {
        return { type: 'flow', flow: forfeit }
      }
      const dispatch: ActionFlow = {
        type: 'leaf', actionId: 'place-farmer', sourceCard, actionContext,
        choiceLabelKey: 'actions.activate-extra-turn.name',
        choiceLabelParams: { guestId: guest.id, guestCardId: guest.sourceCardId },
      }
      // A grant during the work-end window is the Guest's last chance, so it may be declined.
      const optional = params.optional === true || params.operation === 'grant'
      return { type: 'flow', flow: optional ? { type: 'xor', children: [dispatch, forfeit] } : dispatch }
    }
    if (params?.operation === 'void') {
      const guest = voidGuest(state, player, params.guestId)
      if (!guest) return { type: 'fail', errorKey: 'log.cardEffectFail' }
      eventSink?.emit<'guest.voided'>({
        type: 'guest.voided',
        playerId: player.id,
        guestId: guest.id,
        cardId: guest.sourceCardId,
      })
      return { type: 'ok' }
    }
    return { type: 'fail', errorKey: 'log.cardEffectFail' }
  },
}
