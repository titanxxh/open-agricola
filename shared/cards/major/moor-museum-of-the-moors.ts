import { defineMajorCard } from '../card-source'
import type { CardSourceMetaInput } from '../card-source'
import type { CardListenerRegistration } from '../card-listeners'
import type { CardImpl } from '../registry'
import { discountCardCostCandidate } from '../../actions/payment/internal'
import type { ActionHookPhase } from '../../actions/hooks'

const CARD_ID = 'Major_Moor_MuseumOfTheMoors'
const FORESTERS_LODGE = 'Major_Moor_ForestersLodge'

const discountTargets = new Set([
  'Major_Well',
  'Major_Well2',
  'Major_Joinery',
  'Major_Joinery2',
  'Major_Pottery',
  'Major_Pottery2',
  'Major_Basket',
  'Major_Basket2',
  'Major_ClayOven',
  'Major_ClayOven2',
  'Major_StoneOven',
  'Major_StoneOven2',
  FORESTERS_LODGE,
])
const buildingResources = ['wood', 'clay', 'reed', 'stone'] as const

const museumCostListener: CardListenerRegistration = {
  id: 'moor-museum-of-the-moors-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  deriveCardCostCandidate: (context, candidate) => {
    if (context.state.enableFarmersOfTheMoor !== true) return null
    if (!context.cardId || !discountTargets.has(context.cardId)) return null
    return buildingResources
      .map((resource) => discountCardCostCandidate(candidate, CARD_ID, { [resource]: 1 }))
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
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
    reaches: [...discountTargets] as readonly string[],
  } satisfies CardImpl,
})
