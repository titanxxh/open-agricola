import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import { getPrintedImprovementCostCandidates } from '../../actions/helpers/improvement-helpers'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E146_Reseller'
const listener: CardListenerRegistration = {
  id: 'E146-reseller-immediately-after-improvement',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    const choice = context.choice ?? ''
    const builtId = choice.replace(/^major:/, '').replace(/^minor:/, '')
    if (!builtId) return
    const allCosts = getPrintedImprovementCostCandidates(context.state, context.player, builtId).filter(
      (cost) => Object.keys(cost).length > 0 && !('stable' in cost) && !('fence' in cost),
    )
    if (allCosts.length === 0) return
    const gainChildren = allCosts.map((cost) => gainLeaf(CARD_ID, cost))
    if (gainChildren.length === 0) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
          gainChildren.length === 1
            ? gainChildren[0]!
            : { type: 'xor', children: gainChildren },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E146_Reseller = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Reseller',
    deck: 'E',
    number: 146,
    category: 'BUILDING_RESOURCES_-_ALL',
    desc: [
        'Once this game, immediately after playing or building an improvement, you can choose to get its printed cost from the general supply.',
      ],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const E146_Reseller_impl = E146_Reseller.impl
