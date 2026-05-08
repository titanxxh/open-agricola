import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { GameState, PlayerState } from '../../contract/types'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import {
  getRoomsBuiltThisAction,
  readActionSnapshotToken,
} from '../helpers/action-snapshot'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'A111_WallBuilder'
const USED_ACTION_TOKEN_KEY = 'usedActionToken'

// A111 Wall Builder: Each time you build at least 1 room, place 1 FOOD on
// each of the next 4 round spaces. At the start of these rounds, you get the FOOD.

const queueFoodNextFour = (state: GameState, player: PlayerState) => {
  const actionToken = readActionSnapshotToken(player)
  if (actionToken === undefined) return
  if (getRoomsBuiltThisAction(player) < 1) return
  if (readCardExtraData<number>(player, CARD_ID, USED_ACTION_TOKEN_KEY) === actionToken) return

  writeCardExtraData(player, CARD_ID, USED_ACTION_TOKEN_KEY, actionToken)
  return queueFutureMeeplesFlow(state, {
    cardId: CARD_ID,
    playerId: player.id,
    startRound: state.round + 1,
    count: 4,
    resources: { food: 1 },
  })
}

const listener: CardListenerRegistration = {
  id: 'A111-wall-builder-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const flow = queueFoodNextFour(context.state, context.player)
    if (!flow) return
    return { flow, sourceCard: CARD_ID }
  },
}

export const A111_WallBuilder = new Occupation({
  id: CARD_ID,
  name: 'Wall Builder',
  deck: 'A',
  number: 111,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you build at least 1 room, you can place 1 <FOOD> on each of the next 4 round spaces. At the start of these rounds, you get the <FOOD>.',
  ],
  cost: {},
  players: '1+',
})

export const A111_WallBuilder_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
