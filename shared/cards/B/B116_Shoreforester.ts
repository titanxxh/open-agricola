import { defineOccupationCard } from '../card-source'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B116_Shoreforester'
const EMPTY_REED_BANK_ROUND = 'emptyReedBankRound'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { wood: 1 }),
  onBeforeStartOfTurn: (state, player) => {
    const reedBank = state.actionSpaces.find((space) => space.id === 'reed-bank')
    writeCardExtraData(
      player,
      CARD_ID,
      EMPTY_REED_BANK_ROUND,
      reedBank && (reedBank.resources.reed ?? 0) === 0 ? state.round : null,
    )
  },
  onRoundStart: (state, player) => {
    const emptyRound = readCardExtraData<number | null>(player, CARD_ID, EMPTY_REED_BANK_ROUND)
    writeCardExtraData(player, CARD_ID, EMPTY_REED_BANK_ROUND, null)
    if (emptyRound !== state.round) return
    const accumulatedOntoEmpty = state.events.some((event) =>
      event.type === 'action.accumulated' &&
      event.round === state.round &&
      event.phase === 'preparation' &&
      event.spaceId === 'reed-bank' &&
      event.resources.reed === 1 &&
      event.sourceCardId === undefined &&
      event.sourceActionId === undefined,
    )
    if (!accumulatedOntoEmpty) return
    return gainLeaf(CARD_ID, { wood: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B116_Shoreforester = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Shoreforester',
    deck: 'B',
    number: 116,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: [
        'When you play this card and each time 1 <REED> is placed on an empty __Reed Bank__ accumulation space in the preparation phase, you get 1 <WOOD>.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const B116_Shoreforester_impl = B116_Shoreforester.impl
