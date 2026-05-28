import type { ActionSpace, GameState, PlayerState } from '../../contract/types'
import type { DraftGameEvent, EventSink } from '../../contract/events'
import type { Trade } from '../../contract/types'
import { runCardListeners } from '../../cards/card-listeners'
import { executeImmediateSpecialEffectFlows } from './internal/immediate-special-effect-flow'

export const dispatchTradeAppliedListener = (
  state: GameState,
  player: PlayerState,
  trade: Trade,
  times: number,
  eventSink?: EventSink,
  transactionEvents: readonly DraftGameEvent[] = [],
): void => {
  if (times <= 0) return
  const sourceId = trade.sourceId ?? trade.source ?? null
  if (!sourceId) return
  const space = {} as ActionSpace
  const results = runCardListeners({
    state,
    player,
    space,
    actionId: 'trade-applied',
    phase: 'immediatelyAfter',
    extraData: { sourceId, times },
    transactionEvents,
  })
  executeImmediateSpecialEffectFlows({ state, player, space, eventSink, results })
}
