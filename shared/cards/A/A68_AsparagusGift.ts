import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { writeCardExtraData, readCardExtraData } from '../helpers/card-state'
import { getFenceCount } from '../../actions/effects/fencing'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import { fieldIsEmpty } from '../../game/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'A68_AsparagusGift'

// BGA isBuyable: countEmptyLogicalFields() == 0 → false (require >= 1 empty field)
registerPrerequisite('1 Unplanted Field', (player) => player.fields.some(fieldIsEmpty))
const FENCES_BEFORE_KEY = 'fencesBefore'

// A68 Asparagus Gift: Each time you build a number of fences equal to or greater than
// the current round, you immediately get 1 vegetable.
// BGA checks: count($event['fences']) >= Globals::getTurn()

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

export const A68_AsparagusGift = new MinorImprovement({
  id: CARD_ID,
  name: 'Asparagus Gift',
  deck: 'A',
  number: 68,
  category: 'CROP_PROVIDER',
  desc: ['Each time you build a number of fences equal to or greater than the current round, you immediately get 1 <VEGETABLE>.'],
  cost: {},
  prerequisite: '1 Unplanted Field',
  newSet: true,
})

export const A68_AsparagusGift_impl = {
  listeners: [beforeListener, afterListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
