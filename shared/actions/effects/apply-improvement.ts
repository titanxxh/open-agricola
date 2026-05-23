import type { ActionDefinition, ActionExecutionResult, GameState, PlayerState } from '../../contract/types'
import { incMajorBuilt, incMinorBuilt, incOccupationBuilt, recordDraftPlayed } from '../../session/stats'
import { getMinorImprovement } from '../../cards/registry-display'
import { getCardModifiers } from '../../cards/card-modifiers'
import { activateCard } from './activate-card'
import {
  cardEffectHandChangedEvent,
  readPrivateHandChangeSourceCard,
} from '../../session/private-hand-events'

export type ApplyImprovementParams = {
  improvementId: string
  kind: 'major' | 'minor'
}

const isApplyImprovementParams = (raw: unknown): raw is ApplyImprovementParams => {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  return typeof r.improvementId === 'string' && (r.kind === 'major' || r.kind === 'minor')
}

const applyMajor = (state: GameState, player: PlayerState, improvementId: string) => {
  if (!player.improvements.includes(improvementId)) {
    player.improvements.push(improvementId)
  }
  state.availableMajorImprovements = state.availableMajorImprovements.filter(
    (id) => id !== improvementId,
  )
  incMajorBuilt(player)
}

type ApplyMinorResult =
  | { passing: true; nextPlayer: PlayerState }
  | { passing: false }

const applyMinor = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
): ApplyMinorResult => {
  const handIdx = player.minorHand.indexOf(improvementId)
  if (handIdx >= 0) player.minorHand.splice(handIdx, 1)

  const minor = getMinorImprovement(improvementId)
  const passing = minor?.passing === true

  if (passing) {
    const idx = state.players.findIndex((p) => p.id === player.id)
    const nextPlayer = state.players[(idx + 1) % state.players.length]
    nextPlayer.minorHand = nextPlayer.minorHand ?? []
    if (!nextPlayer.minorHand.includes(improvementId)) {
      nextPlayer.minorHand.push(improvementId)
    }
    return { passing: true, nextPlayer }
  }

  if (!player.minorPlayed.includes(improvementId)) {
    player.minorPlayed.push(improvementId)
  }
  incMinorBuilt(player)
  recordDraftPlayed(player, improvementId, state.round)

  if (minor?.providesOccupation) {
    player.extraOccupationsFromCards = player.extraOccupationsFromCards ?? []
    if (!player.extraOccupationsFromCards.includes(improvementId)) {
      player.extraOccupationsFromCards.push(improvementId)
      incOccupationBuilt(player)
    }
  }

  getCardModifiers(improvementId).forEach((modifier) => {
    if (!player.activeModifiers.some((m) => JSON.stringify(m) === JSON.stringify(modifier))) {
      player.activeModifiers.push(modifier)
    }
  })
  return { passing: false }
}

export const applyImprovementAction: ActionDefinition = {
  id: 'apply-improvement',
  nameKey: 'actions.apply-improvement.name',
  descriptionKey: 'actions.apply-improvement.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params, state, actionContext, emitPrivateEvent, eventSink }): ActionExecutionResult => {
    if (!isApplyImprovementParams(params)) {
      return { type: 'fail', errorKey: 'log.improvementFail' }
    }
    const { improvementId, kind } = params
    const paymentInfo = player._pendingImprovementPaymentInfo
    delete player._pendingImprovementPaymentInfo
    const wasMinorInHand = kind === 'minor' && player.minorHand.includes(improvementId)
    let passResult: ApplyMinorResult | null = null // null when kind === 'major'
    if (kind === 'major') {
      applyMajor(state, player, improvementId)
    } else {
      passResult = applyMinor(state, player, improvementId)
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
      })
    } else {
      eventSink?.emit<'card.played'>({
        type: 'card.played',
        cardId: improvementId,
        cardType: kind,
      })
    }
    const activation = activateCard(state, player, improvementId, 'onBuy', paymentInfo)
    if (activation.type === 'flow') {
      return activation
    }
    return { type: 'ok' }
  },
}
