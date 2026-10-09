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
  // Several provider keys may draw from one action-space pool; add their demand.
  const demandByPool = new Map<string, { spaceId: string; resource: CardProvidedPaymentResourceProvider['consume']['resource']; amount: number }>()
  for (const key of Object.keys(solution.resourcesPaid)) {
    if (!key.includes(':')) continue
    const provider = providerByKey.get(key as CardProvidedPaymentResourceProvider['key'])
    const amount = solution.resourcesPaid[key as CardProvidedPaymentResourceProvider['key']] ?? 0
    if (amount <= 0) continue
    if (!provider || !state) return false
    if (amount > Math.max(0, Math.floor(provider.available))) return false
    const { spaceId, resource } = provider.consume
    const pool = `${spaceId}\0${resource}`
    const demand = demandByPool.get(pool) ?? { spaceId, resource, amount: 0 }
    demand.amount += amount
    demandByPool.set(pool, demand)
  }
  return [...demandByPool.values()].every(({ spaceId, resource, amount }) =>
    (findActionSpaceById(state!, spaceId)?.resources?.[resource] ?? 0) >= amount)
}
