import { defineMajorCard } from '../card-source'
import type { CardSourceMetaInput } from '../card-source'
import type { CardListenerRegistration } from '../card-listeners'
import type { CardImpl } from '../registry'
import { discountCardCostCandidate } from '../../actions/payment/internal'
import type { ActionHookPhase } from '../../actions/hooks'

const CARD_ID = 'Major_Moor_MuseumOfTheMoors'
const FORESTERS_LODGE = 'Major_Moor_ForestersLodge'

const discountByTarget = {
  Major_Well: 'stone',
  Major_Well2: 'stone',
  Major_Joinery: 'wood',
  Major_Joinery2: 'wood',
  Major_Pottery: 'clay',
  Major_Pottery2: 'clay',
  Major_Basket: 'reed',
  Major_Basket2: 'reed',
  Major_ClayOven: 'clay',
  Major_ClayOven2: 'clay',
  Major_StoneOven: 'stone',
  Major_StoneOven2: 'stone',
  [FORESTERS_LODGE]: 'clay',
} as const

const museumCostListener: CardListenerRegistration = {
  id: 'moor-museum-of-the-moors-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  deriveCardCostCandidate: (context, candidate) => {
    if (context.state.enableFarmersOfTheMoor !== true) return null
    if (!context.cardId) return null
    const resource = discountByTarget[context.cardId as keyof typeof discountByTarget]
    if (!resource) return null
    return discountCardCostCandidate(candidate, CARD_ID, { [resource]: 1 })
  },
}

export const Major_Moor_MuseumOfTheMoors = defineMajorCard({
  meta: {
    id: CARD_ID,
    name: 'Museum of the Moors',
    deck: 'major',
    number: 108,
    cost: { clay: 1, reed: 1, stone: 1 },
    vp: 3,
    extraVp: false,
    requiresFarmersOfTheMoor: true,
    desc: [
      'Selected major improvements cost you 1 fewer matching building resource.',
    ],
  } satisfies CardSourceMetaInput,
  impl: {
    listeners: [museumCostListener],
    reaches: Object.keys(discountByTarget),
  } satisfies CardImpl,
})
