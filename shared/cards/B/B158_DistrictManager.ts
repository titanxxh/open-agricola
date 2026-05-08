import { gainLeaf } from '../helpers/pay-gain-node'
import { spaceHasPlayer } from '../../domain/space'
import type { CardImpl } from '../registry'
import { B158_DistrictManager } from '../../cards-display/B/B158_DistrictManager'

const CARD_ID = B158_DistrictManager.id

export const B158_DistrictManager_impl = {
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
