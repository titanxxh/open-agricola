import type { ActionExecutionResult, ActionFlow, GameState, HarvestReapSummary, PlayerState } from '../../contract/types'
import type { ActionSpace } from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { fieldTopStack, fieldPopIfDepleted } from '../../domain/field'
import { runCardListeners } from '../../cards/card-listeners'
import type { ActionHookResult } from '../hooks'
import { computeHarvestCount } from '../helpers/harvest-count-registry'

export type ReapHarvestCount = {
  count: number
  sources?: string[]
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
    harvestedPositions: [],
  }
  let stoneFields = 0
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
    while (remainingCount > 0) {
      const top = fieldTopStack(field)
      if (!top || top.remaining <= 0) return
      const kind = top.kind
      const amount = Math.min(top.remaining, remainingCount)
      const cropEvent = {
        location: { kind: 'field' as const, playerId: player.id, row: field.row, col: field.col },
        crop: kind,
        amount,
      }
      player.resources[kind] = (player.resources[kind] ?? 0) + amount
      reapSummary.resources[kind] = (reapSummary.resources[kind] ?? 0) + amount
      if (kind === 'grain') {
        reapSummary.grainFields += amount
      } else if (kind === 'vegetable') {
        reapSummary.vegetableFields += amount
      } else if (kind === 'stone') {
        stoneFields += amount
      }
      appendHarvestedCrop(reapSummary, field.row, field.col, kind, amount, sources)
      appendHarvestedPosition(reapSummary, field.row, field.col)
      top.remaining -= amount
      remainingCount -= amount
      fieldPopIfDepleted(field)
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

  if (reapSummary.grainFields > 0) {
    appendReactionFlow(dispatchReapListener(state, player, 'grain', reapSummary.grainFields, eventSink, options))
  }
  if (reapSummary.vegetableFields > 0) {
    appendReactionFlow(dispatchReapListener(state, player, 'vegetable', reapSummary.vegetableFields, eventSink, options))
  }
  if (stoneFields > 0) {
    appendReactionFlow(dispatchReapListener(state, player, 'stone', stoneFields, eventSink, options))
  }

  return {
    type: 'ok',
    reapSummary,
    ...(reactionChildren.length > 0 ? { reactionFlow: { type: 'parallel' as const, children: reactionChildren } } : {}),
  }
}
