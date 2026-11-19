import type { ActionHookRegistry } from '../hooks'
import type { ActionDefinition, ActionExecutionResult, ActionFlow, GameState, HarvestReapSummary, PlayerState } from '../../contract/types'
import { incCounter } from '../../cards/helpers/card-state'
import type { EventSink } from '../../contract/events'
import { fieldTopStack } from '../../domain/field'
import { computeHarvestCount } from '../helpers/harvest-count-registry'
import { getLogicalFields, mutateLogicalFields, cardFieldHarvestDestination } from '../../cards/helpers/card-field'
import {
  defaultReapTrigger,
  dispatchReapListeners,
  type ReapListenerOptions,
  type ReapTrigger,
  type ReapReceipt,
} from '../helpers/reap-listener'

export { dispatchReapListeners, type ReapTrigger } from '../helpers/reap-listener'

export type ReapHarvestCount = {
  count: number
  sources?: string[]
  tags?: string[]
  scope?: 'top-stack' | 'field'
}

export type ReapOptions = ReapListenerOptions & {
  harvestCounts?: Record<string, ReapHarvestCount>
}

const fieldKey = (row: number, col: number) => `${row}-${col}`

const appendHarvestedPosition = (
  reapSummary: HarvestReapSummary,
  row: number,
  col: number,
) => {
  if (reapSummary.harvestedPositions?.some((pos) => pos.row === row && pos.col === col)) return
  reapSummary.harvestedPositions!.push({ row, col })
}

const appendHarvestedCrop = (
  reapSummary: HarvestReapSummary,
  row: number,
  col: number,
  crop: 'grain' | 'vegetable' | 'wood' | 'stone' | 'reed',
  amount: number,
  sources: string[],
) => {
  if (amount <= 0) return
  const existing = reapSummary.harvestedCrops!.find((entry) =>
    entry.row === row && entry.col === col && entry.crop === crop,
  )
  if (existing) {
    existing.amount += amount
    existing.sources = [...new Set([...existing.sources, ...sources])]
    return
  }
  reapSummary.harvestedCrops!.push({ row, col, crop, amount, sources })
}

const appendHarvestCountApplication = (
  reapSummary: HarvestReapSummary,
  row: number,
  col: number,
  crop: 'grain' | 'vegetable' | 'wood' | 'stone' | 'reed',
  count: number,
  sources: string[],
  tags: string[],
  scope: 'top-stack' | 'field',
) => {
  const existing = reapSummary.harvestCountApplications!.find((entry) =>
    entry.row === row && entry.col === col && entry.crop === crop && entry.scope === scope,
  )
  if (existing) {
    existing.count += count
    existing.sources = [...new Set([...existing.sources, ...sources])]
    existing.tags = [...new Set([...existing.tags, ...tags])]
    return
  }
  reapSummary.harvestCountApplications!.push({ row, col, crop, count, sources, tags, scope })
}

