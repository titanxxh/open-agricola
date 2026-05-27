import type { ActionExecutionResult, ActionFlow, GameState, HarvestReapSummary, PlayerState } from '../../contract/types'
import type { ActionSpace } from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { fieldTopStack, fieldPopIfDepleted } from '../../domain/field'
import { runCardListeners } from '../../cards/card-listeners'
import type { ActionHookResult } from '../hooks'

export type ReapTrigger = {
  phase: string
  actionId?: string
  cardId?: string
}

export type ReapOptions = {
  trigger?: ReapTrigger
  sourceCard?: string
}

const defaultReapTrigger = (): ReapTrigger => ({ phase: 'harvest' })

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
    const top = fieldTopStack(field)
    if (!top || top.remaining <= 0) return
    const kind = top.kind
    const cropEvent = {
      location: { kind: 'field' as const, playerId: player.id, row: field.row, col: field.col },
      crop: kind,
      amount: 1,
    }
    player.resources[kind] = (player.resources[kind] ?? 0) + 1
    reapSummary.resources[kind] = (reapSummary.resources[kind] ?? 0) + 1
    if (kind === 'grain') {
      reapSummary.grainFields += 1
    } else if (kind === 'vegetable') {
      reapSummary.vegetableFields += 1
    } else if (kind === 'stone') {
      stoneFields += 1
    }
    reapSummary.harvestedPositions!.push({ row: field.row, col: field.col })
    top.remaining -= 1
    fieldPopIfDepleted(field)
    eventSink?.emit<'farm.cropRemoved'>({
      type: 'farm.cropRemoved',
      crops: [cropEvent],
      reason: 'reap',
      trigger,
    })
    eventSink?.emit<'resource.moved'>({
      type: 'resource.moved',
      resources: { [kind]: 1 },
      from: cropEvent.location,
      to: { kind: 'player', playerId: player.id },
      reason: 'reap',
      trigger,
    })
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
