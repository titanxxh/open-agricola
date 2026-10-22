import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A107_Catcher'
const isBuildingResourceSpace = (space: CardListenerContext['space']): boolean =>
  (space.gainPerRound?.wood ?? 0) > 0 ||
  (space.gainPerRound?.clay ?? 0) > 0 ||
  (space.gainPerRound?.reed ?? 0) > 0 ||
  (space.gainPerRound?.stone ?? 0) > 0

const countBuildingResources = (space: CardListenerContext['space']): number =>
  (space.resources?.wood ?? 0) +
  (space.resources?.clay ?? 0) +
  (space.resources?.reed ?? 0) +
  (space.resources?.stone ?? 0)

const listener: CardListenerRegistration = {
  id: 'A107-catcher-before-space',
  cardIds: [CARD_ID],
  phases: ['before'],
  actionSpaces: 'all',
  requiresNewPlacement: true,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isBuildingResourceSpace(context.space)) return
    const placed = context.actionSpaceUse?.personUse?.placementOrdinal
    const n = countBuildingResources(context.space)
    if (
      (placed === 1 && n === 5) ||
      (placed === 2 && n === 4) ||
      (placed === 3 && n === 3)
    ) {
      return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A107_Catcher = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Catcher',
    deck: 'A',
    number: 107,
    category: 'FOOD_PROVIDER',
    desc: ['Each time you place your 1st/2nd/3rd person in a round on a building resource accumulation space with exactly 5/4/3 building resources, you get 1 <FOOD>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const A107_Catcher_impl = A107_Catcher.impl