export const reap = (
  state: GameState,
  player: PlayerState,
  eventSink?: EventSink,
  options: ReapOptions = {},
  actionHooks?: ActionHookRegistry,
): ActionExecutionResult & {
  reapSummary: HarvestReapSummary
  emptiedFields: string[]
  emptiedFieldCrops: Record<string, NonNullable<ReturnType<typeof fieldTopStack>>['kind']>
  reactionFlow?: ActionFlow
} => {
  const trigger = options.trigger ?? defaultReapTrigger()
  const reapedFieldIds = new Set<string>()
  const removedKinds: Record<string, NonNullable<ReturnType<typeof fieldTopStack>>['kind']> = {}
  const reapSummary: HarvestReapSummary = {
    resources: {},
    grainFields: 0,
    vegetableFields: 0,
    harvestedCrops: [],
    harvestCountApplications: [],
    harvestedPositions: [],
  }
  const reapedCropAmounts: Partial<Record<'grain' | 'vegetable' | 'wood' | 'stone' | 'reed', number>> = {}
  const countedFieldCrops = new Set<string>()
  const reactionChildren: ActionFlow[] = []
  const ownerReactionChildren: ActionFlow[] = []
  const ownerCallbacks: Array<() => ActionFlow | undefined> = []
  const appendReactionFlow = (flow: ActionFlow | undefined, children = reactionChildren) => {
    if (!flow) return
    if (flow.type === 'parallel') {
      children.push(...flow.children)
      return
    }
    children.push(flow)
  }
  const mutations = mutateLogicalFields(state, player, {
    sourceCard: options.sourceCard,
    reason: 'reap',
    trigger,
    emitEvents: false,
    deferOwnerCallbacks: true,
  })
  for (const logicalField of getLogicalFields(player)) {
    const occupiedSlots = logicalField.slots.filter((slot) => slot.stack !== null)
    if (occupiedSlots.length === 0) continue
    const slots = occupiedSlots.flatMap((slot) => slot.layers.map((stack, layerIndex) => ({
      ...slot,
      stack,
      layerIndex,
      key: `${slot.index}:${layerIndex}`,
      top: layerIndex === slot.layers.length - 1,
    })))
    const field = {
      row: logicalField.row,
      col: logicalField.col,
      stacks: logicalField.stacks.map((stack) => ({ ...stack })),
    }
    const override = options.harvestCounts?.[fieldKey(field.row, field.col)]
    const harvestCount = override ?? computeHarvestCount(state, player, field, {
      baseCount: logicalField.kind === 'card' ? occupiedSlots.length : 1,
      logicalField,
    })
    let remainingCount = Math.max(0, Math.floor(harvestCount.count))
    const sources = harvestCount.sources?.length ? harvestCount.sources : ['base']
    const tags = harvestCount.tags ?? []
    const scope = harvestCount.scope ?? 'top-stack'
    const supplyInsteadOfField = tags.includes('supply-instead-of-field') && !tags.includes('full-field-reap')
    const planned = new Map<string, number>()
    const suppliedTop = supplyInsteadOfField ? fieldTopStack(field) : undefined
    const suppliedSlot = suppliedTop?.kind === 'grain' && suppliedTop.remaining > 0
      ? slots.at(-1)
      : undefined
    if (suppliedSlot?.stack) {
      appendHarvestCountApplication(
        reapSummary,
        suppliedSlot.tile.row,
        suppliedSlot.tile.col,
        suppliedSlot.stack.kind,
        0,
        sources,
        tags,
        scope,
      )
    }
    if (remainingCount === 0 && tags.length > 0) {
      const top = slots.at(-1)
      if (top?.stack && top.stack.remaining > 0) {
        appendHarvestCountApplication(
          reapSummary,
          top.tile.row,
          top.tile.col,
          top.stack.kind,
          0,
          sources,
          tags,
          scope,
        )
      }
    }
    const orderedSlots = logicalField.kind === 'card'
      ? [...slots].sort((a, b) => a.index - b.index || b.layerIndex - a.layerIndex)
      : [...slots].reverse()
    const available = (slot: typeof slots[number]) => Math.max(
      0,
      slot.stack.remaining - (slot.key === suppliedSlot?.key ? 1 : 0) - (planned.get(slot.key) ?? 0),
    )
    const allocate = (slot: typeof slots[number], limit = remainingCount) => {
      const amount = Math.min(available(slot), remainingCount, limit)
      if (amount <= 0) return
      planned.set(slot.key, (planned.get(slot.key) ?? 0) + amount)
      remainingCount -= amount
    }
    if (logicalField.kind === 'card' && scope !== 'field') {
      orderedSlots.filter((slot) => slot.top).forEach((slot) => allocate(slot, 1))
    }
    orderedSlots.forEach((slot) => allocate(slot))

    for (const slot of orderedSlots) {
      const amount = planned.get(slot.key) ?? 0
      if (amount <= 0 || !slot.stack) continue
      const removed = mutations.remove({ fieldId: logicalField.id, slot: slot.index }, amount)
      if (!removed.ok || !removed.crop) {
        throw new Error(`[reap] failed to persist ${logicalField.id} slot ${slot.index}`)
      }
      const kind = removed.crop
      const cropEvent = {
        location: logicalField.kind === 'card'
          ? { kind: 'card' as const, playerId: player.id, cardId: logicalField.sourceCard! }
          : { kind: 'field' as const, playerId: player.id, row: field.row, col: field.col },
        crop: kind,
        amount,
      }
      if (logicalField.sourceCard && cardFieldHarvestDestination(logicalField.sourceCard) === 'bonus-vp') {
        incCounter(player, logicalField.sourceCard, 'bonusVp', amount)
        eventSink?.emit<'farm.cropRemoved'>({
          type: 'farm.cropRemoved', crops: [cropEvent],
          sourceCardId: logicalField.sourceCard, reason: 'reap', trigger,
        })
        eventSink?.emit<'card.stateChanged'>({
          type: 'card.stateChanged', cardId: logicalField.sourceCard,
          key: 'bonusVp', targetPlayerId: player.id,
        })
        if (removed.ownerCallback) ownerCallbacks.push(removed.ownerCallback)
        continue
      }
      reapedFieldIds.add(logicalField.id)
      removedKinds[logicalField.id] = kind
      player.resources[kind] = (player.resources[kind] ?? 0) + amount
      reapSummary.resources[kind] = (reapSummary.resources[kind] ?? 0) + amount
      reapedCropAmounts[kind] = (reapedCropAmounts[kind] ?? 0) + amount
      const countedFieldCropKey = `${logicalField.id}-${kind}`
      if (kind === 'grain') {
        if (!countedFieldCrops.has(countedFieldCropKey)) {
          reapSummary.grainFields += 1
          countedFieldCrops.add(countedFieldCropKey)
        }
      } else if (kind === 'vegetable') {
        if (!countedFieldCrops.has(countedFieldCropKey)) {
          reapSummary.vegetableFields += 1
          countedFieldCrops.add(countedFieldCropKey)
        }
      }
      appendHarvestedCrop(reapSummary, slot.tile.row, slot.tile.col, kind, amount, sources)
      appendHarvestCountApplication(reapSummary, slot.tile.row, slot.tile.col, kind, amount, sources, tags, scope)
      appendHarvestedPosition(reapSummary, logicalField.row, logicalField.col)
      eventSink?.emit<'farm.cropRemoved'>({
        type: 'farm.cropRemoved',
        sourceCardId: logicalField.sourceCard ?? options.sourceCard,
        crops: [cropEvent],
        reason: 'reap',
        trigger,
      })
      eventSink?.emit<'resource.moved'>({
        type: 'resource.moved',
        resources: { [kind]: amount },
        from: cropEvent.location,
        to: { kind: 'player', playerId: player.id },
        reason: 'reap',
        trigger,
        sourceCardId: logicalField.sourceCard ?? options.sourceCard,
      })
      if (removed.ownerCallback) ownerCallbacks.push(removed.ownerCallback)
    }
  }

  const emptiedFields = getLogicalFields(player)
    .filter(field => reapedFieldIds.has(field.id) && field.stacks.every(stack => stack.remaining <= 0))
    .map(field => field.id)
  const emptiedFieldCrops = Object.fromEntries(emptiedFields.map(id => [id, removedKinds[id]!]))
  appendReactionFlow(dispatchReapListeners(state, player, reapedCropAmounts, { ...options, emptiedFields, emptiedFieldCrops }, actionHooks))
  for (const ownerCallback of ownerCallbacks) {
    appendReactionFlow(ownerCallback(), ownerReactionChildren)
  }
  reactionChildren.push(...ownerReactionChildren)

  return {
    type: 'ok',
    reapSummary,
    emptiedFields,
    emptiedFieldCrops,
    ...(reactionChildren.length > 0 ? { reactionFlow: { type: 'parallel' as const, children: reactionChildren } } : {}),
  }
}

