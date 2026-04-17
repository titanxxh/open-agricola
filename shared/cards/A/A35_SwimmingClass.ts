import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { spaceHasPlayer } from '../../game/space'

const CARD_ID = 'A35_SwimmingClass'

// A35 Swimming Class: In the returning home phase of each round, if you return a person
// from the Fishing accumulation space, you get 2 bonus VP for each newborn you return home.
registerCardEffect({
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    // Check if this player has a farmer on the Fishing space
    const fishingSpace = state.actionSpaces.find((s) => s.id === 'fishing')
    if (!fishingSpace || !spaceHasPlayer(fishingSpace, player.id)) return
    const newborns = player.newbornCount ?? 0
    if (newborns <= 0) return
    // 2 bonus VP per newborn
    const vpChildren: import('../../game/types').ActionFlow[] = Array.from(
      { length: newborns * 2 },
      () => ({ type: 'leaf' as const, actionId: 'bonus-vp', sourceCard: CARD_ID }),
    )
    return { type: 'seq', children: vpChildren }
  },
})

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
