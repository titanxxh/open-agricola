import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B121_Geologist'

/**
 * B121 Geologist — Each time you use the Forest or Reed Bank accumulation space,
 * you also get 1 CLAY. In games with 3 or more players, this also applies to
 * the Clay Pit.
 *
 * BGA (B121_Geologist.php): isActionCardEvent for 'Forest', 'ReedBank', or
 * (3+ players) 'ClayPit' → onPlayerPlaceFarmer returns gainNode([CLAY => 1]).
 */
const listener: CardListenerRegistration = {
  id: 'B121-geologist-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId) return
    const playerCount = (context.state.players ?? []).length
    const triggers = spaceId === 'forest' ||
      spaceId === 'reed-bank' ||
      (spaceId === 'clay-pit' && playerCount >= 3)
    if (!triggers) return
    return { flow: gainLeaf(CARD_ID, { clay: 1 }), sourceCard: CARD_ID }
  },
}

export const B121_Geologist = new Occupation({
  id: CARD_ID,
  name: 'Geologist',
  deck: 'B',
  number: 121,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time you use the __Forest__ or __Reed Bank__ accumulation space, you also get 1 <CLAY>. In games with 3 or more players, this also applies to the __Clay Pit__.',
  ],
  cost: {},
  players: '1+',
})

export const B121_Geologist_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
