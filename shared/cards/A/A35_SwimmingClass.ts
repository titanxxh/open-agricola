import { MinorImprovement } from '../types'
import { spaceHasPlayer } from '../../game/space'
import { newbornCount } from '../../game/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'A35_SwimmingClass'

export const A35_SwimmingClass = new MinorImprovement({
  id: CARD_ID,
  name: 'Swimming Class',
  deck: 'A',
  number: 35,
  category: 'POINTS_PROVIDER',
  desc: ['In the returning home phase of each round, if you return a person from the __Fishing__ accumulation space, you get 2 bonus <SCORE> for each newborn that you return home.'],
  cost: { food: 1 },
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  newSet: true,
})

export const A35_SwimmingClass_impl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    // Check if this player has a farmer on the Fishing space
    const fishingSpace = state.actionSpaces.find((s) => s.id === 'fishing')
    if (!fishingSpace || !spaceHasPlayer(fishingSpace, player.id)) return
    const newborns = newbornCount(player)
    if (newborns <= 0) return
    // 2 bonus VP per newborn
    const vpChildren: import('../../game/types').ActionFlow[] = Array.from(
      { length: newborns * 2 },
      () => ({ type: 'leaf' as const, actionId: 'bonus-vp', sourceCard: CARD_ID }),
    )
    return { type: 'seq', children: vpChildren }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
