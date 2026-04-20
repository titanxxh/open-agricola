import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { initCardState } from '../__stubs__/helpers'
import { writeCardInfobox } from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'C148_MudWallower'

/**
 * C148 Mud Wallower:
 * Every fourth time you use an accumulation space, you get 1 PIG, held by this card.
 *
 * BGA: Tracks a counter and held pig count. On every farmer placement on an
 * accumulation space, increments counter. At 4, gains 1 pig and resets.
 * The card acts as an animal holder zone for pigs.
 *
 * Implementation:
 * - onBuy: initialize counter to 0, held to 0
 * - after place-farmer on accumulation space: increment counter, if >=4 gain pig
 * - onComputeAnimalZones: provide pig holder zone with capacity = held count
 */

const isAccumulationSpace = (context: CardListenerContext): boolean => {
  if (!context.space) return false
  const gainPerRound = context.space.gainPerRound ?? {}
  return Object.values(gainPerRound).some((v) => (v ?? 0) > 0)
}

const afterPlaceFarmerListener: CardListenerRegistration = {
  id: 'C148-mud-wallower-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isAccumulationSpace(context)) return

    const counters = initCardState(context.player, CARD_ID)
    counters.counter = (counters.counter ?? 0) + 1
    writeCardInfobox(context.player, CARD_ID, `${counters.counter % 4} / 4`)

    if (counters.counter >= 4) {
      counters.counter -= 4
      counters.held = (counters.held ?? 0) + 1
      writeCardInfobox(context.player, CARD_ID, `${counters.counter % 4} / 4`)
      return { flow: gainLeaf(CARD_ID, { boar: 1 }), sourceCard: CARD_ID }
    }
  },
}

export const C148_MudWallower = new Occupation({
  id: CARD_ID,
  name: 'Mud Wallower',
  deck: 'C',
  number: 148,
  category: 'FARM_PLANNER',
  desc: ['Every fourth time you use an accumulation space, you get 1 <PIG>, held by this card.'],
  cost: {},
  players: '4+',
  evenMoreSet: true,
  extraVp: true,
})

export const C148_MudWallower_impl = {
  listeners: [afterPlaceFarmerListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const counters = initCardState(player, CARD_ID)
    counters.counter = 0
    counters.held = 0
    writeCardInfobox(player, CARD_ID, '0 / 4')
  },
  onComputeAnimalZones: (player, zones) => {
    const held = player.cardStates?.[CARD_ID]?.counters?.held ?? 0
    if (held <= 0) return
    zones.push({
      id: `card:${CARD_ID}`,
      zoneType: 'card',
      capacity: held,
      animalType: 'boar',
      animalCount: 0,
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
