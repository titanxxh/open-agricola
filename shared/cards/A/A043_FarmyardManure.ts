import { defineMinorCard } from '../card-source'
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

const CARD_ID = 'A043_FarmyardManure'
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

const cardImpl = {
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

export const A043_FarmyardManure = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Farmyard Manure',
    deck: 'A',
    number: 43,
    category: 'FOOD_PROVIDER',
    desc: [
        'Each time you build 1 or more <STABLE> in one turn, you place 1 <FOOD> on each of the next 3 round spaces. At the start of these rounds, you get the <FOOD>.',
      ],
    cost: {},
    prerequisite: '1 Animal',
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const A043_FarmyardManure_impl = A043_FarmyardManure.impl
