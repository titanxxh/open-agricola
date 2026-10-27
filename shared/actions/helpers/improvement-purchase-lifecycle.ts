import type { ActionExecutionResult, GameState, PlayerState, ProtectedObservation } from '../../contract/types'
import type { EventSink } from '../../contract/events'
import type { FlowEffectContext, PaymentInfo } from '../../cards/card-effects'
import { getMinorImprovement } from '../../cards/registry-display'
import { returnCardToBoard } from '../../cards/helpers/return-card'
import { takeMajorImprovementFromSupply } from '../../cards/major/supply'
import { incMajorBuilt, incMinorBuilt, incOccupationBuilt, recordDraftPlayed } from '../../session/stats'
import { ensureCardModifiers } from '../../cards/card-modifiers'
import { activateCardEffect } from '../effects/internal/activate-card-effect'
import {
  cardEffectHandChangedEvent,
  readPrivateHandChangeSourceCard,
} from '../../session/private-hand-events'
import { getPositiveResourceLog, type ResolvedMinorImprovement } from './improvement-helpers'
import { completeMinorCardPass } from './minor-card-passing'

export type ImprovementPurchaseKind = 'major' | 'minor'

type SuccessfulImprovementResult = Extract<ActionExecutionResult, { type: 'ok' | 'flow' }>

type ApplyMinorResult =
  | { passing: true }
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
  reportProtectedObservation?: (observation: ProtectedObservation) => void
}

type FinalizeDirectImprovementPurchaseLifecycleArgs = Omit<
  CommitImprovementPurchaseLifecycleArgs,
  'emitPrivateEvent' | 'eventSink' | 'actionContext'
> & Pick<FlowEffectContext, 'actionHooks'>

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
    return { passing: true }
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

  ensureCardModifiers(player, improvement.id)
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
  reportProtectedObservation,
}: CommitImprovementPurchaseLifecycleArgs): SuccessfulImprovementResult => {
  const costResources = paymentInfo.resourcesPaid ?? {}
  const wasMinorInHand = kind === 'minor' && player.minorHand.includes(improvementId)
  if (wasMinorInHand) {
    reportProtectedObservation?.({
      kind: 'hidden-information',
      recipientPlayerIds: state.players.map((entry) => entry.id),
      knownToPlayerIds: [player.id],
    })
  }
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
    completeMinorCardPass({
      state, player, cardId: improvementId, sourceActionId: 'improvement',
      sourceCardId: improvementId, eventSink,
    })
  } else {
    eventSink?.emit<'card.played'>({
      type: 'card.played',
      cardId: improvementId,
      cardType: kind,
      payment: paymentInfo.publicPayment ?? { resources: costResources, ...(paymentInfo.returnedCardId ? { returnedCardId: paymentInfo.returnedCardId } : {}) },
      sourceActionId: 'improvement',
      sourceCardId: improvementId,
    })
  }
  return attachImprovementPayment({ type: 'ok', extraData: { playedFromHand: wasMinorInHand } }, improvementId, costResources, paymentInfo.returnedCardId)
}

export const finalizeDirectImprovementPurchaseLifecycle = ({
  actionHooks,
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
  const activation = activateCardEffect(state, player, improvementId, 'onBuy', paymentInfo, { actionHooks })
  if (activation.type === 'flow') {
    return attachImprovementPayment(
      { ...activation, extraData: { ...activation.extraData, ...committed.extraData } },
      improvementId,
      paymentInfo.resourcesPaid ?? {},
      paymentInfo.returnedCardId,
    )
  }
  return committed
}
