import { countRoomAnimals } from '../../domain/animals'
import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { GameState, PlayerState } from '../../contract/types'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import {
  hasBuiltStableThisTurn,
} from '../helpers/action-snapshot'
import type { CardImpl } from '../registry'
import { isUsedThisTurn, markUsedThisTurnLeaf } from '../helpers/turn-token'

const CARD_ID = 'A043_FarmyardManure'

const queueFoodNextThree = (state: GameState, player: PlayerState) => {
  if (!hasBuiltStableThisTurn(player) || isUsedThisTurn(player, CARD_ID)) return
  const mark = markUsedThisTurnLeaf(player, CARD_ID)
  if (!mark) return

  return {
    type: 'seq' as const,
    children: [
      mark,
      futureMeeplesNode({
        cardId: CARD_ID,
        playerId: player.id,
        startRound: state.round + 1,
        count: 3,
        resources: { food: 1 },
      }),
    ],
  }
}

const listener: CardListenerRegistration = {
  id: 'A43-farmyard-manure-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
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
      (animal) => animal.animalCount > 0,
    ).length
    const inHouse = countRoomAnimals(player)
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
