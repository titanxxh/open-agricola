/** Pure payment declaration invariants, shared by native settlement and custom-card admission. */
import type { Bonus, TradeModifier } from '../../contract/types'

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
