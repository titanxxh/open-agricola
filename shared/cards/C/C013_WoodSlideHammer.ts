import { defineMinorCard } from '../card-source'
import { buildRenovationPlan, canRenovate } from '../../actions/effects/renovation'
import type { CardListenerRegistration } from '../card-listeners'
import type { BonusModifier } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C013_WoodSlideHammer'

const choiceCandidateListener: CardListenerRegistration = {
  id: 'C13-wood-slide-hammer-stone-target',
  cardIds: [CARD_ID],
  phases: ['computeChoiceCandidates'],
  actions: ['renovate-house'],
  handler: ({ player }) => {
    if (player.houseType !== 'wood' || player.rooms < 5) return
    return { extraOptions: [{ value: 'stone', labelKey: 'ui.interactionRenovateToStone', sourceCard: CARD_ID }] }
  },
}

export const C013_WoodSlideHammer = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Wood Slide Hammer',
    deck: 'C',
    number: 13,
    category: 'FARM_PLANNER',
    desc: ['On your first renovation, if you have at least 5 wood rooms, you can renovate to <STONE> directly and you get a discount of 2 <STONE> on the renovation cost.'],
    cost: { wood: 1 },
  },
  impl: {
  listeners: [choiceCandidateListener, {
    id: 'C13-wood-slide-hammer-stone-isdoable',
    cardIds: [CARD_ID],
    phases: ['isDoable'],
    actions: ['renovate-house'],
    handler: ({ player, doable }) => {
      if (doable || player.houseType !== 'wood' || player.rooms < 5) return
      if (!canRenovate(player, undefined, buildRenovationPlan(player, 'stone'))) return
      return { doable: true }
    },
  }],
  modifiers: [{
        type: 'bonus',
        cardId: CARD_ID,
        appliesTo: ['renovation'],
        discount: { stone: 2 },
        optional: false,
        conditions: { houseTypeWood: 1, minNumRooms: 5 },
      } as BonusModifier],
} satisfies CardImpl,
})

export const C013_WoodSlideHammer_impl = C013_WoodSlideHammer.impl
