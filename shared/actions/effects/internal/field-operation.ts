import type { ActionDefinition, ActionFlow, Field, PlayerState, Resource } from '../../../contract/types'
import { REAL_RESOURCE_KEYS } from '../../../contract/resource-keys'
import { selectionAction } from './selection'
import { getLogicalFields, mutateLogicalFields } from '../../../cards/helpers/card-field'
import { parsePositionKey, positionKey } from '../../../domain/farm'
import { gainLeaf } from '../../../cards/helpers/pay-gain-node'
import { fieldOperationFlow, type FieldOperation } from '../../plans/field-operation'
import { getFarmyardSpaceStates } from '../../../domain/farmyard-space-states'

const positiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const crop = (value: unknown): value is 'grain' | 'vegetable' => value === 'grain' || value === 'vegetable'
const readSourceCrops = (value: object): { sourceCrops?: Field['stacks'][number]['kind'][] } | undefined => {
  if (!('sourceCrops' in value)) return {}
  if (!Array.isArray(value.sourceCrops) || !value.sourceCrops.length ||
      !value.sourceCrops.every((kind): kind is Field['stacks'][number]['kind'] => crop(kind) || kind === 'wood' || kind === 'stone')) return
  return { sourceCrops: value.sourceCrops }
}
const resources = (value: unknown): Partial<Resource> | undefined => {
  if (!value || typeof value !== 'object') return
  const result: Partial<Resource> = {}
  for (const key of REAL_RESOURCE_KEYS) {
    if (!(key in value)) continue
    const amount = Reflect.get(value, key)
    if (!positiveInteger(amount)) return
    result[key] = amount
  }
  return result
}
const readOperation = (value: unknown): FieldOperation | undefined => {
  if (!value || typeof value !== 'object' || !('kind' in value)) return
  switch (value.kind) {
    case 'discard-all': return { kind: value.kind }
    case 'discard-crop-spaces': return { kind: value.kind }
    case 'replace':
      if ('from' in value && crop(value.from) && 'to' in value && crop(value.to) &&
          'fromAmount' in value && positiveInteger(value.fromAmount) && 'toAmount' in value && positiveInteger(value.toAmount)) {
        return { kind: value.kind, from: value.from, to: value.to, fromAmount: value.fromAmount, toAmount: value.toAmount }
      }
      return
    case 'remove-top': {
      if (!('amount' in value) || !positiveInteger(value.amount) || !('gain' in value)) return
      const gain = resources(value.gain)
      return gain ? { kind: value.kind, amount: value.amount, gain } : undefined
    }
    case 'move':
    case 'move-destination': {
      const sourceCrops = readSourceCrops(value)
      if (!sourceCrops || !('amount' in value) || !positiveInteger(value.amount)) return
      if (value.kind === 'move') return { kind: value.kind, amount: value.amount, ...sourceCrops }
      return 'sourcePosition' in value && typeof value.sourcePosition === 'string'
        ? { kind: value.kind, amount: value.amount, sourcePosition: value.sourcePosition, ...sourceCrops } : undefined
    }
  }
}
const findField = (player: PlayerState, key: string) => {
  const position = parsePositionKey(key)
  return position && getLogicalFields(player).find(field => (field.kind === 'farmyard' && positionKey(field) === positionKey(position)) || field.slots.some(slot => positionKey(slot.tile) === positionKey(position)))
}
const top = (field: ReturnType<typeof getLogicalFields>[number]) => [...field.slots].reverse().find(slot => slot.stack)
const sequence = (children: ActionFlow[]): ActionFlow | undefined => children.length === 1 ? children[0] : children.length ? { type: 'seq', children } : undefined

