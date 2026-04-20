import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
const CARD_ID = 'D94_HenpeckedHusband'

// D94 Henpecked Husband: Each time you take a Build Rooms action with the second person
// you place, return the first person you placed home, unless it is on the Meeting Place action space.
// BGA: complex — requires returning first farmer. Requires tracking placed farmers and a
// special return-farmer action. Currently not fully implementable; registering listener as stub.
const listener: CardListenerRegistration = {
  id: 'D94-henpecked-husband-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    // Not implemented: requires returning first placed farmer home which is not yet supported.
  },
}

export const D94_HenpeckedHusband = new Occupation({
  id: CARD_ID,
  name: "Henpecked Husband",
  deck: "D",
  number: 94,
  category: "ACTIONS_BOOSTER",
  desc: ["Each time you take a __Build Rooms__ action with the second person you place, return the first person you placed home, unless it is on the __Meeting Place__ action space."],
  cost: {},
  players: "1+",
})

export const D94_HenpeckedHusband_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
