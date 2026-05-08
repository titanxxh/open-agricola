import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import {
  getStableTilesBuiltThisAction,
  readActionSnapshotToken,
} from '../helpers/action-snapshot'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { D166_StableMilker } from '../../cards-display/D/D166_StableMilker'
export { D166_StableMilker }

const CARD_ID = D166_StableMilker.id

const USED_ACTION_TOKEN_KEY = 'usedActionToken'

/**
 * D166 Stable Milker
 * Each time you build at least 2 stables on the same turn, you also get 1 cattle.
 *
 * BGA: tracks stables built per turn via numStablesBuiltThisTurn.
 * Uses setUsedOnTurnId / usableThisTurn to fire only once per turn.
 *
 * In open-agricola we use getStableTilesBuiltThisAction from action-snapshot
 * and track used action token so it fires only once per action.
 */

const tryGainCattle = (
  player: CardListenerContext['player'],
): ActionHookResult | void => {
  const actionToken = readActionSnapshotToken(player)
  if (actionToken === undefined) return
  if (getStableTilesBuiltThisAction(player) < 2) return
  if (readCardExtraData<number>(player, CARD_ID, USED_ACTION_TOKEN_KEY) === actionToken) return

  writeCardExtraData(player, CARD_ID, USED_ACTION_TOKEN_KEY, actionToken)
  return { flow: gainLeaf(CARD_ID, { cattle: 1 }), sourceCard: CARD_ID }
}

const listener: CardListenerRegistration = {
  id: 'D166-stable-milker-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    return tryGainCattle(context.player)
  },
}

export const D166_StableMilker_impl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const result = tryGainCattle(player)
    return result?.flow
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