export const fieldOperationAction: ActionDefinition = {
  id: 'field-operation', nameKey: 'actions.selection.name', descriptionKey: 'actions.selection.description',
  roundAvailable: 1, gainPerRound: {}, canBeExecutedByPlayer: () => true,
  previewEffect: ({ params, actionContext }) => {
    const operation = readOperation(params?.operation)
    if (!operation) return
    return { kind: 'fieldOperation', operation: operation.kind === 'move' || operation.kind === 'move-destination' ? { kind: 'move', amount: operation.amount } : operation.kind === 'discard-crop-spaces' ? { kind: 'discard-all' } : operation,
      ...(operation.kind === 'discard-crop-spaces' ? { location: 'crop-space' as const } : {}),
      minSelections: typeof actionContext?.minSelections === 'number' ? actionContext.minSelections : 1,
      maxSelections: typeof actionContext?.maxSelections === 'number' ? actionContext.maxSelections : 1 }
  },
  execute: context => typeof context.params?.position === 'string'
    ? fieldOperationAction.resolveChoice!(context, 'confirm', { positions: [context.params.position] })
    : selectionAction.execute(context),
  resolveChoice: (context, choice, payload) => {
    const operation = readOperation(context.params?.operation)
    if (!operation) return { type: 'fail', errorKey: 'log.actionFail' }
    if (operation.kind === 'move' || operation.kind === 'move-destination') {
      const position = payload && typeof payload === 'object' && 'positions' in payload && Array.isArray(payload.positions)
        ? payload.positions[0] : undefined
      const source = typeof position === 'string' && findField(context.player, operation.kind === 'move' ? position : operation.sourcePosition)
      const stack = source && top(source)?.stack
      if (!stack || stack.remaining <= operation.amount || (operation.sourceCrops && !operation.sourceCrops.includes(stack.kind))) {
        return { type: 'fail', errorKey: 'log.actionFail', recoverable: true }
      }
      if (operation.kind === 'move' && (!context.sourceCard || !getLogicalFields(context.player).some(target =>
        !target.stacks.length && (!target.allowedCrops || target.allowedCrops.includes(stack.kind))))) {
        return { type: 'fail', errorKey: 'log.actionFail', recoverable: true }
      }
      if (operation.kind === 'move-destination') {
        const target = typeof position === 'string' && findField(context.player, position)
        if (!target || target.stacks.length || (target.allowedCrops && !target.allowedCrops.includes(stack.kind))) {
          return { type: 'fail', errorKey: 'log.actionFail', recoverable: true }
        }
      }
    }
    const validation = selectionAction.resolveChoice?.(context, choice, payload)
    if (!validation || validation.type !== 'ok') return validation ?? { type: 'fail', errorKey: 'log.actionFail' }
    const raw = validation.extraData?.selectedPositions
    if (!Array.isArray(raw) || !raw.every((key): key is string => typeof key === 'string')) return { type: 'fail', errorKey: 'log.actionFail' }
    if (operation.kind === 'discard-crop-spaces') {
      const selected = new Set(raw)
      context.player.farmyardSpaceStates = getFarmyardSpaceStates(context.player).filter(space => !(space.sourceCardId === context.sourceCard && space.kind === 'non-field-crop-space' && selected.has(space.spaceKey)))
      return validation
    }
    const selected = raw.map(key => findField(context.player, key))
    if (selected.some(field => !field)) return { type: 'fail', errorKey: 'log.actionFail' }
    const mutations = mutateLogicalFields(context.state, context.player, { sourceCard: context.sourceCard, eventSink: context.eventSink })
    const children: ActionFlow[] = []
    for (const field of selected) {
      if (!field) return { type: 'fail', errorKey: 'log.actionFail' }
      const slot = top(field)
      if (operation.kind === 'move') {
        if (!slot?.stack || slot.stack.remaining <= operation.amount || !context.sourceCard) return { type: 'fail', errorKey: 'log.actionFail' }
        const targets = getLogicalFields(context.player).flatMap(target => {
          if (target.stacks.length || (target.allowedCrops && !target.allowedCrops.includes(slot.stack!.kind))) return []
          if (target.kind === 'farmyard') return [{ row: target.row, col: target.col }]
          const targetSlot = target.slots[0]
          return targetSlot ? [{ ...targetSlot.tile, ...(target.sourceCard ? { sourceCard: target.sourceCard, groupKey: target.groupKey, cardFieldSlot: targetSlot.index } : {}) }] : []
        })
        if (!targets.length) return { type: 'fail', errorKey: 'log.actionFail' }
        return { type: 'flow', flow: fieldOperationFlow(context.sourceCard, { kind: 'move-destination', amount: operation.amount, sourcePosition: positionKey(slot.tile), ...(operation.sourceCrops ? { sourceCrops: operation.sourceCrops } : {}) }, targets), extraData: validation.extraData }
      }
      if (operation.kind === 'move-destination') {
        const source = findField(context.player, operation.sourcePosition)
        const sourceSlot = source && top(source)
        const targetSlot = field.kind === 'farmyard' ? 0 : field.slots[0]?.index
        if (!source || !sourceSlot?.stack || sourceSlot.stack.remaining <= operation.amount || field.stacks.length || targetSlot === undefined ||
            (field.allowedCrops && !field.allowedCrops.includes(sourceSlot.stack.kind))) return { type: 'fail', errorKey: 'log.actionFail' }
        const removed = mutations.remove({ fieldId: source.id, slot: sourceSlot.index }, operation.amount)
        if (!removed.ok) return { type: 'fail', errorKey: 'log.actionFail' }
        const placed = mutations.place({ fieldId: field.id, slot: targetSlot }, sourceSlot.stack.kind, operation.amount)
        if (!placed.ok) throw new Error('Validated field destination refused crop placement')
        if (removed.flow) children.push(removed.flow)
      } else if (operation.kind === 'replace') {
        if (!slot?.stack || slot.stack.kind !== operation.from || slot.stack.remaining !== operation.fromAmount ||
            field.stacks.reduce((sum, stack) => sum + stack.remaining, 0) !== operation.fromAmount ||
            (field.allowedCrops && !field.allowedCrops.includes(operation.to))) return { type: 'fail', errorKey: 'log.actionFail' }
        const replaced = mutations.replace({ fieldId: field.id, slot: slot.index }, operation.to, operation.toAmount)
        if (!replaced.ok) return { type: 'fail', errorKey: 'log.actionFail' }
        if (replaced.flow) children.push(replaced.flow)
      } else if (operation.kind === 'remove-top') {
        if (!slot?.stack || slot.stack.remaining < operation.amount) return { type: 'fail', errorKey: 'log.actionFail' }
        const removed = mutations.remove({ fieldId: field.id, slot: slot.index }, operation.amount)
        if (!removed.ok) return { type: 'fail', errorKey: 'log.actionFail' }
        if (removed.flow) children.push(removed.flow)
      } else {
        for (const discardSlot of [...field.slots].reverse()) for (const _layer of discardSlot.layers) {
          const removed = mutations.remove({ fieldId: field.id, slot: discardSlot.index })
          if (!removed.ok) return { type: 'fail', errorKey: 'log.actionFail' }
          if (removed.flow) children.push(removed.flow)
        }
      }
    }
    if (operation.kind === 'remove-top' && context.sourceCard) {
      const gain: Partial<Resource> = {}
      for (const key of REAL_RESOURCE_KEYS) if (operation.gain[key]) gain[key] = operation.gain[key]! * selected.length
      if (Object.keys(gain).length) children.push(gainLeaf(context.sourceCard, gain))
    }
    const flow = operation.kind === 'discard-all' && children.length > 1 ? { type: 'parallel' as const, children } : sequence(children)
    return flow ? { type: 'flow', flow, extraData: validation.extraData } : validation
  },
}
