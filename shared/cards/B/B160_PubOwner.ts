import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../domain/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'B160_PubOwner'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { grain: 1 }),
  onBeforeReturnHome: (state, _player) => {
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (!forest || !clayPit || !reedBank) return
    if (!isSpaceOccupied(forest) || !isSpaceOccupied(clayPit) || !isSpaceOccupied(reedBank)) return
    return gainLeaf(CARD_ID, { grain: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B160_PubOwner = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Pub Owner',
    deck: 'B',
    number: 160,
    category: 'CROP_PROVIDER',
    desc: [
        'When you play this card and at the end of each work phase in which the __Forest__, __Clay Pit__, and __Reed Bank__ accumulation spaces are all occupied, you get 1 <GRAIN>.',
      ],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const B160_PubOwner_impl = B160_PubOwner.impl
