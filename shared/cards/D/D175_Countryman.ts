import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { buildSowFarmInteraction } from '../../domain/farmyard'
import type { CardImpl } from '../registry'

const CARD_ID = 'D175_Countryman'
const PRINTED_RENOVATION_ACTION_SPACE_IDS = new Set(['house-redevelopment', 'farm-redevelopment'])

const canSowOneField = (context: CardListenerContext): boolean => {
  const farm = buildSowFarmInteraction(context.ownerPlayer ?? context.player, {
    minSelections: 1,
    maxSelections: 1,
  })
  return farm.farmType === 'sow' && farm.selectableFields.length > 0
}

const listener: CardListenerRegistration = {
  id: 'D175-countryman-after-action-space-renovation',
  cardIds: [CARD_ID],
  actions: ['renovate-house'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const ownerId = context.ownerPlayer?.id
    if (!ownerId) return
    const fromRenovationActionSpace =
      PRINTED_RENOVATION_ACTION_SPACE_IDS.has(context.space?.id ?? '') ||
      context.actionContext?.renovationActionSpace === true
    if (!fromRenovationActionSpace) return
    if (!canSowOneField(context)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'sow',
        sourceCard: CARD_ID,
        optional: true,
        targetPlayerId: ownerId,
        actionContext: { minSelections: 1, maxSelections: 1, trueAction: false },
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D175_Countryman = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Countryman',
    deck: 'D',
    number: 175,
    category: 'CROP_PROVIDER',
    desc: ['Each time any player (including you) takes a "Renovation" action on an action space, you can sow crops in exactly 1 field.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const D175_Countryman_impl = D175_Countryman.impl
