/** Pure payment declaration invariants, shared by native settlement and custom-card admission. */
import type { Bonus, CardProvidedPaymentResourceProvider, ComplexCost, GameState, PaymentSolution, TradeModifier } from '../../contract/types'
import { InvalidActionContextError } from '../../contract/action-context-error.ts'

export const MAX_PAYMENT_PROVIDER_COMBINATIONS = 512
export const MAX_PAYMENT_ENUMERATION_STEPS = 100_000

/** Invalid composed prices are unavailable in pure affordability queries. */
export class InvalidPaymentCostError extends InvalidActionContextError {}

/** Pure affordability queries report invalid composed costs as unavailable.
 * Enumeration and execution retain the typed error for command rollback. */
export const queryPaymentAvailability = (query: () => boolean): boolean => {
  try { return query() } catch (error) {
    if (error instanceof InvalidPaymentCostError) return false
    throw error
  }
}

/** Native cost combinations, also enforced before sandbox admission. */
export const collectComplexCostViolations = (cost: ComplexCost): string[] => {
  const violations: string[] = []
  if (cost.nb !== undefined && cost.cards !== undefined) violations.push('`nb` and `cards` are mutually exclusive')
  if (cost.trades?.some(trade => trade.scope === 'unit') && cost.nb === undefined) violations.push('unit-scoped trades present but `nb` is missing')
  return violations
}

/** Host-side expansion is outside the code isolate. Abort the whole query,
 * never truncate candidates or return an incomplete payment menu. */
export const createPaymentEnumerationBudget = (): ((steps?: number) => void) => {
  let remaining = MAX_PAYMENT_ENUMERATION_STEPS
  return (steps = 1) => {
    remaining -= steps
    if (!Number.isSafeInteger(remaining) || remaining < 0) throw new InvalidActionContextError('Payment enumeration exceeds the 100000-step limit')
  }
}

/** Bound the conservative cover/provider product before any host enumeration.
 * The final merged list is checked too; separate contributions cannot bypass it. */
export const assertPaymentProviderEnumerationBudget = (providers: readonly CardProvidedPaymentResourceProvider[]): void => {
  let combinations = 1
  const keys = new Set<string>()
  for (const provider of providers) {
    if (keys.has(provider.key)) throw new InvalidActionContextError('Payment provider keys must be distinct')
    keys.add(provider.key)
    const available = Math.max(0, Math.floor(provider.available))
    if (available === 0) continue
    for (const cover of provider.covers) {
      if (cover.costAmount <= 0 || cover.paymentAmount <= 0) continue
      combinations *= Math.floor(available / cover.paymentAmount) + 1
      if (!Number.isFinite(combinations) || combinations > MAX_PAYMENT_PROVIDER_COMBINATIONS) throw new InvalidActionContextError('Payment provider enumeration exceeds the 512-combination limit')
    }
  }
}

/** A candidate must have enough backing for all virtual keys together. This
 * query is reused before offering a payment and immediately before consuming it. */
export const canConsumePaymentResourceProviders = (
  state: GameState | undefined,
  solution: PaymentSolution,
  providers: readonly CardProvidedPaymentResourceProvider[] | undefined,
): boolean => {
  const providerByKey = new Map((providers ?? []).map(provider => [provider.key, provider]))
  const demand = new Map<string, { spaceId: string; resource: CardProvidedPaymentResourceProvider['consume']['resource']; amount: number }>()
  for (const [key, amount] of Object.entries(solution.resourcesPaid)) {
    if (!key.includes(':') || !amount || amount <= 0) continue
    const provider = providerByKey.get(key as CardProvidedPaymentResourceProvider['key'])
    if (!provider || !state || amount > Math.max(0, Math.floor(provider.available))) return false
    if (provider.consume.type !== 'actionSpace') return false
    const { spaceId, resource } = provider.consume
    const backingKey = JSON.stringify([spaceId, resource])
    const previous = demand.get(backingKey)?.amount ?? 0
    demand.set(backingKey, { spaceId, resource, amount: previous + amount })
  }
  return [...demand.values()].every(({spaceId, resource, amount}) =>
    (state?.actionSpaces?.find(space => space.id === spaceId)?.resources?.[resource] ?? 0) >= amount,
  )
}

export const validateTradeModifier = (modifier: TradeModifier): void => {
  if (modifier.scope === 'unit' && modifier.conditions?.minNumRooms !== undefined) {
    throw new Error(
      `TradeModifier ${modifier.cardId}: scope:'unit' MUST NOT carry conditions.minNumRooms ` +
      `(per-unit trades have no min-unit threshold).`,
    )
  }
  const hasGroupId = modifier.groupId !== undefined
  const hasGroupMin = modifier.groupMin !== undefined
  const hasGroupMax = modifier.groupMax !== undefined
  if (hasGroupId !== hasGroupMax || (hasGroupMin && !hasGroupId)) {
    throw new Error(`TradeModifier ${modifier.cardId}: groupId and groupMax must be set together.`)
  }
  if (modifier.groupId !== undefined && modifier.groupId.trim().length === 0) {
    throw new Error(`TradeModifier ${modifier.cardId}: groupId must be non-empty.`)
  }
  if (
    modifier.groupMin !== undefined &&
    (!Number.isInteger(modifier.groupMin) || modifier.groupMin <= 0)
  ) {
    throw new Error(`TradeModifier ${modifier.cardId}: groupMin must be a positive integer.`)
  }
  if (
    modifier.groupMax !== undefined &&
    (!Number.isInteger(modifier.groupMax) || modifier.groupMax <= 0)
  ) {
    throw new Error(`TradeModifier ${modifier.cardId}: groupMax must be a positive integer.`)
  }
  if (
    modifier.groupMin !== undefined &&
    modifier.groupMax !== undefined &&
    modifier.groupMin > modifier.groupMax
  ) {
    throw new Error(`TradeModifier ${modifier.cardId}: groupMin cannot exceed groupMax.`)
  }
}

export const validateBonus = (bonus: Bonus): void => {
  const hasDiscount = bonus.discount !== undefined
  const hasChoices = bonus.choices !== undefined
  if (hasDiscount === hasChoices) {
    throw new Error(
      'Bonus must have exactly one of discount or choices (got ' +
        `discount=${hasDiscount}, choices=${hasChoices})`,
    )
  }
  if (hasChoices && (bonus.choices!.length === 0)) {
    throw new Error('Bonus.choices must be a non-empty array')
  }
}
