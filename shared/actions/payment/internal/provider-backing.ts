import {
  readTurnScopeToken,
  readTurnOrGapToken,
  isUsedThisTurnOrGap,
} from '../../../cards/helpers/turn-token'
import { playerHasCardCapability } from '../../../cards/helpers/card-type'
/**
 * Live backing of card-provided payment resources. Enumeration uses it to
 * offer only payable solutions; settlement reuses it before consuming.
 */
import type {
  CardProvidedPaymentResourceProvider,
  GameState,
  PaymentSolution,
} from '../../../contract/types'
import { findActionSpaceById } from '../../../domain/space'

export const canConsumePaymentResourceProviders = (
  state: GameState | undefined,
  solution: PaymentSolution,
  providers: readonly CardProvidedPaymentResourceProvider[] | undefined,
  allowAdmissionProjection = false,
): boolean => {
  const providerByKey = new Map((providers ?? []).map((provider) => [provider.key, provider]))
  // Several provider keys may draw from one action-space pool; add their demand.
  const demandByPool = new Map<string, { available: number; amount: number }>()
  for (const key of Object.keys(solution.resourcesPaid)) {
    if (!key.includes(':')) continue
    const provider = providerByKey.get(key as CardProvidedPaymentResourceProvider['key'])
    const amount = solution.resourcesPaid[key as CardProvidedPaymentResourceProvider['key']] ?? 0
    if (amount <= 0) continue
    if (!provider || !state) return false
    if (amount > Math.max(0, Math.floor(provider.available))) return false
    const backing = provider.consume
    if (backing.type === 'handCard') {
      const owner = state.players.find((p) => p.id === backing.playerId)
      if (
        !owner ||
        ![...owner.occupationHand, ...owner.minorHand].includes(backing.cardId) ||
        playerHasCardCapability(owner, 'preventsHandDiscard')
      )
        return false
      if (backing.previewNextTurn) {
        if (!allowAdmissionProjection || readTurnScopeToken(owner) !== undefined) return false
      } else if (
        readTurnOrGapToken(owner) !== backing.turnToken ||
        isUsedThisTurnOrGap(owner, backing.usageSource)
      )
        return false
      const pool = `hand:${backing.playerId}:${backing.usageSource}:${backing.turnToken}`
      const demand = demandByPool.get(pool) ?? { available: 1, amount: 0 }
      demand.amount += amount
      demandByPool.set(pool, demand)
      continue
    }
    const pool =
      backing.type === 'actionSpace'
        ? `space:${backing.spaceId}:${backing.resource}`
        : `card:${backing.playerId}:${backing.cardId}:${backing.counterKey}`
    const available =
      backing.type === 'actionSpace'
        ? (findActionSpaceById(state, backing.spaceId)?.resources?.[backing.resource] ?? 0)
        : (state.players.find((p) => p.id === backing.playerId)?.cardStates[backing.cardId]
            ?.counters?.[backing.counterKey] ?? 0)
    const demand = demandByPool.get(pool) ?? { available, amount: 0 }
    demand.amount += amount
    demandByPool.set(pool, demand)
  }
  return [...demandByPool.values()].every(({ available, amount }) => available >= amount)
}
