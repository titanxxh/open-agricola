import type {
  ActionDefinition,
  ActionExecutionResult,
  GameState,
  PlayerState,
} from '../../contract/types'
import { getOccupation } from '../../cards/registry-display'
import { getCardModifiers } from '../../cards/card-modifiers'
import { activateCard } from './activate-card'
import { incOccupationBuilt, recordDraftPlayed } from '../../session/stats'
import {
  cardEffectHandChangedEvent,
  readPrivateHandChangeSourceCard,
} from '../../session/private-hand-events'

export type ApplyOccupationPlayParams = {
  occupationId: string
}

const isApplyOccupationPlayParams = (
  raw: unknown,
): raw is ApplyOccupationPlayParams => {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  return typeof r.occupationId === 'string' && r.occupationId.length > 0
}

const applyOccupation = (
  state: GameState,
  player: PlayerState,
  occupationId: string,
) => {
  player.occupationHand = player.occupationHand.filter(
    (id) => id !== occupationId,
  )
  if (!player.occupationPlayed.includes(occupationId)) {
    player.occupationPlayed.push(occupationId)
  }
  incOccupationBuilt(player)
  recordDraftPlayed(player, occupationId, state.round)
  getCardModifiers(occupationId).forEach((modifier) => {
    if (!player.activeModifiers.some((m) => JSON.stringify(m) === JSON.stringify(modifier))) {
      player.activeModifiers.push(modifier)
    }
  })
}

/**
 * Finalize leaf for the occupation flow. Mirrors apply-improvement: pay leaf
 * runs first inside `seq:[pay, apply-occupation-play]`, then apply-* mutates
 * occupation state. Occupation onBuy effects do not currently consume payment
 * info here; C116_FurnitureMaker reads `extraData.resourcesPaid` straight off
 * the pay leaf event, which is more accurate than the legacy "reconstruct
 * lessons cost" branch in occupation.ts.
 */
export const applyOccupationPlayAction: ActionDefinition = {
  id: 'apply-occupation-play',
  // Inherit the play-occupation label so the leaf-action-detail flush emits
  // log.actionDetail with the wrapper's name (matches B107 / FurnitureMaker
  // log assertions that look for "play-occupation" in the action key).
  nameKey: 'actions.lessons.name',
  descriptionKey: 'actions.apply-occupation-play.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params, state, sourceCard, actionContext, emitPrivateEvent, eventSink }): ActionExecutionResult => {
    if (!isApplyOccupationPlayParams(params)) {
      return { type: 'fail', errorKey: 'log.occupationFail' }
    }
    const { occupationId } = params
    const occupation = getOccupation(occupationId)
    if (!occupation) {
      return { type: 'fail', errorKey: 'log.occupationFail' }
    }
    // Clear any legacy payment stash left by older callers. Current pay leaves
    // report payment details through their result/event data, and occupation
    // onBuy effects do not consume PaymentInfo here.
    delete player._pendingImprovementPaymentInfo
    void sourceCard
    const wasInHand = player.occupationHand.includes(occupationId)
    applyOccupation(state, player, occupationId)
    const handChangeSourceCard = readPrivateHandChangeSourceCard(actionContext, occupationId)
    if (wasInHand && handChangeSourceCard) {
      emitPrivateEvent?.(cardEffectHandChangedEvent(
        player.id,
        [occupationId],
        'occupation',
        handChangeSourceCard,
      ))
    }
    eventSink?.emit<'card.played'>({
      type: 'card.played',
      cardId: occupationId,
      cardType: 'occupation',
    })

    const activation = activateCard(state, player, occupationId, 'onBuy')
    if (activation.type === 'flow') {
      return activation
    }
    return { type: 'ok' }
  },
}
