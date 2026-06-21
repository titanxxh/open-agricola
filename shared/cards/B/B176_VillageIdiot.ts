import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getMinorImprovement } from '../registry-display'
import type { CardImpl } from '../registry'

const CARD_ID = 'B176_VillageIdiot'

const loneOccupationListener: CardListenerRegistration = {
  id: 'B176-village-idiot-lone-occupation',
  cardIds: [CARD_ID],
  actions: ['occupation', 'improvement'],
  phases: ['isDoable' as ActionHookPhase],
  zones: ['hand', 'played'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.actionId === 'occupation' && context.choice === CARD_ID) {
      const hasOtherOccupation = context.player.occupationPlayed.some((id) => id !== CARD_ID)
      if (hasOtherOccupation || (context.player.extraOccupationsFromCards?.length ?? 0) > 0) {
        return { doable: false }
      }
      return
    }
    if (context.player.occupationPlayed.includes(CARD_ID)) {
      if (context.actionId === 'improvement') {
        const minor = typeof context.choice === 'string' ? getMinorImprovement(context.choice) : undefined
        if (!minor?.providesOccupation) return
      }
      return { doable: false }
    }
  },
}

const opponentMeetingPlaceListener: CardListenerRegistration = {
  id: 'B176-village-idiot-opponent-meeting-place',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'meeting-place') return
    const ownerId = context.ownerPlayer?.id
    if (!ownerId) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'gain',
        params: { wood: 1, food: 1, recipientPlayerId: ownerId },
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [loneOccupationListener, opponentMeetingPlaceListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B176_VillageIdiot = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Village Idiot',
    deck: 'B',
    number: 176,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['The Village Idiot is your lone occupation. Each time another player uses the "Meeting Place" action space, you get 1 wood and 1 food.'],
    cost: {},
    prerequisite: 'No Occupations',
    occupationPrerequisites: { max: 0 },
    players: '5+',
  },
  impl: cardImpl,
})

export const B176_VillageIdiot_impl = B176_VillageIdiot.impl
