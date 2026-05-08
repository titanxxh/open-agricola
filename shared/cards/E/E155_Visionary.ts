import { Occupation } from '../types'
import type { CardImpl } from '../registry'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { familySize } from '../../domain/player'

const CARD_ID = 'E155_Visionary'

// E155 Visionary: You cannot grow your family until round 11, unless all other
// players already have. Initial familySize === 2; any opponent still at 2 means
// they have not grown.
const isDoableListener: CardListenerRegistration = {
  id: 'E155-visionary-isdoable-family-growth',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['family-growth'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.state.round >= 11) return
    const others = context.state.players.filter((p) => p.id !== context.player.id)
    const someoneNotGrown = others.some((p) => familySize(p) === 2)
    if (someoneNotGrown) return { doable: false }
  },
}

export const E155_Visionary = new Occupation({
  id: CARD_ID,
  name: 'Visionary',
  deck: 'E',
  number: 155,
  category: 'GOODS_-_GET',
  desc: ['If you play this card in round 4 or before, you get 1 <STONE>, 1 <VEGETABLE>, and 2 <PIG>. You cannot grow your family until round 11, unless all other players already have.'],
  players: '4+',
})

export const E155_Visionary_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => {
      if (state.round <= 4) {
        return {
          type: 'leaf' as const,
          actionId: 'gain',
          sourceCard: CARD_ID,
          params: { stone: 1, vegetable: 1, boar: 2 },
        }
      }
    },
  },
  listeners: [isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
