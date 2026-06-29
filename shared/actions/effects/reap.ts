import type { ActionDefinition, ActionExecutionResult, ActionFlow, GameState, HarvestReapSummary, PlayerState } from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { fieldIsEmpty, fieldTopStack } from '../../domain/field'
import { computeHarvestCount } from '../helpers/harvest-count-registry'
import { hasAnyCardFieldCrops, reapAllCardFields } from '../../cards/helpers/card-field'
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
  const appendReactionFlow = (flow: ActionFlow | undefined) => {
    if (!flow) return
    if (flow.type === 'parallel') {
      reactionChildren.push(...flow.children)
      return
    }
    reactionChildren.push(flow)
  }
  player.fields.forEach((field) => {
    const override = options.harvestCounts?.[fieldKey(field.row, field.col)]
    const harvestCount = override ?? computeHarvestCount(state, player, field)
    let remainingCount = Math.max(0, Math.floor(harvestCount.count))
    const sources = harvestCount.sources?.length ? harvestCount.sources : ['base']
    const tags = harvestCount.tags ?? []
    const scope = harvestCount.scope ?? 'top-stack'
    const supplyInsteadOfField = tags.includes('supply-instead-of-field') && !tags.includes('full-field-reap')
    let suppliedTopStackIndex = -1
    const suppliedTop = supplyInsteadOfField ? fieldTopStack(field) : undefined
    if (suppliedTop?.kind === 'grain' && suppliedTop.remaining > 0) {
      suppliedTopStackIndex = field.stacks.length - 1
      appendHarvestCountApplication(reapSummary, field.row, field.col, suppliedTop.kind, 0, sources, tags, scope)
    }
    if (remainingCount === 0 && tags.length > 0) {
      const top = fieldTopStack(field)
      if (top && top.remaining > 0) {
        appendHarvestCountApplication(reapSummary, field.row, field.col, top.kind, 0, sources, tags, scope)
      }
    }
    for (let stackIndex = field.stacks.length - 1; remainingCount > 0 && stackIndex >= 0; stackIndex -= 1) {
      const stack = field.stacks[stackIndex]
      if (!stack || stack.remaining <= 0) continue
      const kind = stack.kind
      const suppliedAmount = stackIndex === suppliedTopStackIndex ? 1 : 0
      const harvestableAmount = Math.max(0, stack.remaining - suppliedAmount)
      if (harvestableAmount <= 0) continue
      const amount = Math.min(harvestableAmount, remainingCount)
      const cropEvent = {
        location: { kind: 'field' as const, playerId: player.id, row: field.row, col: field.col },
        crop: kind,
        amount,
      }
      player.resources[kind] = (player.resources[kind] ?? 0) + amount
      reapSummary.resources[kind] = (reapSummary.resources[kind] ?? 0) + amount
      reapedCropAmounts[kind] = (reapedCropAmounts[kind] ?? 0) + amount
      const countedFieldCropKey = `${field.row}-${field.col}-${kind}`
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
      appendHarvestedCrop(reapSummary, field.row, field.col, kind, amount, sources)
      appendHarvestCountApplication(reapSummary, field.row, field.col, kind, amount, sources, tags, scope)
      appendHarvestedPosition(reapSummary, field.row, field.col)
      stack.remaining -= amount
      remainingCount -= amount
      if (stack.remaining <= 0) field.stacks.splice(stackIndex, 1)
      eventSink?.emit<'farm.cropRemoved'>({
        type: 'farm.cropRemoved',
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
      })
    }
  })

  if ((reapedCropAmounts.grain ?? 0) > 0) {
    appendReactionFlow(dispatchReapListener(state, player, 'grain', reapedCropAmounts.grain!, eventSink, options))
  }
  if ((reapedCropAmounts.vegetable ?? 0) > 0) {
    appendReactionFlow(dispatchReapListener(state, player, 'vegetable', reapedCropAmounts.vegetable!, eventSink, options))
  }
  if ((reapedCropAmounts.stone ?? 0) > 0) {
    appendReactionFlow(dispatchReapListener(state, player, 'stone', reapedCropAmounts.stone!, eventSink, options))
  }

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

const canReapOrdinaryFields = (player: PlayerState): boolean =>
  player.fields.some((field) => !fieldIsEmpty(field))

const isPrivateFieldTrigger = (trigger: ReapTrigger) =>
  trigger.phase === 'private-field-phase'

export const reapAction: ActionDefinition = {
  id: 'reap',
  nameKey: 'actions.reap.name',
  descriptionKey: 'actions.reap.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player, context) => {
    const trigger = readActionTrigger(context?.actionContext, context?.sourceCard)
    return canReapOrdinaryFields(player) || (isPrivateFieldTrigger(trigger) && hasAnyCardFieldCrops(player))
  },
  execute: ({ state, player, sourceCard, actionContext, eventSink }) => {
    const trigger = readActionTrigger(actionContext, sourceCard)
    if (!reapAction.canBeExecutedByPlayer(state, player, { sourceCard, actionContext })) {
      return { type: 'fail', errorKey: 'log.action' }
    }

    const result = reap(state, player, eventSink, { trigger, sourceCard })
    const reactionChildren: ActionFlow[] = []
    appendFlowChildren(reactionChildren, result.reactionFlow)
    if (isPrivateFieldTrigger(trigger)) {
      appendFlowChildren(
        reactionChildren,
        reapAllCardFields(state, player, {
          trigger,
          sourceCard,
          eventSink,
          updateHarvestSummary: false,
        }),
      )
    }

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
