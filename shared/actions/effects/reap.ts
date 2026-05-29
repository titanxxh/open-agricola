import type { ActionExecutionResult, ActionFlow, GameState, HarvestReapSummary, PlayerState } from '../../contract/types'
import type { ActionSpace } from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { fieldTopStack } from '../../domain/field'
import { runCardListeners } from '../../cards/card-listeners'
import type { ActionHookResult } from '../hooks'
import { computeHarvestCount } from '../helpers/harvest-count-registry'

export type ReapHarvestCount = {
  count: number
  sources?: string[]
  tags?: string[]
  scope?: 'top-stack' | 'field'
}

export type ReapTrigger = {
  phase: string
  actionId?: string
  cardId?: string
}

export type ReapOptions = {
  trigger?: ReapTrigger
  sourceCard?: string
  harvestCounts?: Record<string, ReapHarvestCount>
}

const defaultReapTrigger = (): ReapTrigger => ({ phase: 'harvest' })

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

/**
 * Dispatch a 'reap' synthetic action event to card listeners.
 * Called after base field reap and after each extra-reap card produces crops.
 */
export const dispatchReapListener = (
  state: GameState,
  player: PlayerState,
  crop: 'grain' | 'vegetable' | 'wood' | 'stone',
  amount: number,
  _eventSink?: EventSink,
  options: ReapOptions = {},
): ActionFlow | undefined => {
  if (amount <= 0) return
  const trigger = options.trigger ?? defaultReapTrigger()
  const space = {} as ActionSpace
  const results = runCardListeners({
    state,
    player,
    space,
    actionId: 'reap',
    phase: 'immediatelyAfter',
    extraData: {
      crop,
      amount,
      trigger,
      ...(options.sourceCard ? { sourceCard: options.sourceCard } : {}),
    },
  }) ?? []
  const children = results
    .map((result: ActionHookResult) => result.flow)
    .filter((flow): flow is ActionFlow => Boolean(flow))
  if (children.length === 0) return
  return { type: 'parallel', children }
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
