import type { ActionDefinition, ActionExecutionContext, ActionMutationContext, ActionFlow } from '../contract/types'
import type { RuleFixedOperation } from '../contract/rule-fixed-operations'
import { getLogicalFields, mutateLogicalFields } from '../cards/helpers/card-field'
import { readCardExtraData, writeCardExtraData } from '../cards/helpers/card-state'
import { getExtraRoomCapacity } from '../cards/card-effects'
import { familySize } from '../domain/player'
import { releaseSupplyWorker } from '../domain/supply-workers'
import { isSyntheticLinkedOccupancy } from '../domain/space'
import { getOwnOrdinaryFenceReserveCount } from '../domain/supply-tokens'
import { parsePositionKey } from '../domain/farm'
import { registerSelectionEffect } from './helpers/selection-effect-registry'
import { evaluateRuleAmount } from './rule-queries'
import { bonusVpLeaf, gainLeaf, payLeaf } from '../cards/helpers/pay-gain-node'
import { renovateHouseAction } from './effects/renovation'
import { isActionDoableInFlowContext } from './flow'
import { getActionDefinition } from './action-definition-lookup'
import { sourcedMandatoryBonusChoices } from '../cards/helpers/renovation-cost'
import { breedLeaf } from './effects/breed'
import { canAccommodateAllAnimals } from '../domain/animal-zones'
import { canStartFencing } from './effects/fencing'

registerSelectionEffect('rule-take-field-crop', ({ state, player, positions, sourceCard, actionContext, eventSink }) => {
  const crop = actionContext?.ruleCrop
  const amount = actionContext?.ruleCropAmount
  if (!sourceCard || (crop !== 'grain' && crop !== 'vegetable') || typeof amount !== 'number') return
  for (const key of positions) {
    const position = parsePositionKey(key)
    if (!position) continue
    const field = getLogicalFields(player).find(candidate => candidate.slots.some(slot => slot.tile.row === position.row && slot.tile.col === position.col))
    const top = field && [...field.slots].reverse().find(slot => slot.stack)
    if (!field || top?.stack?.kind !== crop || top.stack.remaining < amount) continue
    const removed = mutateLogicalFields(state, player, { sourceCard, eventSink }).remove({ fieldId: field.id, slot: top.index }, amount)
    if (removed.ok) return {
      type: 'seq',
      children: [gainLeaf(sourceCard, { [crop]: amount }), ...(removed.flow ? [removed.flow] : [])],
    }
  }
})

const discountedActionLeaf = (sourceCard: string, operation: Extract<RuleFixedOperation, { kind: 'discounted-action' }>): Extract<ActionFlow, { type: 'leaf' }> => ({
  type: 'leaf', actionId: operation.actionId, sourceCard,
  actionContext: { costBonuses: [sourcedMandatoryBonusChoices(sourceCard, operation.discounts.map(discount => ({ ...discount })))] },
})

export const canExecuteFixedRuleOperation = (operation: RuleFixedOperation, context: Pick<ActionExecutionContext, 'actionHooks' | 'state' | 'player' | 'sourceCard'> & Partial<Pick<ActionExecutionContext, 'space'>>): boolean => {
  const { state, player, sourceCard } = context
  switch (operation.kind) {
    case 'collect-board-resources': return state.actionSpaces.some(space => operation.resources.some(resource => (space.resources[resource] ?? 0) > 0))
    case 'discounted-action': {
      if (!sourceCard || !context.space) return false
      const leaf = discountedActionLeaf(sourceCard, operation)
      return isActionDoableInFlowContext({ ...context, space: context.space, ...leaf, action: renovateHouseAction, resolveAction: getActionDefinition })
    }
    case 'each-space-worker': return state.actionSpaces.some(space => space.id === operation.spaceId && space.takenBy.some(worker => worker.playerId === player.id && !isSyntheticLinkedOccupancy(worker)))
    default: return true
  }
}

const exchange = (cardId: string, operation: Extract<RuleFixedOperation, { kind: 'bounded-exchange' }>, count: number): ActionFlow => ({
  type: 'seq', children: [
    payLeaf({ cardId, cost: Object.fromEntries(Object.entries(operation.cost).map(([resource, amount]) => [resource, amount * count])) }),
    ...(Object.keys(operation.gain).length ? [gainLeaf(cardId, Object.fromEntries(Object.entries(operation.gain).map(([resource, amount]) => [resource, amount * count])))] : []),
    ...(operation.bonusVp * count > 0 ? [bonusVpLeaf(cardId, operation.bonusVp * count)] : []),
  ],
})

