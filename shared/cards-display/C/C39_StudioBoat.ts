import { PlayerActionCard } from '../types'

const CARD_ID = 'C39_StudioBoat'

export const C39_StudioBoat = new PlayerActionCard({
  id: CARD_ID,
  name: 'Studio Boat',
  deck: 'C',
  number: 39,
  category: 'POINTS_PROVIDER',
  desc: [
    'Each time you use the __Traveling Players__ accumulation space, you also get 1 bonus <SCORE>. In games with 1-3 players, this card is considered __Traveling Players__ (same effect as __Fishing__).',
  ],
  cost: { wood: 1 },
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
})
