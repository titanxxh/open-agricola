import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import { sumActionSpaceMovedToTriggerPlayerFromSpace } from '../helpers/event-provenance'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { buildRenovationPlan } from '../../actions/effects/renovation'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C169_FastMason'
type RenovationMaterial = 'clay' | 'stone'

const collectedMaterial = (context: CardListenerContext): RenovationMaterial | null => {
  if (sumActionSpaceMovedToTriggerPlayerFromSpace(context, 'clay') > 0) return 'clay'
  if (sumActionSpaceMovedToTriggerPlayerFromSpace(context, 'stone') > 0) return 'stone'
  return null
}

const canPayNoReedRenovation = (context: CardListenerContext, material: RenovationMaterial): boolean => {
  const plan = buildRenovationPlan(context.player, material)
  if (!plan) return false
  return (context.player.resources[material] ?? 0) >= context.player.rooms
}

const listener: CardListenerRegistration = {
  id: 'C169-fast-mason-after-clay-stone-collect',
  cardIds: [CARD_ID],
  actions: ['collect'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const material = collectedMaterial(context)
    if (!material) return
    if (!canPayNoReedRenovation(context, material)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'renovate-house',
        sourceCard: CARD_ID,
        optional: true,
        params: { selectedOption: material },
        actionContext: { exactCost: { [material]: context.player.rooms } as Partial<Resource> },
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C169_FastMason = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Fast Mason',
    deck: 'C',
    number: 169,
    category: 'FARM_PLANNER',
    desc: ['Immediately after each time you use a clay/stone accumulation space, you can renovate your house to clay/stone without paying reed.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const C169_FastMason_impl = C169_FastMason.impl
