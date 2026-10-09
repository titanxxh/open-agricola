import type { ChoiceEffectPreview, GameState, PlayerState } from '../contract/types'
import { readCardExtraData, writeCardExtraData } from '../cards/helpers/card-state'
import { incCounter, initCardState } from '../cards/__stubs__/helpers'
import { getCardEffect } from '../cards/card-effects'
import { computeSourceCardContribution } from '../domain/scoring'

export type CardStorageOperation =
  | { kind: 'increment-extra-data'; key: string; amount: number }
  | { kind: 'set-extra-data'; key: string; value: unknown }
  | { kind: 'increment-counter'; key: string; amount: number }
  | { kind: 'set-counter'; key: string; value: number }

export const readCardStorageOperation = (params?: Record<string, unknown>): CardStorageOperation | undefined => {
  if (!params || typeof params.key !== 'string') return undefined
  if ((params.kind === 'increment-counter' || params.kind === 'increment-extra-data') && typeof params.amount === 'number') return params as CardStorageOperation
  if (params.kind === 'set-extra-data') return params as CardStorageOperation
  if (params.kind === 'set-counter' && typeof params.value === 'number') return params as CardStorageOperation
  return undefined
}

/** The same deterministic write is used by execution and detached projection. */
export const applyCardStorageOperation = (player: PlayerState, sourceCard: string, operation: CardStorageOperation): void => {
  switch (operation.kind) {
    case 'increment-extra-data':
      writeCardExtraData(player, sourceCard, operation.key, (readCardExtraData<number>(player, sourceCard, operation.key) ?? 0) + operation.amount)
      break
    case 'set-extra-data':
      writeCardExtraData(player, sourceCard, operation.key, operation.value)
      break
    case 'increment-counter':
      incCounter(player, sourceCard, operation.key, operation.amount)
      break
    case 'set-counter':
      initCardState(player, sourceCard)[operation.key] = Math.max(0, operation.value)
      break
  }
}

export const cardStorageAffectsScore = (sourceCard: string, operation: CardStorageOperation): boolean => {
  const effect = getCardEffect(sourceCard)
  return Boolean(effect?.computeBonusScore || effect?.computeCostedBonus ||
    ((operation.kind === 'increment-counter' || operation.kind === 'set-counter') && operation.key === 'bonusVp'))
}

export const previewCardStorageOperation = (state: GameState, player: PlayerState, sourceCard: string, operation: CardStorageOperation): ChoiceEffectPreview | undefined => {
  if (!cardStorageAffectsScore(sourceCard, operation)) return undefined
  const projectedPlayer: PlayerState = { ...player, resources: { ...player.resources }, cardStates: structuredClone(player.cardStates ?? {}) }
  const projectedState: GameState = { ...state, players: state.players.map((candidate) => candidate.id === player.id ? projectedPlayer : candidate) }
  applyCardStorageOperation(projectedPlayer, sourceCard, operation)
  return { kind: 'cardScore', cardId: sourceCard, delta: computeSourceCardContribution(projectedState, player.id, sourceCard) - computeSourceCardContribution(state, player.id, sourceCard) }
}
