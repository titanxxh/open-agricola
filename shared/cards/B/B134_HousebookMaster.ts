import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B134_HousebookMaster'
const listener: CardListenerRegistration = {
  id: 'B134-housebook-master-after-renovation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Check that renovation was to stone
    if (context.player.houseType !== 'stone') return
    const round = context.state.round
    let n = 0
    if (round <= 11) {
      n = 3
    } else if (round === 12) {
      n = 2
    } else if (round === 13) {
      n = 1
    }
    if (n <= 0) return
    const bonusVpLeaves: ActionFlow[] = Array.from({ length: n }, () => ({
      type: 'leaf' as const,
      actionId: 'bonus-vp',
      sourceCard: CARD_ID,
    }))
    return {
      flow: {
        type: 'seq',
        children: [
          gainLeaf(CARD_ID, { food: n }),
          ...bonusVpLeaves,
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

export const B134_HousebookMaster = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Housebook Master',
    deck: 'B',
    number: 134,
    category: 'POINTS_PROVIDER',
    desc: ['After playing this card, if you renovate to stone in round 13/12/11 or before, you immediately get 1/2/3 <FOOD> and 1/2/3 bonus <SCORE>.'],
    cost: {},
    players: '3+',
    extraVp: true,
  },
  impl: cardImpl,
})

export const B134_HousebookMaster_impl = B134_HousebookMaster.impl
