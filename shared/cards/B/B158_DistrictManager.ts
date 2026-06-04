import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'

const CARD_ID = 'B158_DistrictManager'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBeforeReturnHome: (state, player) => {
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    const grove = state.actionSpaces.find((s) => s.id === 'grove')
    if (!forest || !grove) return
    if (!spaceHasPlayer(forest, player.id) || !spaceHasPlayer(grove, player.id)) return
    return gainLeaf(CARD_ID, { food: 5 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B158_DistrictManager = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'District Manager',
    deck: 'B',
    number: 158,
    category: 'FOOD_PROVIDER',
    desc: ['At the end of each work phase, if you used both the __Forest__ and __Grove__ accumulation spaces, you get 5 <FOOD>.'],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const B158_DistrictManager_impl = B158_DistrictManager.impl
