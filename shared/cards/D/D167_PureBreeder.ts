import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { canAccommodateAllAnimals } from '../../domain/animal-zones'
import { breedLeaf, canBreedAnimals } from '../../actions/effects/breed'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D167_PureBreeder'

const harvestRounds = [4, 7, 9, 11, 13, 14]

const BREEDABLE = ['sheep', 'boar', 'cattle'] as const

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 1 }),
  onAfterRoundEnd: (state, player) => {
    if (harvestRounds.includes(state.round)) return // harvest round — skip
    const children: ActionFlow[] = BREEDABLE
      .filter((t) => canBreedAnimals(state, player, { sourceCard: CARD_ID, animalTypes: [t] })
        && canAccommodateAllAnimals(state, player, [t]))
      .map((t) => breedLeaf(CARD_ID, [t]))
    if (children.length === 0) return
    return { type: 'xor', optional: true, children }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D167_PureBreeder = defineOccupationCard({
  meta: {
    id: "D167_PureBreeder",
    name: "Pure Breeder",
    deck: "D",
    number: 167,
    category: "LIVESTOCK_PROVIDER",
    desc: ["You immediately get 1 <WOOD>. After each round that does not end with a harvest, you can breed exactly one type of animal. (This is not considered a breeding phase.)"],
    cost: {},
    players: "4+",
  },
  impl: cardImpl,
})

export const D167_PureBreeder_impl = D167_PureBreeder.impl
