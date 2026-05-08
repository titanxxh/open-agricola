import { gainLeaf } from '../helpers/pay-gain-node'
import { breedLeaf } from '../../actions/effects/breed'
import { playerBoard } from '../../domain'
import type { CardImpl } from '../registry'
import { A165_PigBreeder } from '../../cards-display/A/A165_PigBreeder'
export { A165_PigBreeder }

const CARD_ID = A165_PigBreeder.id

export const A165_PigBreeder_impl = {
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
