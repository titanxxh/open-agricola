import type { PlayerState } from '../../game/types'
import { ensureCardState } from './card-state'

const PENDING_FENCE_BONUS_CARD_ID = '__pendingFenceBonus__'

type PendingFenceBonus = {
  sourceCard: string
  counterKey: string
  freeFences: number
}

export const storePendingFenceBonus = (
  player: PlayerState,
  pending: PendingFenceBonus,
) => {
  const cardState = ensureCardState(player, PENDING_FENCE_BONUS_CARD_ID)
  cardState.extraData = { ...pending }
}

export const readPendingFenceBonus = (
  player: PlayerState,
): PendingFenceBonus | undefined =>
  player.cardStates?.[PENDING_FENCE_BONUS_CARD_ID]?.extraData as PendingFenceBonus | undefined

export const clearPendingFenceBonus = (player: PlayerState) => {
  if (!player.cardStates?.[PENDING_FENCE_BONUS_CARD_ID]?.extraData) return
  delete player.cardStates[PENDING_FENCE_BONUS_CARD_ID]!.extraData
}

export const consumePendingFenceBonus = (
  player: PlayerState,
  builtFenceCount: number,
) => {
  const pending = readPendingFenceBonus(player)
  if (!pending) return undefined
  clearPendingFenceBonus(player)
  const usedFreeFences = Math.max(0, Math.min(builtFenceCount, pending.freeFences))
  if (usedFreeFences <= 0) return { sourceCard: pending.sourceCard, usedFreeFences: 0 }
  const cardState = ensureCardState(player, pending.sourceCard)
  const counters = cardState.counters ?? {}
  cardState.counters = counters
  counters[pending.counterKey] = Math.max(0, (counters[pending.counterKey] ?? 0) - usedFreeFences)
  return { sourceCard: pending.sourceCard, usedFreeFences }
}
