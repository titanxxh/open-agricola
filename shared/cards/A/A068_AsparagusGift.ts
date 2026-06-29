import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { readCardExtraData } from '../helpers/card-state'
import { getFenceCount } from '../../actions/effects/fencing'
import { fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'A068_AsparagusGift'
const FENCES_BEFORE_KEY = 'fencesBefore'

const beforeListener: CardListenerRegistration = {
  id: 'A68-asparagus-gift-before-fencing',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    return {
      flow: {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: {
          kind: 'set-extra-data',
          key: FENCES_BEFORE_KEY,
          value: getFenceCount(context.player),
        },
      },
      sourceCard: CARD_ID,
    }
  },
}

const afterListener: CardListenerRegistration = {
  id: 'A68-asparagus-gift-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const fencesBefore = readCardExtraData<number>(context.player, CARD_ID, FENCES_BEFORE_KEY) ?? 0
    const fencesBuilt = getFenceCount(context.player) - fencesBefore
    if (fencesBuilt < context.state.round) return
    return { flow: gainLeaf(CARD_ID, { vegetable: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [beforeListener, afterListener],
  prerequisiteCheck: (player) => player.fields.some(fieldIsEmpty),
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A068_AsparagusGift = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Asparagus Gift',
    deck: 'A',
    number: 68,
    category: 'CROP_PROVIDER',
    desc: ['Each time you build a number of fences equal to or greater than the current round, you immediately get 1 <VEGETABLE>.'],
    cost: {},
    prerequisite: '1 Unplanted Field',
  },
  impl: cardImpl,
})

export const A068_AsparagusGift_impl = A068_AsparagusGift.impl