export const executeFixedRuleOperation = (operation: RuleFixedOperation, context: ActionMutationContext): ReturnType<ActionDefinition['execute']> => {
  const { state, player, sourceCard } = context
  if (!sourceCard) return { type: 'fail', errorKey: 'log.cardEffectFail' }
  switch (operation.kind) {
    case 'breed-animals': return canAccommodateAllAnimals(state, player, [...operation.animals]) ? { type: 'flow', flow: breedLeaf(sourceCard, operation.animals) } : { type: 'ok' }
    case 'take-field-crop': {
      const selectableTiles = getLogicalFields(player).flatMap(field => {
        const top = [...field.slots].reverse().find(slot => slot.stack)
        if (top?.stack?.kind !== operation.crop || top.stack.remaining < operation.amount) return []
        return [{ ...top.tile, ...(field.sourceCard ? { sourceCard: field.sourceCard, groupKey: field.groupKey, cardFieldSlot: top.index } : {}) }]
      })
      if (!selectableTiles.length) return { type: 'ok' }
      return { type: 'flow', flow: { type: 'leaf', actionId: 'selection', sourceCard, actionContext: {
        selectionKind: 'farm-position', selectableTiles, minSelections: 1, maxSelections: 1,
        selectionEffect: 'rule-take-field-crop', ruleCrop: operation.crop, ruleCropAmount: operation.amount,
      } } }
    }
    case 'expire-extra-room': {
      if (readCardExtraData<unknown>(player, sourceCard, operation.fact) !== true) return { type: 'ok' }
      writeCardExtraData(player, sourceCard, operation.fact, false)
      if (operation.removeUnhousedWorker && player.rooms + getExtraRoomCapacity(player) < familySize(player)) {
        const victim = player.workers.find(worker => worker.isActive)
        if (victim) {
          victim.removedFromSupply = true
          releaseSupplyWorker(state, player, victim)
          context.eventSink?.emit<'worker.returned'>({
            type: 'worker.returned', to: 'removed',
            workers: [{ playerId: player.id, workerId: victim.id }], sourceCardId: sourceCard,
          })
        }
      }
      return { type: 'ok' }
    }
    case 'collect-board-resources': {
      const children: ActionFlow[] = state.actionSpaces.filter(space => operation.resources.some(resource => (space.resources[resource] ?? 0) > 0)).map(space => ({
        type: 'leaf', actionId: 'collect', sourceCard, actionContext: { spaceId: space.id, targetSpaceId: space.id, resourceTypes: [...operation.resources] },
      }))
      return children.length ? { type: 'flow', flow: { type: 'seq', children } } : { type: 'ok' }
    }
    case 'each-space-worker': {
      const workers = state.actionSpaces.find(space => space.id === operation.spaceId)?.takenBy.filter(worker => worker.playerId === player.id && !isSyntheticLinkedOccupancy(worker)) ?? []
      const children: ActionFlow[] = workers.map(worker => ({ type: 'xor', children: [
        gainLeaf(sourceCard, operation.alternativeGain),
        { type: 'leaf', actionId: 'move-farmer-to-space', sourceCard, params: { excludeSpaceId: operation.spaceId, workerId: worker.workerId }, actionContext: { moveFarmerSourceSpaceId: operation.spaceId, moveFarmerWorkerId: worker.workerId } },
      ] }))
      return children.length ? { type: 'flow', flow: { type: 'seq', children } } : { type: 'ok' }
    }
    case 'discounted-action': {
      if (player.houseType === 'stone') return { type: 'ok' }
      return { type: 'flow', flow: { ...discountedActionLeaf(sourceCard, operation), optional: true } }
    }
    case 'borrow-fences': {
      const donorCaps: Record<string, number> = {}
      for (const opponent of state.players) if (opponent.id !== player.id) donorCaps[opponent.id] = Math.min(operation.maximumPerOpponent, getOwnOrdinaryFenceReserveCount(opponent))
      const max = Object.values(donorCaps).reduce((count, value) => count + value, 0)
      const actionContext = { trueAction: false, fencePolicy: {
        allowedSegmentTypes: ['fence'], sourcePolicy: { kind: 'borrowed', donorCaps },
        segmentBounds: { fence: { min: 1, max }, total: { min: 1, max } }, costPolicy: { fence: { wood: 0 } }, cancelPolicy: 'forbidCancel',
      } }
      if (!max || !canStartFencing(context.actionHooks, state, player, undefined, actionContext)) return { type: 'ok' }
      return { type: 'flow', flow: { type: 'leaf', actionId: 'fence', sourceCard, optional: true, actionContext } }
    }
    case 'bounded-exchange': {
      let max = Math.max(0, Math.floor(evaluateRuleAmount(state, player, operation.maximum, sourceCard)))
      for (const [resource, amount] of Object.entries(operation.cost)) {
        const available = Object.entries(player.resources).find(([key]) => key === resource)?.[1] ?? 0
        if (amount > 0) max = Math.min(max, Math.floor(available / amount))
      }
      if (max <= 0) return { type: 'ok' }
      const flow = operation.quantity === 'maximum' || max === 1 ? exchange(sourceCard, operation, max) : {
        type: 'xor', children: Array.from({ length: max }, (_, index) => exchange(sourceCard, operation, index + 1)),
      } satisfies ActionFlow
      return { type: 'flow', flow: { ...flow, optional: operation.quantity === 'choose' } }
    }
  }
}
