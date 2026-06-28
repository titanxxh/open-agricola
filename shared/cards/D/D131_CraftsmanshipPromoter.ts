import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardListenerRegistration } from '../card-listeners'
import { readImprovementTypes } from '../../actions/effects/improvement'
import type { ActionHookPhase } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D131_CraftsmanshipPromoter'
/**
 * BGA bottom-row major candidates injected by D131 into the
 * Minor Improvement action. Source: bga-agricola
 * modules/php/Actions/Improvement.php (D131 case in getBuyableCards).
 */
const D131_BOTTOM_ROW_MAJORS = [
  'Major_ClayOven',
  'Major_StoneOven',
  'Major_Joinery',
  'Major_Pottery',
  'Major_Basket',
] as const

const choiceCandidateListener: CardListenerRegistration = {
  id: 'D131-craftsmanship-promoter-compute-choice-candidates',
  cardIds: [CARD_ID],
  actions: ['improvement'],
  phases: ['computeChoiceCandidates' as ActionHookPhase],
  handler: (ctx) => {
    const types = readImprovementTypes(ctx)
    if (types.length !== 1 || types[0] !== 'minor') return
    if (!ctx.player.occupationPlayed.includes(CARD_ID)) return
    const available = ctx.state.availableMajorImprovements ?? []
    const extraOptions: ActionChoiceOption[] = D131_BOTTOM_ROW_MAJORS
      .filter((id) => available.includes(id))
      .map((id) => ({
        value: id,
        labelKey: `improvements.${id}.name`,
        sourceCard: CARD_ID,
      }))
    if (extraOptions.length === 0) return
    return { extraOptions, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { stone: 1 }),
  },
  listeners: [choiceCandidateListener],
  reaches: [...D131_BOTTOM_ROW_MAJORS] as readonly string[],
} satisfies CardImpl

export const D131_CraftsmanshipPromoter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Craftsmanship Promoter',
    deck: 'D',
    number: 131,
    category: 'ACTIONS_BOOSTER',
    desc: ['When you play this card, you immediately get 1 <STONE>. You can build any of the major improvements in the bottom row of the supply board even when taking a __Minor Improvement__ action.'],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const D131_CraftsmanshipPromoter_impl = D131_CraftsmanshipPromoter.impl
