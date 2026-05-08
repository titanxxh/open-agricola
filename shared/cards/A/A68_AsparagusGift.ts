import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { writeCardExtraData, readCardExtraData } from '../helpers/card-state'
import { getFenceCount } from '../../actions/effects/fencing'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import { fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'
import { A68_AsparagusGift } from '../../cards-display/A/A68_AsparagusGift'
export { A68_AsparagusGift }

const CARD_ID = A68_AsparagusGift.id

registerPrerequisite('1 Unplanted Field', (player) => player.fields.some(fieldIsEmpty))

const FENCES_BEFORE_KEY = 'fencesBefore'

const beforeListener: CardListenerRegistration = {
  id: 'A68-asparagus-gift-before-fencing',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    writeCardExtraData(context.player, CARD_ID, FENCES_BEFORE_KEY, getFenceCount(context.player))
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

export const A68_AsparagusGift_impl = {
  listeners: [beforeListener, afterListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
