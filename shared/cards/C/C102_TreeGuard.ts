import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { returnToSpaceThenGainFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C102_TreeGuard'

// C102 Tree Guard: Each time after you use a wood accumulation space,
// you can place 4 WOOD from your supply on that space to get 2 STONE, 1 CLAY, 1 REED, and 1 GRAIN.
const listener: CardListenerRegistration = {
  id: 'C102-tree-guard-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gainPerRound = context.space?.gainPerRound ?? {}
    if ((gainPerRound.wood ?? 0) <= 0) return
    return returnToSpaceThenGainFlow({
      cardId: CARD_ID,
      cost: { wood: 4 },
      gain: { stone: 2, clay: 1, reed: 1, grain: 1 },
    })
  },
}

export const C102_TreeGuard = new Occupation({
  id: CARD_ID,
  name: 'Tree Guard',
  deck: 'C',
  number: 102,
  category: 'GOODS_PROVIDER',
  desc: [
    'Each time after you use a wood accumulation space, you can place 4 <WOOD> from your supply on that space to get 2 <STONE>, 1 <CLAY>, 1 <REED>, and 1 <GRAIN>.',
  ],
  cost: {},
  players: '1+',
  newSet: true,
})

export const C102_TreeGuard_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
