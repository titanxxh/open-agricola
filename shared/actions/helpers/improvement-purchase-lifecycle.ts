import type { ActionExecutionResult, GameState, PlayerState } from '../../contract/types'
import type { EventSink } from '../../contract/events'
import type { PaymentInfo } from '../../cards/card-effects'
import { getMinorImprovement } from '../../cards/registry-display'
import { returnCardToBoard } from '../../cards/helpers/return-card'
import { takeMajorImprovementFromSupply } from '../../cards/major/supply'
import { incMajorBuilt, incMinorBuilt, incOccupationBuilt, recordDraftPlayed } from '../../session/stats'
import { getCardModifiers } from '../../cards/card-modifiers'
import { activateCardEffect } from '../effects/internal/activate-card-effect'
import {
  cardEffectHandChangedEvent,
  readPrivateHandChangeSourceCard,
} from '../../session/private-hand-events'
import { getPositiveResourceLog, type ResolvedMinorImprovement } from './improvement-helpers'

export type ImprovementPurchaseKind = 'major' | 'minor'

type SuccessfulImprovementResult = Extract<ActionExecutionResult, { type: 'ok' | 'flow' }>

type ApplyMinorResult =
  | { passing: true; nextPlayer: PlayerState }
  | { passing: false }

type CommitImprovementPurchaseLifecycleArgs = {
  state: GameState
  player: PlayerState
  kind: ImprovementPurchaseKind
  improvementId: string
  paymentInfo: PaymentInfo
  actionContext?: Record<string, unknown>
  emitPrivateEvent?: (event: ReturnType<typeof cardEffectHandChangedEvent>) => void
  eventSink?: EventSink
}

type FinalizeDirectImprovementPurchaseLifecycleArgs = Omit<
  CommitImprovementPurchaseLifecycleArgs,
  'emitPrivateEvent' | 'eventSink' | 'actionContext'
>

const attachImprovementPayment = (
  result: SuccessfulImprovementResult,
  improvementId: string,
  resourcesPaid: NonNullable<PaymentInfo['resourcesPaid']>,
  returnedCardId?: string,
): SuccessfulImprovementResult => {
  result.extraData = {
    ...(result.extraData ?? {}),
    improvementPayment: {
      improvementId,
      resourcesPaid: getPositiveResourceLog(resourcesPaid) ?? {},
      ...(returnedCardId ? { returnedCardId } : {}),
    },
  }
  return result
}

const applyMajorImprovementPurchase = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  returnedMajorId?: string,
): void => {
  if (returnedMajorId) {
    returnCardToBoard(player, returnedMajorId, state)
  }

  if (!player.improvements.includes(improvementId)) {
    player.improvements.push(improvementId)
  }
  incMajorBuilt(player)
  takeMajorImprovementFromSupply(state, improvementId)
}

const applyMinorImprovementPurchase = (
  state: GameState,
  player: PlayerState,
  improvement: ResolvedMinorImprovement,
  returnedCardId?: string,
): ApplyMinorResult => {
  if (returnedCardId) {
    returnCardToBoard(player, returnedCardId, state)
  }

  player.minorHand = player.minorHand.filter((id) => id !== improvement.id)
  if (improvement.passing === true) {
    const idx = state.players.findIndex((p) => p.id === player.id)
    const nextPlayer = state.players[(idx + 1) % state.players.length]
    nextPlayer.minorHand = nextPlayer.minorHand ?? []
    if (!nextPlayer.minorHand.includes(improvement.id)) {
      nextPlayer.minorHand.push(improvement.id)
    }
    return { passing: true, nextPlayer }
  }

  if (!player.minorPlayed.includes(improvement.id)) {
    player.minorPlayed.push(improvement.id)
  }
  incMinorBuilt(player)
  recordDraftPlayed(player, improvement.id, state.round)

  if (improvement.providesOccupation) {
    player.extraOccupationsFromCards = player.extraOccupationsFromCards ?? []
    if (!player.extraOccupationsFromCards.includes(improvement.id)) {
      player.extraOccupationsFromCards.push(improvement.id)
      incOccupationBuilt(player)
    }
  }

  getCardModifiers(improvement.id).forEach((modifier) => {
    if (!player.activeModifiers.some((m) => JSON.stringify(m) === JSON.stringify(modifier))) {
      player.activeModifiers.push(modifier)
    }
  })
  return { passing: false }
}

export const commitImprovementPurchaseLifecycle = ({
  state,
  player,
  kind,
  improvementId,
  paymentInfo,
  actionContext,
  emitPrivateEvent,
  eventSink,
}: CommitImprovementPurchaseLifecycleArgs): SuccessfulImprovementResult => {
  const costResources = paymentInfo.resourcesPaid ?? {}
  const wasMinorInHand = kind === 'minor' && player.minorHand.includes(improvementId)
  let passResult: ApplyMinorResult | null = null
  if (kind === 'major') {
    applyMajorImprovementPurchase(state, player, improvementId, paymentInfo.returnedCardId)
  } else {
    const improvement = getMinorImprovement(improvementId)
    if (!improvement) return { type: 'ok' }
    passResult = applyMinorImprovementPurchase(state, player, improvement, paymentInfo.returnedCardId)
  }
  const handChangeSourceCard = readPrivateHandChangeSourceCard(actionContext, improvementId)
  if (wasMinorInHand && handChangeSourceCard) {
    emitPrivateEvent?.(cardEffectHandChangedEvent(
      player.id,
      [improvementId],
      'minor',
      handChangeSourceCard,
    ))
  }
  if (passResult && passResult.passing) {
    eventSink?.emit<'card.passed'>({
      type: 'card.passed',
      cardId: improvementId,
      fromPlayerId: player.id,
      toPlayerId: passResult.nextPlayer.id,
      sourceActionId: 'improvement',
      sourceCardId: improvementId,
    })
  } else {
    eventSink?.emit<'card.played'>({
      type: 'card.played',
      cardId: improvementId,
      cardType: kind,
      sourceActionId: 'improvement',
      sourceCardId: improvementId,
    })
  }
  return attachImprovementPayment({ type: 'ok' }, improvementId, costResources, paymentInfo.returnedCardId)
}

export const finalizeDirectImprovementPurchaseLifecycle = ({
  state,
  player,
  kind,
  improvementId,
  paymentInfo,
}: FinalizeDirectImprovementPurchaseLifecycleArgs): ActionExecutionResult => {
  const committed = commitImprovementPurchaseLifecycle({
    state,
    player,
    kind,
    improvementId,
    paymentInfo,
  })
  const activation = activateCardEffect(state, player, improvementId, 'onBuy', paymentInfo)
  if (activation.type === 'flow') {
    return attachImprovementPayment(
      activation,
      improvementId,
      paymentInfo.resourcesPaid ?? {},
      paymentInfo.returnedCardId,
    )
  }
  return committed
}
