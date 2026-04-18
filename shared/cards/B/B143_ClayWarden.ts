import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B143_ClayWarden'

/**
 * B143 Clay Warden (Occupation, B, 143)
 * Each time another player uses the Hollow accumulation space,
 * card owner gets 1 clay.
 *
 * scope 'opponent' — fires when an opponent uses hollow-4 (the Hollow space).
 * Players 3+.
 */
const HOLLOW_SPACES = new Set(['hollow-4'])

const listener: CardListenerRegistration = {
  id: 'B143-clay-warden-opponent-hollow',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!HOLLOW_SPACES.has(context.space?.id ?? '')) return
    const playerCount = context.state.players?.length ?? 2
    const gain: { clay: number; food?: number } = { clay: 1 }
    if (playerCount === 3) gain.clay = 2
    if (playerCount === 4) gain.food = 1
    return { flow: gainLeaf(CARD_ID, gain), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const B143_ClayWarden = new Occupation({
  id: CARD_ID,
  name: 'Clay Warden',
  deck: 'B',
  number: 143,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time another player uses the __Hollow__ accumulation space, you get 1 <CLAY>. In a 3-/4-player game, you also get 1 additional <CLAY>/<FOOD>.',
  ],
  cost: {},
  players: '3+',
  newSet: true,
})
