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
): boolean => {
  const providerByKey = new Map((providers ?? []).map((provider) => [provider.key, provider]))
  // Aliased provider keys must share the same live backing balance.
  const demandByPool = new Map<string, { available: number; amount: number }>()
  for (const key of Object.keys(solution.resourcesPaid)) {
    if (!key.includes(':')) continue
    const provider = providerByKey.get(key as CardProvidedPaymentResourceProvider['key'])
    const amount = solution.resourcesPaid[key as CardProvidedPaymentResourceProvider['key']] ?? 0
    if (amount <= 0) continue
    if (!provider || !state || amount > Math.max(0, Math.floor(provider.available))) return false
    const backing = provider.consume
    const pool = backing.type === 'actionSpace'
      ? JSON.stringify(['actionSpace', backing.spaceId, backing.resource])
      : JSON.stringify(['card', backing.playerId, backing.cardId, backing.resource])
    const available = backing.type === 'actionSpace'
      ? findActionSpaceById(state, backing.spaceId)?.resources?.[backing.resource] ?? 0
      : state.players.find(player => player.id === backing.playerId)?.cardStates?.[backing.cardId]?.counters?.[backing.resource] ?? 0
    const demand = demandByPool.get(pool) ?? { available, amount: 0 }
    demand.amount += amount
    demandByPool.set(pool, demand)
  }
  return [...demandByPool.values()].every(({ available, amount }) => available >= amount)
}
