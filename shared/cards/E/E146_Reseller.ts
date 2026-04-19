import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { getMinorImprovementCard } from '../catalog'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E146_Reseller'

// E146 Reseller: Once this game, immediately after playing or building an improvement,
// you can choose to get its printed cost from the general supply.
const listener: CardListenerRegistration = {
  id: 'E146-reseller-immediately-after-improvement',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    const choice = context.choice ?? ''
    const builtId = choice.replace(/^major:/, '').replace(/^minor:/, '')
    if (!builtId) return
    const card = getMinorImprovementCard(builtId)
    if (!card) return
    const allCosts = [card.cost, ...(card.altCosts ?? [])].filter(
      (c): c is NonNullable<typeof c> => !!c && Object.keys(c).length > 0,
    )
    if (allCosts.length === 0) return
    const gainChildren = allCosts.map((cost) => gainLeaf(CARD_ID, cost))
    if (gainChildren.length === 0) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
          gainChildren.length === 1
            ? gainChildren[0]!
            : { type: 'xor', children: gainChildren },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const E146_Reseller = new Occupation({
  id: CARD_ID,
  name: 'Reseller',
  deck: 'E',
  number: 146,
  category: 'BUILDING_RESOURCES_ALL',
  desc: [
    'Once this game, immediately after playing or building an improvement, you can choose to get its printed cost from the general supply.',
  ],
  cost: {},
  players: '3+',
})