const appendFlowChildren = (children: ActionFlow[], flow: ActionFlow | undefined) => {
  if (!flow) return
  if (flow.type === 'parallel') {
    children.push(...flow.children)
    return
  }
  children.push(flow)
}

const readActionTrigger = (
  actionContext: Record<string, unknown> | undefined,
  sourceCard: string | undefined,
): ReapTrigger => {
  const raw = actionContext?.trigger
  const trigger = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const phase = typeof trigger.phase === 'string' ? trigger.phase : 'harvest'
  return {
    phase,
    ...(typeof trigger.actionId === 'string' ? { actionId: trigger.actionId } : {}),
    ...(typeof trigger.cardId === 'string'
      ? { cardId: trigger.cardId }
      : sourceCard
        ? { cardId: sourceCard }
        : {}),
  }
}

export const reapAction: ActionDefinition = {
  id: 'reap',
  nameKey: 'actions.reap.name',
  descriptionKey: 'actions.reap.description',
  previewEffect: ({ actionContext, sourceCard }) => ({ kind: 'harvestFields', privatePhase: readActionTrigger(actionContext, sourceCard).phase === 'private-field-phase' }),
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) =>
    getLogicalFields(player).some((field) => field.stacks.length > 0),
  execute: ({ state, player, sourceCard, actionContext, eventSink, actionHooks }) => {
    const trigger = readActionTrigger(actionContext, sourceCard)
    if (!reapAction.canBeExecutedByPlayer(state, player, { actionHooks, sourceCard, actionContext })) {
      return { type: 'fail', errorKey: 'log.action' }
    }

    const options: ReapOptions = { trigger, sourceCard, afterCompletion: 'action' }
    const result = reap(state, player, eventSink, options, actionHooks)
    const reactionChildren: ActionFlow[] = []
    appendFlowChildren(reactionChildren, result.reactionFlow)

    const extraData = {
      reapSummary: result.reapSummary,
      reapedCropAmounts: result.reapSummary.resources,
      emptiedFields: result.emptiedFields,
      emptiedFieldCrops: result.emptiedFieldCrops,
      trigger,
      sourceCard,
    } satisfies ReapReceipt & { reapSummary: HarvestReapSummary }
    if (reactionChildren.length > 0) {
      return { type: 'flow', flow: { type: 'parallel', children: reactionChildren }, extraData }
    }
    return {
      type: 'ok',
      resourcesGained: result.reapSummary.resources,
      extraData,
    }
  },
}
