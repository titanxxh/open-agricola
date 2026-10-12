import type { GameState, PlayerState } from '../contract/types'
import type { RuleAmount, RuleCondition } from '../contract/rule-plans'
import { collectCardsAs } from '../cards/helpers/card-type'
import { getReturnHomePlacements } from '../cards/helpers/round-placement'
import { getRoundActionSlot } from '../cards/helpers/round-action-topology'
import { inactiveWorkersInSupply, familySize } from '../domain/player'
import { getLogicalFields } from '../cards/helpers/card-field'
import { readCardExtraData, isCardFlagged } from '../cards/helpers/card-state'

export const evaluateRuleAmount = (state: GameState, player: PlayerState, amount: RuleAmount, sourceCard?: string): number => {
  if (typeof amount === 'number') return amount
  switch (amount.kind) {
    case 'supply': return player.resources[amount.resource] ?? 0
    case 'fields': return getLogicalFields(player).filter(field => field.stacks.some(stack => stack.kind === amount.crop)).length
    case 'family': return familySize(player)
    case 'crop-total': return getLogicalFields(player).reduce((count, field) => count + field.stacks.reduce((total, stack) => total + stack.remaining, 0), 0)
    case 'major-improvements': return collectCardsAs(player, 'major').length
    case 'card-fact': {
      const value = sourceCard ? readCardExtraData<unknown>(player, sourceCard, amount.fact) ?? player.cardStates[sourceCard]?.counters?.[amount.fact] : undefined
      return typeof value === 'number' && Number.isFinite(value) ? value : 0
    }
    case 'occupied-round-spaces': return new Set(getReturnHomePlacements(state).filter(entry => getRoundActionSlot(state, entry.spaceId) !== null).map(entry => entry.spaceId)).size
    case 'scale': return evaluateRuleAmount(state, player, amount.value, sourceCard) * amount.by
    case 'min': return amount.values.length ? Math.min(...amount.values.map(value => evaluateRuleAmount(state, player, value, sourceCard))) : 0
    case 'sum': return amount.values.reduce<number>((total, value) => total + evaluateRuleAmount(state, player, value, sourceCard), 0)
    case 'divide': return Math.floor(evaluateRuleAmount(state, player, amount.value, sourceCard) / amount.by)
  }
}

export const evaluateRuleCondition = (state: GameState, player: PlayerState, condition: RuleCondition, sourceCard?: string): boolean => {
  switch (condition.kind) {
    case 'house-type': return player.houseType === condition.houseType
    case 'room-for-newborn': return player.rooms > familySize(player)
    case 'has-fields': return getLogicalFields(player).length > 0
    case 'card-flag': return !!sourceCard && isCardFlagged(player, sourceCard)
    case 'card-fact-positive': {
      const value = sourceCard ? readCardExtraData<unknown>(player, sourceCard, condition.fact) ?? player.cardStates[sourceCard]?.counters?.[condition.fact] : undefined
      return typeof value === 'number' && value > 0
    }
    case 'purchased-by-round': {
      const purchasedRound = sourceCard ? readCardExtraData<unknown>(player, sourceCard, condition.fact) : undefined
      return typeof purchasedRound === 'number' && Number.isInteger(purchasedRound) && purchasedRound >= 1 && purchasedRound <= condition.round
    }
    case 'extra-room-active': return !!sourceCard && readCardExtraData<unknown>(player, sourceCard, condition.fact) === true
    case 'card-fact-true': return !!sourceCard && readCardExtraData<unknown>(player, sourceCard, condition.fact) === true
    case 'inactive-supply-worker': return inactiveWorkersInSupply(player).length > 0
    case 'all': return condition.conditions.every(entry => evaluateRuleCondition(state, player, entry, sourceCard))
    case 'compare': {
      const left = evaluateRuleAmount(state, player, condition.left, sourceCard)
      const right = evaluateRuleAmount(state, player, condition.right, sourceCard)
      return condition.operator === 'eq' ? left === right : condition.operator === 'ge' ? left >= right : left > right
    }
  }
}
