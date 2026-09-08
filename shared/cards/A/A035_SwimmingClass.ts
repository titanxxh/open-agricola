import { defineMinorCard } from '../card-source'
import { getReturnHomePlacements } from '../helpers/round-placement'
import { newbornCount } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'A035_SwimmingClass'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (state, player) => {
    if (!getReturnHomePlacements(state).some((entry) =>
      entry.spaceId === 'fishing' && entry.playerId === player.id && entry.disposition !== 'remove-from-game',
    )) return
    const newborns = newbornCount(player)
    if (newborns <= 0) return
    // 2 bonus VP per newborn
    const vpChildren: import('../../contract/types').ActionFlow[] = Array.from(
      { length: newborns * 2 },
      () => ({ type: 'leaf' as const, actionId: 'bonus-vp', sourceCard: CARD_ID }),
    )
    return { type: 'seq', children: vpChildren }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A035_SwimmingClass = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Swimming Class',
    deck: 'A',
    number: 35,
    category: 'POINTS_PROVIDER',
    desc: ['In the returning home phase of each round, if you return a person from the __Fishing__ accumulation space, you get 2 bonus <SCORE> for each newborn that you return home.'],
    cost: { food: 1 },
    prerequisite: '2 Occupations',
    occupationPrerequisites: { min: 2 },
    extraVp: true,
  },
  impl: cardImpl,
})

export const A035_SwimmingClass_impl = A035_SwimmingClass.impl
