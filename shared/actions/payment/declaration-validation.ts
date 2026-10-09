/** Pure payment declaration invariants, shared by native settlement and custom-card admission. */
import type { Bonus, CardProvidedPaymentResourceProvider, TradeModifier } from '../../contract/types'
import { InvalidActionContextError } from '../../contract/action-context-error.ts'

export const MAX_PAYMENT_PROVIDER_COMBINATIONS = 512

/** Bound the conservative cover/provider product before any host enumeration.
 * The final merged list is checked too; separate contributions cannot bypass it. */
export const assertPaymentProviderEnumerationBudget = (providers: readonly CardProvidedPaymentResourceProvider[]): void => {
  let combinations = 1
  for (const provider of providers) {
    const available = Math.max(0, Math.floor(provider.available))
    if (available === 0) continue
    for (const cover of provider.covers) {
      if (cover.costAmount <= 0 || cover.paymentAmount <= 0) continue
      combinations *= Math.floor(available / cover.paymentAmount) + 1
      if (!Number.isFinite(combinations) || combinations > MAX_PAYMENT_PROVIDER_COMBINATIONS) throw new InvalidActionContextError('Payment provider enumeration exceeds the 512-combination limit')
    }
  }
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
