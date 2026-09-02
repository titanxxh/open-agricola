import { defineMinorCard } from '../card-source'
import { FARM_COLS, FARM_ROWS, positionKey } from '../../domain/farm'
import type { CardImpl } from '../registry'
import { getFarmyardFields } from '../helpers/card-field'

const CARD_ID = 'D037_Sculpture'

const cardImpl = {
  prerequisiteCheck: (player, state) => {
    if (!state) return true
    const used = new Set<string>()
    player.roomTiles.forEach((tile) => used.add(positionKey(tile)))
    getFarmyardFields(player).forEach((field) =>
      used.add(positionKey(field)),
    )
    player.stableTiles.forEach((tile) => used.add(positionKey(tile)))
    player.pastures.forEach((pasture) =>
      pasture.tiles?.forEach((tile) => used.add(positionKey(tile))),
    )
    const unused = FARM_ROWS * FARM_COLS - used.size
    const roundsLeft = Math.max(0, 14 - (state.round ?? 1))
    return roundsLeft > unused
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D037_Sculpture = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Sculpture',
    deck: 'D',
    number: 37,
    category: 'POINTS_PROVIDER',
    desc: ['You can only play this card if there are more complete rounds left to play than you have unused farmyard spaces.'],
    cost: { stone: 1 },
    vp: 2,
    prerequisite: 'see below',
  },
  impl: cardImpl,
})

export const D037_Sculpture_impl = D037_Sculpture.impl
