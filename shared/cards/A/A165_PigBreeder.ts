import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { breedLeaf } from '../../actions/effects/breed'
import { playerBoard } from '../../domain'
import type { CardImpl } from '../registry'

const CARD_ID = 'A165_PigBreeder'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, _player) => gainLeaf(CARD_ID, { boar: 1 }),
    onAfterRoundEnd: (state, player) => {
      if (state.round !== 12) return
      if (player.resources.boar < 2) return
      const idx = state.players.indexOf(player)
      const animals = playerBoard(state, idx).animals
      const free = animals.totalCapacity() - animals.countAnimals()
      if (free <= 0) return
      return breedLeaf(CARD_ID, ['boar'])
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A165_PigBreeder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Pig Breeder',
    deck: 'A',
    number: 165,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['When you play this card, you immediately get 1 <PIG>. Your <PIG> breed at the end of round 12 (if there is room for the new <PIG>).'],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const A165_PigBreeder_impl = A165_PigBreeder.impl
