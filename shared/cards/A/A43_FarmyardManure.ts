import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { GameState, PlayerState } from '../../contract/types'
import {
  queueFutureMeeplesFlow,
} from '../../actions/effects/internal/future-meeples'
import {
  getStableTilesBuiltThisAction,
  readActionSnapshotToken,
} from '../helpers/action-snapshot'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { A43_FarmyardManure } from '../../cards-display/A/A43_FarmyardManure'

const CARD_ID = A43_FarmyardManure.id

const USED_ACTION_TOKEN_KEY = 'usedActionToken'

const queueFoodNextThree = (state: GameState, player: PlayerState) => {
  const actionToken = readActionSnapshotToken(player)
  if (actionToken === undefined) return
  if (getStableTilesBuiltThisAction(player) < 1) return
  if (readCardExtraData<number>(player, CARD_ID, USED_ACTION_TOKEN_KEY) === actionToken) return

  writeCardExtraData(player, CARD_ID, USED_ACTION_TOKEN_KEY, actionToken)
  return queueFutureMeeplesFlow(state, {
    cardId: CARD_ID,
    playerId: player.id,
    startRound: state.round + 1,
    count: 3,
    resources: { food: 1 },
  })
}

const listener: CardListenerRegistration = {
  id: 'A43-farmyard-manure-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.trueAction === false) return
    const flow = queueFoodNextThree(context.state, context.player)
    if (!flow) return
    return { flow, sourceCard: CARD_ID }
  },
}

export const A43_FarmyardManure_impl = {
  listeners: [listener],
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => queueFoodNextThree(state, player),
},
  prerequisiteCheck: (player) => {
    const inStables = Object.values(player.stableAnimals ?? {}).filter(
      (animal) => animal !== null,
    ).length
    const inHouse = player.houseAnimalCount ?? 0
    const inPastures = (player.pastures ?? []).reduce(
      (sum, pasture) => sum + (pasture.animalCount ?? 0),
      0,
    )
    return inStables + inHouse + inPastures >= 1
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
