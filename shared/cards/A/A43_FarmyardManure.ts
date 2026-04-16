import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { GameState, PlayerState } from '../../game/types'
import {
  queueFutureMeeplesFlow,
} from '../../actions/effects/future-meeples'
import {
  getStableTilesBuiltThisAction,
  readActionSnapshotToken,
} from '../helpers/action-snapshot'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { registerPrerequisite } from '../helpers/prerequisite-registry'

const CARD_ID = 'A43_FarmyardManure'
const USED_ACTION_TOKEN_KEY = 'usedActionToken'

// A43 Farmyard Manure: Each time you build 1 or more stables in one turn,
// place 1 FOOD on each of the next 3 round spaces.
// Ruling: OFFTURN_STABLES_DONT_TRIGGER — stables built off-turn (e.g., from
// opponent trigger) do not fire. We enforce this by checking trueAction.
// Prerequisite: 1 Animal.

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

// If a player buys this card after already building a stable this turn, fire immediately.
registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => queueFoodNextThree(state, player),
})

const listener: CardListenerRegistration = {
  id: 'A43-farmyard-manure-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (context.trueAction === false) return
    const flow = queueFoodNextThree(context.state, context.player)
    if (!flow) return
    return { flow, sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

// Prerequisite: the player must have at least 1 animal on their farm.
registerPrerequisite('1 Animal', (player) => {
  const inStables = Object.values(player.stableAnimals ?? {}).filter(
    (animal) => animal !== null,
  ).length
  const inHouse = player.houseAnimalCount ?? 0
  const inPastures = (player.pastures ?? []).reduce(
    (sum, pasture) => sum + (pasture.animalCount ?? 0),
    0,
  )
  return inStables + inHouse + inPastures >= 1
})

export const A43_FarmyardManure = new MinorImprovement({
  id: CARD_ID,
  name: 'Farmyard Manure',
  deck: 'A',
  number: 43,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you build 1 or more stables in one turn, you place 1 <FOOD> on each of the next 3 round spaces. At the start of these rounds, you get the <FOOD>.',
  ],
  cost: {},
  prerequisite: '1 Animal',
  evenMoreSet: true,
})
