import { defineOccupationCard } from '../card-source'
import type { CardImpl } from '../registry'
import { writeCardExtraData, readCardExtraData } from '../helpers/card-state'

const CARD_ID = 'A127_Lodger'

const cardImpl = {
  effect: {
    id: CARD_ID,
  onBuy: (state, player) => { if (state.round <= 9) writeCardExtraData(player, CARD_ID, 'hasRoom', true) },
  computeExtraRoomCapacity: player => readCardExtraData<unknown>(player, CARD_ID, 'hasRoom') === true ? 1 : 0,
  timedRules: [{ key: 'room-expires', at: { kind: 'rounds', rounds: [9], phase: 'onStartReturnHome' }, body: { kind: 'condition', condition: { kind: 'extra-room-active', fact: 'hasRoom' }, body: { kind: 'operation', operation: { kind: 'expire-extra-room', fact: 'hasRoom', removeUnhousedWorker: true } } } }],
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A127_Lodger = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Lodger',
    deck: 'A',
    number: 127,
    category: 'FARM_PLANNER',
    desc: ['This card provides room for one person, but only until the returning home phase of round 9. If, by then, there is no room elsewhere for that person, remove it from play.'],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const A127_Lodger_impl = A127_Lodger.impl
