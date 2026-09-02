import type { ActionDefinition, ActionExecutionResult, ActionFlow, GameState, HarvestReapSummary, PlayerState } from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { fieldTopStack } from '../../domain/field'
import { computeHarvestCount } from '../helpers/harvest-count-registry'
import { getLogicalFields, mutateLogicalFields } from '../../cards/helpers/card-field'
import {
  defaultReapTrigger,
  dispatchReapListener,
  type ReapListenerOptions,
  type ReapTrigger,
} from '../helpers/reap-listener'

export { dispatchReapListener, type ReapTrigger } from '../helpers/reap-listener'

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
  crop: 'grain' | 'vegetable' | 'wood' | 'stone',
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
  crop: 'grain' | 'vegetable' | 'wood' | 'stone',
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
): ActionExecutionResult & { reapSummary: HarvestReapSummary; reactionFlow?: ActionFlow } => {
  const trigger = options.trigger ?? defaultReapTrigger()
  const reapSummary: HarvestReapSummary = {
    resources: {},
    grainFields: 0,
    vegetableFields: 0,
    harvestedCrops: [],
    harvestCountApplications: [],
    harvestedPositions: [],
  }
  const reapedCropAmounts: Partial<Record<'grain' | 'vegetable' | 'wood' | 'stone', number>> = {}
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
    const slots = logicalField.slots.filter((slot) => slot.stack !== null)
    if (slots.length === 0) continue
    const field = {
      row: logicalField.row,
      col: logicalField.col,
      stacks: slots.map((slot) => ({ ...slot.stack! })),
    }
    const override = options.harvestCounts?.[fieldKey(field.row, field.col)]
    const harvestCount = override ?? computeHarvestCount(state, player, field, {
      baseCount: logicalField.kind === 'card' ? slots.length : 1,
      logicalField,
    })
    let remainingCount = Math.max(0, Math.floor(harvestCount.count))
    const sources = harvestCount.sources?.length ? harvestCount.sources : ['base']
    const tags = harvestCount.tags ?? []
    const scope = harvestCount.scope ?? 'top-stack'
    const supplyInsteadOfField = tags.includes('supply-instead-of-field') && !tags.includes('full-field-reap')
    const planned = new Map<number, number>()
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
    const orderedSlots = logicalField.kind === 'card' ? slots : [...slots].reverse()
    const available = (slot: typeof slots[number]) => Math.max(
      0,
      slot.stack!.remaining - (slot.index === suppliedSlot?.index ? 1 : 0) - (planned.get(slot.index) ?? 0),
    )
    const allocate = (slot: typeof slots[number], limit = remainingCount) => {
      const amount = Math.min(available(slot), remainingCount, limit)
      if (amount <= 0) return
      planned.set(slot.index, (planned.get(slot.index) ?? 0) + amount)
      remainingCount -= amount
    }
    if (logicalField.kind === 'card' && scope !== 'field') {
      orderedSlots.forEach((slot) => allocate(slot, 1))
    }
    orderedSlots.forEach((slot) => allocate(slot))

    for (const slot of orderedSlots) {
      const amount = planned.get(slot.index) ?? 0
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

  for (const crop of ['grain', 'vegetable', 'wood', 'stone'] as const) {
    const amount = reapedCropAmounts[crop] ?? 0
    if (amount > 0) {
      appendReactionFlow(dispatchReapListener(state, player, crop, amount, eventSink, options))
    }
  }
  for (const ownerCallback of ownerCallbacks) {
    appendReactionFlow(ownerCallback(), ownerReactionChildren)
  }
  reactionChildren.push(...ownerReactionChildren)

  return {
    type: 'ok',
    reapSummary,
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
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) =>
    getLogicalFields(player).some((field) => field.stacks.length > 0),
  execute: ({ state, player, sourceCard, actionContext, eventSink }) => {
    const trigger = readActionTrigger(actionContext, sourceCard)
    if (!reapAction.canBeExecutedByPlayer(state, player, { sourceCard, actionContext })) {
      return { type: 'fail', errorKey: 'log.action' }
    }

    const result = reap(state, player, eventSink, { trigger, sourceCard })
    const reactionChildren: ActionFlow[] = []
    appendFlowChildren(reactionChildren, result.reactionFlow)

    if (reactionChildren.length > 0) {
      return { type: 'flow', flow: { type: 'parallel', children: reactionChildren } }
    }
    return {
      type: 'ok',
      resourcesGained: result.reapSummary.resources,
      extraData: { reapSummary: result.reapSummary },
    }
  },
}
