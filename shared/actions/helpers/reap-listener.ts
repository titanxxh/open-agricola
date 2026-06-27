import type { ActionFlow, ActionSpace, GameState, PlayerState } from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { runCardListeners } from '../../cards/card-listeners'

export type ReapTrigger = {
  phase: string
  actionId?: string
  cardId?: string
}

export type ReapListenerOptions = {
  trigger?: ReapTrigger
  sourceCard?: string
}

export const defaultReapTrigger = (): ReapTrigger => ({ phase: 'harvest' })

export const dispatchReapListener = (
  state: GameState,
  player: PlayerState,
  crop: 'grain' | 'vegetable' | 'wood' | 'stone',
  amount: number,
  _eventSink?: EventSink,
  options: ReapListenerOptions = {},
): ActionFlow | undefined => {
  if (amount <= 0) return
  const trigger = options.trigger ?? defaultReapTrigger()
  const space = {} as ActionSpace
  const context = {
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
  } as const
  const children = (runCardListeners(context, undefined, { stampFlowOwner: true }) ?? [])
    .map((result) => result.flow)
    .filter((flow): flow is ActionFlow => Boolean(flow))
  if (children.length === 0) return
  return { type: 'parallel', children }
}
